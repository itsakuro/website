/* if anyone is reading this, this is all made with AI like idk anything about what this is doing and this is a GET key so its safe i think? */
const API_URL = 'https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=BoochySans&api_key=fb8acb70098630643d13070b58760262&format=json';
const ITUNES_SEARCH = 'https://itunes.apple.com/search';
const POLL_INTERVAL_MS = 10_000;
const FALLBACK = { song: 'Song', artist: 'Artist', image: '' };
const PREV_MAX = 6;

const artworkCache = new Map();

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
        if (artwork) {
            // prefer larger artwork
            artwork = artwork.replace(/100x100bb/i, '600x600bb');
        }
        artworkCache.set(key, artwork || '');
        return artwork || '';
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
}

document.addEventListener('DOMContentLoaded', () => {
    updateNowPlayingElements();
    setInterval(updateNowPlayingElements, POLL_INTERVAL_MS);
});
