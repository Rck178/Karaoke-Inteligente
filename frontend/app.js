/**
 * Karaoke Inteligente - Frontend JavaScript
 * Lógica principal de la aplicación
 */

const API_URL = 'http://localhost:3000/api';

let currentSong = null;
let songs = [];
let queue = [];

// ==================== INICIALIZACIÓN ====================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🎵 Karaoke app initialized');

  setupEventListeners();
  loadLibrary();
  loadQueue();
});

// ==================== EVENT LISTENERS GENERALES ====================

function setupEventListeners() {
  // Tabs
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const tabName = e.currentTarget.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  // Search
  document.getElementById('searchBtn').addEventListener('click', searchSpotify);
  document.getElementById('searchArtist').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchSpotify();
  });
  document.getElementById('searchTrack').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchSpotify();
  });

  // Library
  document.getElementById('refreshLibraryBtn').addEventListener('click', loadLibrary);

  // Player
  document.getElementById('playBtn').addEventListener('click', play);
  document.getElementById('pauseBtn').addEventListener('click', pause);
  document.getElementById('muteBtn').addEventListener('click', toggleMute);

  const audio = document.getElementById('audioPlayer');
  audio.addEventListener('timeupdate', updatePlayerProgress);
  audio.addEventListener('loadedmetadata', updatePlayerDuration);
  audio.addEventListener('ended', onTrackEnd);

  const progressBar = document.getElementById('progressBar');
  progressBar.addEventListener('click', seek);

  // Queue
  document.getElementById('addQueueForm').addEventListener('submit', addToQueue);
}

// ==================== TAB MANAGEMENT ====================

function switchTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Remove active class from buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show selected tab
  const tab = document.getElementById(tabName);
  if (tab) {
    tab.classList.add('active');
  }

  // Mark button as active
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
}

// ==================== SEARCH FUNCTIONALITY ====================

async function searchSpotify() {
  const artist = document.getElementById('searchArtist').value.trim();
  const track = document.getElementById('searchTrack').value.trim();

  if (!artist || !track) {
    showAlert('searchAlert', 'Por favor ingresa artista y canción', 'error');
    return;
  }

  const btn = document.getElementById('searchBtn');
  btn.disabled = true;
  btn.innerHTML = '⏳ Buscando...';

  try {
    const query = `${artist} ${track}`;
    const response = await fetch(`${API_URL}/search/spotify?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (!data.success || data.count === 0) {
      showAlert('searchAlert', 'No se encontraron resultados', 'warning');
      document.getElementById('searchResults').innerHTML = '';
      return;
    }

    displaySearchResults(data.data);
    showAlert('searchAlert', `Se encontraron ${data.count} resultados`, 'success');
  } catch (err) {
    console.error('Search error:', err);
    showAlert('searchAlert', `Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🔎 Buscar en Spotify';
  }
}

function displaySearchResults(tracks) {
  const container = document.getElementById('searchResults');
  container.innerHTML = '';

  tracks.forEach(track => {
    const card = document.createElement('div');
    card.className = 'track-card animate-in';

    const image = track.image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect fill="%236366f1" width="200" height="200"/%3E%3Ctext x="50%" y="50%" font-size="80" fill="white" text-anchor="middle" dominant-baseline="middle"%3E♪%3C/text%3E%3C/svg%3E';

    card.innerHTML = `
      <div class="track-image">
        <img src="${image}" alt="${track.title}">
      </div>
      <div class="track-info">
        <div class="track-title">${track.title}</div>
        <div class="track-artist">${track.artist}</div>
        <div class="track-meta">
          <span>⏱️ ${formatTime(track.duration)}</span>
          <span>⭐ ${track.popularity}%</span>
        </div>
        <div class="btn-group">
          <button class="btn btn-primary btn-small" onclick="downloadTrack('${track.artist}', '${track.title}', '${track.id}')">
            ⬇️ Descargar
          </button>
          <button class="btn btn-secondary btn-small" onclick="playPreview('${track.preview_url || ''}')">
            🔊 Preview
          </button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

async function downloadTrack(artist, title, spotifyId) {
  const btn = event.currentTarget;
  btn.disabled = true;
  btn.innerHTML = '⏳ Descargando...';

  try {
    const response = await fetch(`${API_URL}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artist: artist,
        title: title,
        spotify_id: spotifyId
      })
    });

    const data = await response.json();

    if (data.success) {
      showAlert('searchAlert', `✓ Descarga iniciada (ID: ${data.song_id})`, 'success');

      // Auto refrescar librería después de 5 segundos
      setTimeout(loadLibrary, 5000);
    } else {
      showAlert('searchAlert', `Error: ${data.error}`, 'error');
    }
  } catch (err) {
    showAlert('searchAlert', `Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '⬇️ Descargar';
  }
}

// ==================== LIBRARY FUNCTIONALITY ====================

async function loadLibrary() {
  try {
    const response = await fetch(`${API_URL}/songs`);
    const data = await response.json();

    songs = data.data || [];
    displayLibrary();
    updateQueueSongSelect();
  } catch (err) {
    console.error('Library error:', err);
    showAlert('libraryAlert', `Error: ${err.message}`, 'error');
  }
}

function displayLibrary() {
  const container = document.getElementById('libraryList');

  if (songs.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-light);">No hay canciones aún. ¡Busca y descarga una!</p>';
    return;
  }

  container.innerHTML = songs.map(song => `
    <div class="library-item animate-in">
      <div class="library-item-info">
        <div class="library-item-title">${song.titulo}</div>
        <div class="library-item-artist">${song.artista}</div>
        <div style="margin-top: 0.5rem;">
          ${getStatusBadges(song)}
        </div>
      </div>
      <div style="display: flex; gap: 0.5rem;">
        ${song.descargada ? `<button class="btn btn-primary btn-small" onclick="loadSongToPlayer(${song.id}, '${song.titulo}', '${song.artista}')">▶ Reproducir</button>` : ''}
        ${song.descargada && !song.separada ? `<button class="btn btn-secondary btn-small" onclick="separateVoices(${song.id})">⚙️ Procesar</button>` : ''}
      </div>
    </div>
  `).join('');
}

function getStatusBadges(song) {
  let badges = '';

  if (song.descargada) {
    badges += '<span class="status-ready">✓ Descargada</span>';
  } else {
    badges += '<span class="status-processing">⏳ Descargando</span>';
  }

  if (song.separada) {
    badges += '<span class="status-ready">✓ Voces Separadas</span>';
  } else if (song.descargada) {
    badges += '<span class="status-processing">⏳ Sin procesar</span>';
  }

  return badges;
}

// ==================== PLAYER FUNCTIONALITY ====================

function loadSongToPlayer(id, title, artist) {
  currentSong = { id, titulo: title, artista: artist };

  // Buscar archivo de audio
  const song = songs.find(s => s.id === id);
  if (!song || !song.ruta_original) {
    showAlert('playerAlert', 'Archivo de audio no disponible', 'error');
    return;
  }

  const audio = document.getElementById('audioPlayer');
  audio.src = song.ruta_original;

  document.getElementById('playerTitle').textContent = title;
  document.getElementById('playerArtist').textContent = artist;

  // Cargar letras si están disponibles
  if (song.letras) {
    displayLyrics(JSON.parse(song.letras));
  }

  showAlert('playerAlert', '✓ Canción cargada', 'success');
}

function displayLyrics(lyrics) {
  const container = document.getElementById('lyricsContainer');
  const list = document.getElementById('lyricsList');

  if (typeof lyrics === 'string') {
    // Lyrics simples, sin sincronización
    list.innerHTML = lyrics.split('\n').map(line =>
      `<div class="lyric-line">${line}</div>`
    ).join('');
  } else if (lyrics.synced) {
    // Lyrics sincronizadas
    list.innerHTML = lyrics.synced.map((sync, idx) =>
      `<div class="lyric-line" data-time="${sync.time}" data-index="${idx}">${sync.text}</div>`
    ).join('');
  }

  container.style.display = 'block';
}

function play() {
  if (!currentSong) {
    showAlert('playerAlert', 'Selecciona una canción primero', 'warning');
    return;
  }
  document.getElementById('audioPlayer').play();
}

function pause() {
  document.getElementById('audioPlayer').pause();
}

function toggleMute() {
  const audio = document.getElementById('audioPlayer');
  const btn = document.getElementById('muteBtn');

  audio.muted = !audio.muted;
  btn.textContent = audio.muted ? '🔇 Unmute' : '🔊 Mute';
}

function seek(e) {
  const audio = document.getElementById('audioPlayer');
  const rect = e.currentTarget.getBoundingClientRect();
  const percent = (e.clientX - rect.left) / rect.width;
  audio.currentTime = percent * audio.duration;
}

function updatePlayerProgress() {
  const audio = document.getElementById('audioPlayer');
  if (!audio.duration) return;

  const percent = (audio.currentTime / audio.duration) * 100;

  document.getElementById('progressFill').style.width = percent + '%';
  document.getElementById('currentTime').textContent = formatTime(audio.currentTime * 1000);

  // Sincronizar letras
  const lyricLines = document.querySelectorAll('.lyric-line[data-time]');
  lyricLines.forEach(line => {
    line.classList.remove('active');
    if (parseFloat(line.dataset.time) <= audio.currentTime) {
      line.classList.add('active');
      line.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

function updatePlayerDuration() {
  const audio = document.getElementById('audioPlayer');
  document.getElementById('duration').textContent = formatTime(audio.duration * 1000);
}

function playPreview(url) {
  if (!url) {
    showAlert('searchAlert', 'Preview no disponible', 'warning');
    return;
  }

  const audio = document.getElementById('audioPlayer');
  audio.src = url;
  audio.play();
}

function onTrackEnd() {
  showAlert('playerAlert', '✓ Canción terminada', 'success');
  pause();
}

async function separateVoices(songId) {
  const btn = event.currentTarget;
  btn.disabled = true;
  btn.innerHTML = '⏳ Procesando...';

  try {
    const response = await fetch(`${API_URL}/separate/${songId}`, {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      showAlert('libraryAlert', `✓ Procesamiento iniciado (${data.method})`, 'success');
      setTimeout(loadLibrary, 3000);
    } else {
      showAlert('libraryAlert', `Error: ${data.error}`, 'error');
    }
  } catch (err) {
    showAlert('libraryAlert', `Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '⚙️ Procesar';
  }
}

// ==================== QUEUE FUNCTIONALITY ====================

async function loadQueue() {
  try {
    const response = await fetch(`${API_URL}/queue`);
    const data = await response.json();

    queue = data.data || [];
    displayQueue();
  } catch (err) {
    console.error('Queue error:', err);
  }
}

function displayQueue() {
  const container = document.getElementById('queueList');

  if (queue.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-light);">Nadie en la cola</p>';
    return;
  }

  container.innerHTML = queue.map((item, idx) => `
    <div class="queue-item animate-in">
      <span class="queue-item-number">${idx + 1}</span>
      <div class="queue-item-info">
        <div class="track-title">${item.titulo || 'Canción sin título'}</div>
        <div class="queue-item-singer">🎤 ${item.cantante}</div>
      </div>
      <button class="btn btn-danger btn-small" onclick="removeFromQueue(${item.id})">✕ Cancelar</button>
    </div>
  `).join('');
}

async function addToQueue(e) {
  e.preventDefault();

  const songId = document.getElementById('queueSongSelect').value;
  const singer = document.getElementById('queueSingerName').value.trim();

  if (!songId || !singer) {
    showAlert('queueAlert', 'Completa todos los campos', 'warning');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        song_id: parseInt(songId),
        cantante: singer
      })
    });

    const data = await response.json();

    if (data.success) {
      document.getElementById('addQueueForm').reset();
      loadQueue();
      showAlert('queueAlert', '✓ Agregado a la cola', 'success');
    } else {
      showAlert('queueAlert', `Error: ${data.error}`, 'error');
    }
  } catch (err) {
    showAlert('queueAlert', `Error: ${err.message}`, 'error');
  }
}

async function removeFromQueue(queueId) {
  try {
    const response = await fetch(`${API_URL}/queue/${queueId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      loadQueue();
      showAlert('queueAlert', '✓ Removido de la cola', 'success');
    }
  } catch (err) {
    showAlert('queueAlert', `Error: ${err.message}`, 'error');
  }
}

function updateQueueSongSelect() {
  const select = document.getElementById('queueSongSelect');
  select.innerHTML = '<option value="">-- Selecciona una canción --</option>';

  songs.filter(s => s.descargada).forEach(song => {
    const option = document.createElement('option');
    option.value = song.id;
    option.textContent = `${song.titulo} - ${song.artista}`;
    select.appendChild(option);
  });
}

// ==================== UTILIDADES ====================

function formatTime(ms) {
  if (!ms || isNaN(ms)) return '0:00';

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function showAlert(elementId, message, type = 'info') {
  const element = document.getElementById(elementId);
  element.className = `alert alert-${type} animate-in`;
  element.textContent = message;
  element.style.display = 'block';

  setTimeout(() => {
    element.style.display = 'none';
  }, 5000);
}

console.log('✓ App.js loaded successfully');