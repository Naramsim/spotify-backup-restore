let token = null;
let userId = null;
let userName = null;
let collections = {
    playlists: {},
    savedTracks: []
};

// UI Elements
const pnlLoggedOut = document.getElementById('pnlLoggedOut');
const pnlLoadingAccount = document.getElementById('pnlLoadingAccount');
const pnlAction = document.getElementById('pnlAction');
const pnlImport = document.getElementById('pnlImport');
const pnlUpload = document.getElementById('pnlUpload');
const pnlFileInfo = document.getElementById('pnlFileInfo');

const loginBtn = document.getElementById('login');
const btnExport = document.getElementById('btnExport');
const btnImport = document.getElementById('btnImport');
const btnClear = document.getElementById('btnClear');
const fileImport = document.getElementById('fileImport');

const lblUserName = document.getElementById('userName');
const avatarLetter = document.getElementById('avatarLetter');
const actionUserName = document.getElementById('actionUserName');
const actionAvatarLetter = document.getElementById('actionAvatarLetter');
const loadingPlaylists = document.getElementById('loadingPlaylists');
const loadingTracks = document.getElementById('loadingTracks');
const btnLogout = document.getElementById('btnLogout');

const progressPct = document.getElementById('progressPct');
const progressBar = document.getElementById('progressBar');
const lblPlaylistStep = document.getElementById('playlistStep');
const lblPlaylistTotal = document.getElementById('playlistTotal');
const lblTrackStep = document.getElementById('trackStep');
const lblTrackTotal = document.getElementById('trackTotal');
const lblGlobalStep = document.getElementById('globalStep');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchSpotify(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['Authorization'] = `Bearer ${token}`;

    let retries = 3;
    while (retries > 0) {
        try {
            const response = await fetch(url, options);
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After')) || 2;
                console.log(`Rate limited on ${url}. Waiting ${retryAfter} seconds...`);
                await sleep(retryAfter * 1000);
                retries--;
                continue;
            }
            if (!response.ok) {
                let errorText = '';
                try {
                    const err = await response.json();
                    errorText = err.error.message;
                } catch(e) {}
                console.error(`Spotify API error ${response.status} on ${url}: ${errorText}`);
                throw new Error(`Spotify API error ${response.status}: ${errorText}`);
            }

            if (response.status === 204) return null; // No Content

            const text = await response.text();
            if (!text) return null;
            return JSON.parse(text);
        } catch (e) {
            console.error(e);
            if(retries <= 1) throw e;
            await sleep(2000);
            retries--;
        }
    }
    throw new Error('Too many requests or network error');
}

async function loadAllPages(url, limit = 50) {
    let items = [];
    let nextUrl = url + (url.includes('?') ? '&' : '?') + `limit=${limit}`;
    while (nextUrl) {
        const data = await fetchSpotify(nextUrl);
        if (data && data.items) {
            items = items.concat(data.items);
        }
        nextUrl = data ? data.next : null;
    }
    return items;
}

async function handleLoginSuccess(newToken) {
    token = newToken;
    localStorage.setItem('spotify_token', token);

    pnlLoggedOut.classList.add('hidden');
    pnlLoadingAccount.classList.remove('hidden');

    try {
        const me = await fetchSpotify('https://api.spotify.com/v1/me');
        userId = me.id;
        userName = me.display_name || userId;

        localStorage.setItem('spotify_userId', userId);
        localStorage.setItem('spotify_userName', userName);

        lblUserName.textContent = userName;
        actionUserName.textContent = userName;
        if (userName.length > 0) {
            avatarLetter.textContent = userName.charAt(0).toUpperCase();
            actionAvatarLetter.textContent = userName.charAt(0).toUpperCase();
        }

        pnlLoadingAccount.classList.add('hidden');
        pnlAction.classList.remove('hidden');

    } catch (error) {
        console.error("Error loading profile:", error);
        // Token might be expired
        localStorage.removeItem('spotify_token');
        localStorage.removeItem('spotify_userId');
        localStorage.removeItem('spotify_userName');

        if (error.message.includes('401')) {
            alert("Session expired. Please log in again.");
        } else {
            alert("Error loading profile: " + error.message);
        }
        pnlLoadingAccount.classList.add('hidden');
        pnlLoggedOut.classList.remove('hidden');
    }
}

// Check for existing session on load
window.addEventListener('DOMContentLoaded', () => {
    const savedToken = localStorage.getItem('spotify_token');
    if (savedToken) {
        handleLoginSuccess(savedToken);
    }
});

btnLogout.addEventListener('click', () => {
    localStorage.removeItem('spotify_token');
    localStorage.removeItem('spotify_userId');
    localStorage.removeItem('spotify_userName');
    token = null;
    userId = null;
    userName = null;

    pnlAction.classList.add('hidden');
    pnlLoggedOut.classList.remove('hidden');
});

loginBtn.addEventListener('click', () => {
    window.open(config.login_url, 'SpotifyLogin', 'width=800,height=600');
});

window.addEventListener("message", async (event) => {
    if (event.data && event.data.token) {
        handleLoginSuccess(event.data.token);
    }
}, false);

// Export logic
btnExport.addEventListener('click', async () => {
    pnlAction.classList.add('hidden');
    pnlLoadingAccount.classList.remove('hidden'); // Show loader

    document.getElementById('loadingTitle').textContent = "Exporting your library...";
    loadingPlaylists.textContent = "Fetching playlists...";
    loadingTracks.textContent = "Fetching saved tracks...";

    try {
        // Fetch all playlists
        const playlists = await loadAllPages('https://api.spotify.com/v1/me/playlists', 50);
        collections.playlists = {};

        let fetchedPlaylists = 0;
        for (const pl of playlists) {
            // Include owned and collaborative playlists
            const isOwned = pl.owner && pl.owner.id === userId;
            const isCollab = pl.collaborative === true;
            if (isOwned || isCollab) {
                loadingPlaylists.textContent = `Fetching tracks for playlist ${fetchedPlaylists + 1}/${playlists.length}...`;
                const tracksUrl = pl.tracks ? pl.tracks.href : `https://api.spotify.com/v1/playlists/${pl.id}/items`;
                const tracks = await loadAllPages(tracksUrl, 100);

                // Format tracks to just keep ID and URI
                const formattedTracks = tracks.map(t => {
                    const trackData = t.track || t.item;
                    const dateAdded = t.added_at || null
                    if (trackData && trackData.uri) {
                        return { id: trackData.id, uri: trackData.uri, dateAdded: dateAdded };
                    }
                    return null;
                }).filter(t => t !== null);

                collections.playlists[pl.name] = {
                    id: pl.id,
                    name: pl.name,
                    tracks: formattedTracks
                };
            }
            fetchedPlaylists++;
        }
        loadingPlaylists.textContent = "Playlists exported!";

        // Fetch saved tracks
        loadingTracks.textContent = "Fetching saved tracks...";
        const savedTracks = await loadAllPages('https://api.spotify.com/v1/me/tracks', 50);
        collections.savedTracks = savedTracks.map(t => {
            const trackData = t.track || t.item;
            const dateAdded = t.added_at || null
            if (trackData && trackData.uri) {
                return { id: trackData.id, uri: trackData.uri, dateAdded: dateAdded };
            }
            return null;
        }).filter(t => t !== null);
        loadingTracks.textContent = "Saved tracks exported!";

        // Download JSON
        const json = JSON.stringify(collections);
        const d = new Date();
        const dateStr = `${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
        const blob = new Blob([json], {type: "application/json"});
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${userName}@${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        pnlLoadingAccount.classList.add('hidden');
        pnlAction.classList.remove('hidden');
        alert('Export complete!');

    } catch (e) {
        alert("Export failed: " + e.message);
        pnlLoadingAccount.classList.add('hidden');
        pnlAction.classList.remove('hidden');
    }
});

let importData = null;

// Import logic
btnImport.addEventListener('click', () => {
    pnlAction.classList.add('hidden');
    pnlImport.classList.remove('hidden');
});

fileImport.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            importData = JSON.parse(evt.target.result);
            document.getElementById('fileName').textContent = file.name;

            // Format check
            const plCount = importData.playlists ? Object.keys(importData.playlists).length : 0;
            // Support both old 'saved' key and new 'savedTracks' key
            let savedTracksCount = 0;
            if (importData.savedTracks) savedTracksCount = importData.savedTracks.length;
            else if (importData.saved) savedTracksCount = importData.saved.length; // old format support
            else if (importData.savedTracks) savedTracksCount = importData.savedTracks.length; // new format

            // The dumped file has `playlists`, `savedTracks` maybe, but `dump.json` has `playlists` and `savedAlbums` but wait, let's check dump.json again.

            document.getElementById('filePlaylists').textContent = `${plCount} playlists`;
            document.getElementById('fileTracks').textContent = `${savedTracksCount} saved tracks`;

            document.getElementById('pnlFile').classList.add('hidden');
            pnlFileInfo.classList.remove('hidden');
        } catch (error) {
            alert("Invalid JSON file");
        }
    };
    reader.readAsText(file);
});

// Calculate total chunks to import
function startImport() {
    pnlImport.classList.add('hidden');
    pnlUpload.classList.remove('hidden');

    executeImport();
}

// Add event listener to start import when file is confirmed
// The original UI didn't have a specific confirm button on pnlFileInfo except maybe pnlFileInfo has a button?
// Let's create a dynamic button or see if it exists.
const btnStartImport = document.createElement('button');
btnStartImport.className = "btn btn-primary";
btnStartImport.style.marginTop = "20px";
btnStartImport.textContent = "Start Import";
btnStartImport.onclick = startImport;
pnlFileInfo.appendChild(btnStartImport);

async function executeImport() {
    try {
        let totalSteps = 0;
        let currentStep = 0;

        const playlistsToImport = importData.playlists ? Object.values(importData.playlists) : [];
        const tracksToImport = importData.savedTracks || importData.saved || []; // Fallback for old export format

        // Calculate steps (1 for each playlist creation + 1 for each chunk of 100 tracks + 1 for each chunk of 40 saved tracks)
        totalSteps += playlistsToImport.length;
        for (const pl of playlistsToImport) {
            totalSteps += Math.ceil((pl.tracks || []).length / 100);
        }
        totalSteps += Math.ceil(tracksToImport.length / 40);

        lblGlobalStep.textContent = "0 / " + totalSteps;
        progressBar.style.width = "0%";
        progressPct.textContent = "0%";

        const updateProgress = () => {
            currentStep++;
            lblGlobalStep.textContent = currentStep + " / " + totalSteps;
            const pct = Math.round((currentStep / totalSteps) * 100);
            progressBar.style.width = pct + "%";
            progressPct.textContent = pct + "%";
        };

        // 1. Import Saved Tracks
        if (tracksToImport.length > 0) {
            lblTrackTotal.textContent = tracksToImport.length;
            lblTrackStep.textContent = "0";

            // Spotify API allows saving 40 items per request via /v1/me/library
            for (let i = 0; i < tracksToImport.length; i += 40) {
                const chunk = tracksToImport.slice(i, i + 40);
                const uris = chunk.map(t => t.uri).filter(uri => uri);

                lblTrackStep.textContent = Math.min(i + 40, tracksToImport.length).toString();

                if (uris.length > 0) {
                    await fetchSpotify(`https://api.spotify.com/v1/me/library?uris=${encodeURIComponent(uris.join(','))}`, {
                        method: 'PUT'
                    });
                    await sleep(config.slowdown_import || 100); // Slight delay
                }
                updateProgress();
            }
        }

        // 2. Import Playlists
        if (playlistsToImport.length > 0) {
            lblPlaylistTotal.textContent = playlistsToImport.length;
            let plIndex = 0;

            const existingPlaylists = await loadAllPages('https://api.spotify.com/v1/me/playlists', 50);
            const userPlaylists = existingPlaylists.filter(p => p.owner && p.owner.id === userId);

            for (const pl of playlistsToImport) {
                plIndex++;
                lblPlaylistStep.textContent = plIndex.toString();

                let targetPl = userPlaylists.find(p => p.name === pl.name);
                let existingTrackIds = new Set();

                if (targetPl) {
                    // Fetch existing tracks
                    const existingItems = await loadAllPages(`https://api.spotify.com/v1/playlists/${targetPl.id}/items`, 100);
                    existingItems.forEach(element => {
                        // Handle standard track layout and possible alternative item layout
                        const trackData = element.track || element.item;
                        if (trackData && trackData.id) {
                            existingTrackIds.add(trackData.id);
                        }
                    });
                } else {
                    // Create Playlist
                    targetPl = await fetchSpotify(`https://api.spotify.com/v1/me/playlists`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: pl.name,
                            description: 'Imported by MySpotBackup',
                            public: false
                        })
                    });
                }
                updateProgress();

                const allTracks = pl.tracks || [];
                // Only add tracks whose IDs aren't already in the playlist
                const missingTracks = allTracks.filter(t => t.id && !existingTrackIds.has(t.id));

                lblPlaylistStep.textContent = plIndex.toString();

                // Add missing tracks in chunks of 100 (Spotify's limit)
                for (let i = 0; i < missingTracks.length; i += 100) {
                    const chunk = missingTracks.slice(i, i + 100);
                    const uris = chunk.map(t => t.uri).filter(uri => uri);

                    if (uris.length > 0) {
                        await fetchSpotify(`https://api.spotify.com/v1/playlists/${targetPl.id}/items`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ uris: uris }) // Official doc: use body parameter
                        });
                        await sleep(config.slowdown_import || 100);
                    }
                    updateProgress();
                }

                // Advance progress for skipped chunks to maintain global progress accuracy
                const skippedChunks = Math.ceil(allTracks.length / 100) - Math.ceil(missingTracks.length / 100);
                for (let i = 0; i < skippedChunks; i++) {
                    updateProgress();
                }
            }
        }

        alert("Import successfully completed!");
        pnlUpload.classList.add('hidden');
        pnlAction.classList.remove('hidden');

    } catch (e) {
        alert("Import failed: " + e.message);
        pnlUpload.classList.add('hidden');
        pnlAction.classList.remove('hidden');
    }
}

// Clear All logic
btnClear.addEventListener('click', async () => {
    if (!confirm("Are you sure you want to clear ALL your playlists and saved tracks? This action cannot be undone!")) {
        return;
    }

    pnlAction.classList.add('hidden');
    pnlUpload.classList.remove('hidden');
    document.querySelector('.progress-title').textContent = 'Clearing Library';

    try {
        let currentStep = 0;

        // 1. Fetch all playlists to delete
        lblPlaylistTotal.textContent = "Loading...";
        lblTrackTotal.textContent = "Loading...";

        const playlists = await loadAllPages('https://api.spotify.com/v1/me/playlists', 50);
        const savedTracks = await loadAllPages('https://api.spotify.com/v1/me/tracks', 50);

        const ownedPlaylists = playlists.filter(pl => pl.owner && pl.owner.id === userId);

        let totalSteps = ownedPlaylists.length + Math.ceil(savedTracks.length / 40);
        lblGlobalStep.textContent = "0 / " + totalSteps;
        progressBar.style.width = "0%";
        progressPct.textContent = "0%";

        const updateProgress = () => {
            currentStep++;
            lblGlobalStep.textContent = currentStep + " / " + totalSteps;
            const pct = Math.round((currentStep / totalSteps) * 100);
            progressBar.style.width = pct + "%";
            progressPct.textContent = pct + "%";
        };

        // 2. Unfollow (delete) playlists
        lblPlaylistTotal.textContent = ownedPlaylists.length;
        let plIndex = 0;
        for (const pl of ownedPlaylists) {
            plIndex++;
            lblPlaylistStep.textContent = plIndex.toString();

            await fetchSpotify(`https://api.spotify.com/v1/playlists/${pl.id}/followers`, {
                method: 'DELETE'
            });
            await sleep(100);
            updateProgress();
        }

        // 3. Remove Saved Tracks
        lblTrackTotal.textContent = savedTracks.length;
        for (let i = 0; i < savedTracks.length; i += 40) {
            const chunk = savedTracks.slice(i, i + 40);
            const uris = chunk.map(t => {
                const trackData = t.track || t.item;
                return trackData ? trackData.uri : null;
            }).filter(uri => uri);

            lblTrackStep.textContent = Math.min(i + 40, savedTracks.length).toString();

            if (uris.length > 0) {
                await fetchSpotify(`https://api.spotify.com/v1/me/library?uris=${encodeURIComponent(uris.join(','))}`, {
                    method: 'DELETE'
                });
                await sleep(100);
            }
            updateProgress();
        }

        alert("Clear successfully completed!");
        pnlUpload.classList.add('hidden');
        pnlAction.classList.remove('hidden');

    } catch (e) {
        alert("Clear failed: " + e.message);
        pnlUpload.classList.add('hidden');
        pnlAction.classList.remove('hidden');
    }
});
