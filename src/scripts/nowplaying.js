const API_URL = 'https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=BoochySans&api_key=fb8acb70098630643d13070b58760262&format=json';
const POLL_INTERVAL_MS = 5_000;
const FALLBACK = { song: 'Song', artist: 'Artist', image: '' };
const PREV_MAX = 6;

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

function renderPreviousTracks(tracks = []) {
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
    prevTracks.forEach((t, i) => {
        const title = t?.name || FALLBACK.song;
        const artist = t?.artist?.['#text'] || FALLBACK.artist;

        const entry = document.createElement('div');
        entry.className = 'songEntry';
        entry.dataset.index = String(i + 1);

        const h1 = document.createElement('h1');
        h1.className = 'songTitle';
        h1.textContent = title;

        const h2 = document.createElement('h2');
        h2.className = 'songArtist';
        h2.textContent = artist;

        entry.appendChild(h1);
        entry.appendChild(h2);
        container.appendChild(entry);
    });
}

async function updateNowPlayingElements() {
    const state = await fetchNowPlaying();
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
    renderPreviousTracks(state.tracks);
}

document.addEventListener('DOMContentLoaded', () => {
    updateNowPlayingElements();
    setInterval(updateNowPlayingElements, POLL_INTERVAL_MS);
});