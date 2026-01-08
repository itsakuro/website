/* if anyone is reading this, this is all made with AI like idk anything about what this is doing and this is a GET key so its safe i think? */
const API_URL = 'https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=BoochySans&api_key=fb8acb70098630643d13070b58760262&format=json';
const ITUNES_SEARCH = 'https://itunes.apple.com/search';
const POLL_INTERVAL_MS = 10_000;
const FALLBACK = { song: 'Song', artist: 'Artist', image: '' };
const PREV_MAX = 3;

const artworkCache = new Map();
// when lyrics are found for a song, lock updates until the song changes
let lockedSongKey = null;

async function fetchAppleArtwork(artist = '', track = '') {
    const key = `${artist}::${track}`;
    if (artworkCache.has(key)) return artworkCache.get(key);

    try {
        const q = encodeURIComponent(`${artist} ${track}`.trim());
        const url = `${ITUNES_SEARCH}?term=${q}&entity=song&limit=1`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`iTunes ${res.status}`);
        const data = await res.json();
        const result = data.results && data.results[0];
        let artwork = result?.artworkUrl100 || '';
        if (!artwork) {
            artworkCache.set(key, '');
            return '';
        }

        // prefer larger artwork and try animated variants (webp/gif)
        let base = artwork.replace(/100x100bb/i, '600x600bb');
        const root = base.replace(/\.\w+(\?.*)?$/, '');
        const candidates = [
            `${root}.webp`,
            `${root}.gif`,
            `${root}.jpg`,
            base
        ];

        for (const candidate of candidates) {
            try {
                const r = await fetch(candidate, { cache: 'no-store' });
                if (!r.ok) continue;
                const ct = (r.headers.get('content-type') || '').toLowerCase();

                if (ct.includes('image/webp')) {
                    // attempt to detect animated WebP by searching for 'ANIM' chunk
                    try {
                        const buf = await r.arrayBuffer();
                        const bytes = new Uint8Array(buf);
                        const anim = [0x41, 0x4E, 0x49, 0x4D]; // 'ANIM'
                        let found = false;
                        for (let i = 0; i <= bytes.length - anim.length; i++) {
                            if (
                                bytes[i] === anim[0] &&
                                bytes[i + 1] === anim[1] &&
                                bytes[i + 2] === anim[2] &&
                                bytes[i + 3] === anim[3]
                            ) { found = true; break; }
                        }
                        // prefer an animated webp, but accept static webp as fallback
                        artworkCache.set(key, candidate);
                        return candidate;
                    } catch (err) {
                        artworkCache.set(key, candidate);
                        return candidate;
                    }
                } else if (ct.startsWith('image/')) {
                    artworkCache.set(key, candidate);
                    return candidate;
                }
            } catch (err) {
                continue;
            }
        }

        artworkCache.set(key, '');
        return '';
    } catch (err) {
        console.warn('fetchAppleArtwork failed:', err);
        artworkCache.set(key, '');
        return '';
    }
}

async function fetchNowPlaying() {
    try {
        const res = await fetch(API_URL, { cache: 'no-store', credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const tracks = data?.recenttracks?.track || [];
        const track = tracks[0];
        return {
            song: track?.name || FALLBACK.song,
            artist: track?.artist?.['#text'] || FALLBACK.artist,
            image: track?.image?.[3]?.['#text'] || FALLBACK.image,
            nowplaying: track?.['@attr']?.nowplaying === 'true',
            tracks // full array for previous songs
        };
    } catch (err) {
        console.error('nowplaying fetch failed:', err);
        return { ...FALLBACK, image: '', tracks: [] };
    }
}

async function fetchLrclibLyrics(artist = '', track = '') {
    try {
        const q = encodeURIComponent(`${artist} ${track}`.trim());
        const url = `https://lrclib.net/api/search?q=${q}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return '';
        const data = await res.json();

        if (!Array.isArray(data) || data.length === 0) return '';
        const rec = data[0];

        if (rec.plainLyrics) return rec.plainLyrics;
        if (rec.syncedLyrics) return rec.syncedLyrics;

        if (rec.id) {
            try {
                const r2 = await fetch(`https://lrclib.net/api/get/${rec.id}`, { cache: 'no-store' });
                if (r2.ok) {
                    const d2 = await r2.json();
                    return d2.plainLyrics || d2.syncedLyrics || '';
                }
            } catch (e) {
                // ignore
            }
        }

        return '';
    } catch (err) {
        console.warn('fetchLrclibLyrics failed:', err);
        return '';
    }
}

async function renderPreviousTracks(tracks = []) {
    const container = document.querySelector('.previousSongs#previousSongs');
    if (!container) return;
    // keep only up to PREV_MAX previous non-nowplaying tracks
    const prevTracks = tracks.filter(t => !(t?.['@attr']?.nowplaying === 'true')).slice(0, PREV_MAX);
    container.innerHTML = ''; // clear existing entries
    if (prevTracks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'noTracks';
        empty.textContent = 'No recent tracks';
        container.appendChild(empty);
        return;
    }

    // create entries and fetch artwork per entry
    await Promise.all(prevTracks.map(async (t, i) => {
        const title = t?.name || FALLBACK.song;
        const artist = t?.artist?.['#text'] || FALLBACK.artist;

        const entry = document.createElement('div');
        entry.className = 'songEntry';
        entry.dataset.index = String(i + 1);

        // fetch Apple Music artwork for this track
        const art = await fetchAppleArtwork(artist, title);

        const img = document.createElement('img');
        img.className = 'songCover';
        if (art) img.src = art;
        else img.alt = 'cover';

        const textWrap = document.createElement('div');
        textWrap.className = 'songText';

        const h1 = document.createElement('h1');
        h1.className = 'songTitle';
        h1.textContent = title;

        const h2 = document.createElement('h2');
        h2.className = 'songArtist';
        h2.textContent = artist;

        textWrap.appendChild(h1);
        textWrap.appendChild(h2);

        entry.appendChild(img);
        entry.appendChild(textWrap);

        container.appendChild(entry);
    }));
}

async function updateNowPlayingElements() {
    const state = await fetchNowPlaying();

    const currentKey = `${(state.artist||'').trim()}::${(state.song||'').trim()}`;
    // if locked on this same song, skip updating to avoid extra requests
    if (lockedSongKey && lockedSongKey === currentKey) return;
    // if locked but the song changed, clear the lock and continue
    if (lockedSongKey && lockedSongKey !== currentKey) lockedSongKey = null;

    // attempt to get Apple Music artwork for the current track
    const appleArt = await fetchAppleArtwork(state.artist, state.song);
    if (appleArt) state.image = appleArt;

    const nodes = document.querySelectorAll('.gridItem#nowplaying');
    nodes.forEach(node => {
        const songEl = node.querySelector('#songname');
        const artistEl = node.querySelector('#artist');
        if (songEl) songEl.textContent = state.song;
        if (artistEl) artistEl.textContent = state.artist;
        if (state.image) {
            node.style.backgroundImage = `url("${state.image}")`;
            node.style.backgroundSize = 'cover';
            node.style.backgroundPosition = 'center';
        } else {
            node.style.removeProperty('background-image');
        }
        if (state.nowplaying) node.classList.add('is-playing');
        else node.classList.remove('is-playing');
    });

    // populate previous tracks on the music page (or any page with .previousSongs)
    await renderPreviousTracks(state.tracks);

    // fetch and display lyrics (if the music page has a lyrics container)
    try {
        const lyricsEl = document.querySelector('#nowLyrics');
        if (lyricsEl) {
            lyricsEl.textContent = 'Loading lyrics...';
            const lyrics = await fetchLrclibLyrics(state.artist, state.song);
            if (lyrics) {
                lyricsEl.textContent = lyrics;
                // lock updates for this song until it changes
                lockedSongKey = `${(state.artist||'').trim()}::${(state.song||'').trim()}`;
            } else {
                lyricsEl.textContent = 'No lyrics found on LRCLIB.';
            }
        }
    } catch (err) {
        console.warn('updating lyrics failed:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateNowPlayingElements();
    setInterval(updateNowPlayingElements, POLL_INTERVAL_MS);
});
