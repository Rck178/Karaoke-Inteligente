/**
 * Musixmatch Service - Obtención de letras
 * Integración con API de Musixmatch y alternativas
 */

const axios = require('axios');

const MUSIXMATCH_API_KEY = process.env.MUSIXMATCH_API_KEY;
const MUSIXMATCH_BASE_URL = 'https://api.musixmatch.com/ws/1.1';
const GENIUS_API_KEY = process.env.GENIUS_API_KEY;
const GENIUS_BASE_URL = 'https://api.genius.com';

/**
 * Obtener letras desde Musixmatch
 * @param {string} artist - Artista
 * @param {string} track - Título de la canción
 * @returns {Promise<Object>} {lyrics: string, sync: Array<{time, text}>}
 */
async function getLyrics(artist, track) {
  try {
    if (!MUSIXMATCH_API_KEY) {
      throw new Error('Musixmatch API key not configured');
    }

    // Búsqueda de track
    const response = await axios.get(`${MUSIXMATCH_BASE_URL}/matcher.lyrics.get`, {
      params: {
        q_artist: artist,
        q_track: track,
        apikey: MUSIXMATCH_API_KEY
      },
      timeout: 10000
    });

    const body = response.data.message.body;

    if (!body.lyrics) {
      console.warn(`[Musixmatch] No lyrics found for: ${artist} - ${track}`);
      return null;
    }

    const lyrics = body.lyrics.lyrics_body;
    const lyricsId = body.lyrics.lyrics_id;

    // Obtener versión sincronizada si está disponible
    let syncedLyrics = null;
    try {
      const syncResponse = await axios.get(`${MUSIXMATCH_BASE_URL}/matcher.track.get`, {
        params: {
          q_artist: artist,
          q_track: track,
          apikey: MUSIXMATCH_API_KEY
        },
        timeout: 10000
      });

      if (syncResponse.data.message.body.track) {
        const trackId = syncResponse.data.message.body.track.track_id;

        // Intentar obtener lyrics sincronizadas
        try {
          const trackLyricsResponse = await axios.get(
            `${MUSIXMATCH_BASE_URL}/track.lyrics.get`,
            {
              params: {
                track_id: trackId,
                apikey: MUSIXMATCH_API_KEY
              },
              timeout: 10000
            }
          );

          if (trackLyricsResponse.data.message.body.lyrics) {
            syncedLyrics = parseSyncedLyrics(trackLyricsResponse.data.message.body.lyrics);
          }
        } catch (e) {
          console.log('[Musixmatch] Synced lyrics not available');
        }
      }
    } catch (e) {
      console.log('[Musixmatch] Could not retrieve synced version');
    }

    return {
      lyrics: lyrics,
      synced: syncedLyrics,
      source: 'musixmatch',
      lyrics_id: lyricsId
    };
  } catch (err) {
    console.error('[Musixmatch] Error:', err.message);
    return null;
  }
}

/**
 * Obtener letras desde Genius
 * @param {string} artist - Artista
 * @param {string} track - Título
 * @returns {Promise<Object>} {lyrics: string, genius_url: string}
 */
async function getLyricsFromGenius(artist, track) {
  try {
    if (!GENIUS_API_KEY) {
      throw new Error('Genius API key not configured');
    }

    const response = await axios.get(`${GENIUS_BASE_URL}/search`, {
      params: {
        q: `${artist} ${track}`,
        access_token: GENIUS_API_KEY
      },
      timeout: 10000
    });

    const hits = response.data.response.hits;

    if (!hits || hits.length === 0) {
      console.warn(`[Genius] No results found for: ${artist} - ${track}`);
      return null;
    }

    // Tomar el primer resultado
    const result = hits[0].result;

    return {
      title: result.title,
      artist: result.primary_artist.name,
      url: result.url,
      genius_id: result.id,
      source: 'genius',
      // NOTA: Genius no proporciona lyrics en JSON, URL debe ser scrapeada
      note: 'Use Genius URL for web scraping if needed'
    };
  } catch (err) {
    console.error('[Genius] Error:', err.message);
    return null;
  }
}

/**
 * Obtener letras desde lrclib.net (mejor para sincronización)
 * @param {string} artist - Artista
 * @param {string} track - Título
 * @returns {Promise<Object>} {lyrics: string, synced: Array}
 */
async function getLyricsFromLrclib(artist, track) {
  try {
    // lrclib es API pública sin autenticación
    const response = await axios.get('https://lrclib.net/api/search', {
      params: {
        artist_name: artist,
        track_name: track
      },
      timeout: 10000
    });

    if (!response.data || response.data.length === 0) {
      console.warn(`[lrclib] No results found for: ${artist} - ${track}`);
      return null;
    }

    // Tomar el primer resultado (mejor match)
    const result = response.data[0];

    if (!result.syncedLyrics) {
      console.warn(`[lrclib] No synced lyrics found`);
      return {
        lyrics: result.plainLyrics,
        synced: null,
        source: 'lrclib',
        note: 'Unsynced lyrics available'
      };
    }

    const synced = parseLrcFormat(result.syncedLyrics);

    return {
      lyrics: result.plainLyrics,
      synced: synced,
      source: 'lrclib',
      id: result.id,
      duration: result.duration
    };
  } catch (err) {
    console.error('[lrclib] Error:', err.message);
    return null;
  }
}

/**
 * Parsear formato LRC a array de objetos {time, text}
 * LRC format: [00:12.00]Line of lyrics
 */
function parseLrcFormat(lrcText) {
  const lines = lrcText.split('\n');
  const synced = [];

  for (const line of lines) {
    const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\](.+)/);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const centiseconds = parseInt(match[3]);
      const text = match[4].trim();

      const timeInSeconds = minutes * 60 + seconds + centiseconds / 100;

      synced.push({
        time: timeInSeconds,
        timeFormatted: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
        text: text
      });
    }
  }

  return synced.length > 0 ? synced : null;
}

/**
 * Parsear letra sincronizada de Musixmatch
 */
function parseSyncedLyrics(lyricsData) {
  // Musixmatch usa formato JSON con time properties
  // Estructura: lyrics_sync_lines: [{line: "text", minutes: 0, seconds: 12}]

  if (lyricsData.lyrics_sync_lines) {
    return lyricsData.lyrics_sync_lines.map(line => ({
      time: line.minutes * 60 + line.seconds,
      timeFormatted: `${String(line.minutes).padStart(2, '0')}:${String(line.seconds).padStart(2, '0')}`,
      text: line.line
    }));
  }

  return null;
}

/**
 * Buscar letras en múltiples fuentes (fallback)
 * @param {string} artist - Artista
 * @param {string} track - Título
 * @returns {Promise<Object>} Primer resultado exitoso
 */
async function getLyricsMultiSource(artist, track) {
  // Intentar en orden: Musixmatch > lrclib > Genius

  console.log(`[Lyrics] Searching for: ${artist} - ${track}`);

  // Primero lrclib (mejor para sincronización)
  const lrclib = await getLyricsFromLrclib(artist, track);
  if (lrclib) {
    console.log('[Lyrics] ✓ Found in lrclib');
    return lrclib;
  }

  // Luego Musixmatch
  const musixmatch = await getLyrics(artist, track);
  if (musixmatch) {
    console.log('[Lyrics] ✓ Found in Musixmatch');
    return musixmatch;
  }

  // Finalmente Genius
  const genius = await getLyricsFromGenius(artist, track);
  if (genius) {
    console.log('[Lyrics] ✓ Found in Genius');
    return genius;
  }

  console.warn('[Lyrics] ✗ Not found in any source');
  return null;
}

module.exports = {
  getLyrics,
  getLyricsFromGenius,
  getLyricsFromLrclib,
  getLyricsMultiSource,
  parseLrcFormat,
  parseSyncedLyrics
};
