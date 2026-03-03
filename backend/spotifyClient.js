/**
 * Spotify API Client
 * Búsqueda de canciones y obtención de metadata
 */

const SpotifyWebApi = require('spotify-web-api-node');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./backend/database.sqlite');

// Inicializar cliente Spotify
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
});

/**
 * Obtener y refrescar token de acceso
 */
async function refreshAccessToken() {
  try {
    const data = await spotifyApi.clientCredentialsFlow();
    spotifyApi.setAccessToken(data.body['access_token']);
    return true;
  } catch (err) {
    console.error('Error refreshing Spotify token:', err.message);
    return false;
  }
}

/**
 * Buscar canción en Spotify
 * @param {string} query - Búsqueda (ej: "Queen Bohemian Rhapsody")
 * @param {number} limit - Número de resultados (default: 5)
 * @returns {Promise<Array>} Array de canciones encontradas
 */
async function searchTracks(query, limit = 5) {
  try {
    // Verificar si token está válido, si no, refrescar
    const tokenValid = await checkTokenValidity();
    if (!tokenValid) {
      await refreshAccessToken();
    }

    const results = await spotifyApi.searchTracks(query, { limit });

    if (!results.body.tracks.items.length) {
      return [];
    }

    // Mapear resultados a formato consistente
    return results.body.tracks.items.map(track => ({
      id: track.id,
      title: track.name,
      artist: track.artists[0]?.name || 'Unknown',
      artists: track.artists.map(a => a.name),
      album: track.album?.name,
      image: track.album?.images[0]?.url,
      duration: track.duration_ms,
      popularity: track.popularity,
      preview_url: track.preview_url,
      spotify_url: track.external_urls.spotify,
      release_date: track.album?.release_date
    }));
  } catch (err) {
    console.error('Error searching Spotify:', err.message);
    throw err;
  }
}

/**
 * Obtener metadata de una canción por ID
 */
async function getTrackInfo(trackId) {
  try {
    const tokenValid = await checkTokenValidity();
    if (!tokenValid) {
      await refreshAccessToken();
    }

    const track = await spotifyApi.getTrack(trackId);

    return {
      id: track.body.id,
      title: track.body.name,
      artist: track.body.artists[0]?.name || 'Unknown',
      artists: track.body.artists.map(a => a.name),
      album: track.body.album?.name,
      image: track.body.album?.images[0]?.url,
      duration: track.body.duration_ms,
      popularity: track.body.popularity,
      preview_url: track.body.preview_url,
      spotify_url: track.body.external_urls.spotify,
      release_date: track.body.album?.release_date
    };
  } catch (err) {
    console.error('Error getting track info:', err.message);
    throw err;
  }
}

/**
 * Verificar si el token Spotify es válido
 */
async function checkTokenValidity() {
  try {
    // Intentar hacer una llamada simple a la API
    await spotifyApi.getMe();
    return true;
  } catch (err) {
    if (err.statusCode === 401) {
      return false;
    }
    throw err;
  }
}

/**
 * Guardar canción en caché local (SQLite)
 */
function saveToCacheDB(spotifyData) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT OR REPLACE INTO spotify_cache
      (spotify_id, titulo, artista, imagen, duracion, preview_url, spotify_url, fecha_cache)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    db.run(
      sql,
      [
        spotifyData.id,
        spotifyData.title,
        spotifyData.artist,
        spotifyData.image,
        spotifyData.duration,
        spotifyData.preview_url,
        spotifyData.spotify_url
      ],
      function(err) {
        if (err) {
          console.error('Error saving to cache:', err);
          reject(err);
        } else {
          resolve(true);
        }
      }
    );
  });
}

/**
 * Buscar en caché local primero
 */
function getFromCacheDB(query) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM spotify_cache
      WHERE titulo LIKE ? OR artista LIKE ?
      LIMIT 5
    `;

    db.all(sql, [`%${query}%`, `%${query}%`], (err, rows) => {
      if (err) {
        console.error('Error reading cache:', err);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Inicializar - crear tabla de caché si no existe
 */
function initializeCache() {
  const sql = `
    CREATE TABLE IF NOT EXISTS spotify_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spotify_id TEXT UNIQUE,
      titulo TEXT,
      artista TEXT,
      imagen TEXT,
      duracion INTEGER,
      preview_url TEXT,
      spotify_url TEXT,
      fecha_cache TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.run(sql, (err) => {
    if (err) {
      console.error('Error creating cache table:', err);
    } else {
      console.log('✓ Spotify cache table initialized');
    }
  });
}

// Inicializar caché al cargar módulo
initializeCache();

module.exports = {
  refreshAccessToken,
  searchTracks,
  getTrackInfo,
  checkTokenValidity,
  saveToCacheDB,
  getFromCacheDB,
  initializeCache
};
