/**
 * API Routes - Karaoke Inteligente
 * Organiza todos los endpoints de la aplicación
 */

const express = require('express');
const router = express.Router();
const spotifyClient = require('./spotifyClient');
const youtubeService = require('./youtubeService');
const spleeterService = require('./spleeterService');
const rapidapiService = require('./rapidapiService');
const musixmatchService = require('./musixmatchService');
const separationOrchestrator = require('./separationOrchestrator');
const db = require('./database');
const path = require('path');

// ==================== BÚSQUEDA DE CANCIONES ====================

/**
 * GET /api/search/spotify?q=query
 * Buscar canción en Spotify
 */
router.get('/search/spotify', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    const results = await spotifyClient.searchTracks(query, 5);

    // Guardar en caché
    for (const track of results) {
      await spotifyClient.saveToCacheDB(track).catch(e => console.log('Cache save error:', e.message));
    }

    res.json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Error searching Spotify: ' + err.message
    });
  }
});

// ==================== DESCARGAS Y AUDIOS ====================

/**
 * POST /api/download
 * Descargar canción de YouTube
 * Body: { artist, title, spotify_id? }
 */
router.post('/download', async (req, res) => {
  try {
    const { artist, title, spotify_id } = req.body;

    if (!artist || !title) {
      return res.status(400).json({ error: 'Artist and title required' });
    }

    // Crear registro en BD primero
    const songId = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO canciones (titulo, artista, spotify_id) VALUES (?, ?, ?)`,
        [title, artist, spotify_id || null],
        function(err) {
          if (err) reject(err);
          resolve(this.lastID);
        }
      );
    });

    // Iniciar descarga (async, no bloquea respuesta)
    youtubeService.downloadFromYouTube(songId, artist, title, db)
      .then(audioPath => {
        // Actualizar BD con ruta
        db.run(
          `UPDATE canciones SET ruta_original = ?, descargada = 1 WHERE id = ?`,
          [audioPath, songId]
        );
      })
      .catch(err => {
        console.error('Download error:', err);
        db.run(`UPDATE canciones SET procesada = -1 WHERE id = ?`, [songId]);
      });

    res.json({
      success: true,
      song_id: songId,
      status: 'downloading',
      message: 'Download started in background'
    });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Download error: ' + err.message
    });
  }
});

/**
 * GET /api/songs
 * Listar todas las canciones
 */
router.get('/songs', (req, res) => {
  db.all("SELECT * FROM canciones", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  });
});

/**
 * POST /api/songs
 * Agregar canción manualmente
 */
router.post('/songs', (req, res) => {
  const { titulo, artista, ruta_original } = req.body;

  if (!titulo || !artista) {
    return res.status(400).json({ error: 'Title and artist required' });
  }

  db.run(
    `INSERT INTO canciones (titulo, artista, ruta_original) VALUES (?, ?, ?)`,
    [titulo, artista, ruta_original || null],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({
        success: true,
        id: this.lastID
      });
    }
  );
});

/**
 * GET /api/songs/:id
 * Obtener información de una canción
 */
router.get('/songs/:id', (req, res) => {
  const id = req.params.id;

  db.get("SELECT * FROM canciones WHERE id = ?", [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Song not found' });
    }
    res.json({
      success: true,
      data: row
    });
  });
});

// ==================== SEPARACIÓN DE VOCES ====================

/**
 * POST /api/separate/:id
 * Separar voces de una canción
 * Query: method=local|online (default: local)
 */
router.post('/separate/:id', async (req, res) => {
  try {
    const songId = req.params.id;
    const method = req.query.method || process.env.DEFAULT_SEPARATION_METHOD || 'local';

    // Verificar que la canción existe
    const song = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM canciones WHERE id = ?", [songId], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    if (!song.ruta_original) {
      return res.status(400).json({ error: 'Song audio not downloaded yet' });
    }

    // Usar orquestador para elegir método
    const result = await separationOrchestrator.separateVoices(
      songId,
      song.ruta_original,
      method,
      db
    );

    res.json({
      success: true,
      song_id: songId,
      status: 'separating',
      method: result.method,
      message: `Voice separation started using ${result.method} method`
    });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Separation error: ' + err.message
    });
  }
});

// ==================== LETRAS ====================

/**
 * GET /api/lyrics/:id
 * Obtener letras de una canción
 * Query: source=musixmatch|genius|lrclib
 */
router.get('/lyrics/:id', async (req, res) => {
  try {
    const songId = req.params.id;
    const source = req.query.source || 'musixmatch';

    const song = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM canciones WHERE id = ?", [songId], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    let lyrics;

    if (source === 'musixmatch') {
      lyrics = await musixmatchService.getLyrics(song.artista, song.titulo);
    } else if (source === 'genius') {
      lyrics = await musixmatchService.getLyricsFromGenius(song.artista, song.titulo);
    } else if (source === 'lrclib') {
      lyrics = await musixmatchService.getLyricsFromLrclib(song.artista, song.titulo);
    } else {
      return res.status(400).json({ error: 'Invalid source' });
    }

    if (!lyrics) {
      return res.status(404).json({ error: 'Lyrics not found' });
    }

    // Guardar en BD
    db.run(
      `UPDATE canciones SET letras = ? WHERE id = ?`,
      [JSON.stringify(lyrics), songId]
    );

    res.json({
      success: true,
      song_id: songId,
      source: source,
      data: lyrics
    });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Error getting lyrics: ' + err.message
    });
  }
});

// ==================== QUEUE (COLA DE KARAOKE) ====================

/**
 * GET /api/queue
 * Obtener lista de canciones en cola
 */
router.get('/queue', (req, res) => {
  db.all(`
    SELECT c.*, q.id as queue_id, q.cantante, q.estado, q.fecha_agregacion
    FROM cola q
    LEFT JOIN canciones c ON q.cancion_id = c.id
    ORDER BY q.fecha_agregacion ASC
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  });
});

/**
 * POST /api/queue
 * Agregar canción a la cola
 * Body: { song_id, cantante }
 */
router.post('/queue', (req, res) => {
  const { song_id, cantante } = req.body;

  if (!song_id) {
    return res.status(400).json({ error: 'Song ID required' });
  }

  db.run(
    `INSERT INTO cola (cancion_id, cantante, estado) VALUES (?, ?, 'pendiente')`,
    [song_id, cantante || 'Desconocido'],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({
        success: true,
        queue_id: this.lastID
      });
    }
  );
});

/**
 * DELETE /api/queue/:id
 * Remover canción de la cola
 */
router.delete('/queue/:id', (req, res) => {
  const queueId = req.params.id;

  db.run(
    `DELETE FROM cola WHERE id = ?`,
    [queueId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({
        success: true,
        message: 'Removed from queue'
      });
    }
  );
});

/**
 * PUT /api/queue/:id
 * Actualizar estado de canción en cola
 * Body: { estado }
 */
router.put('/queue/:id', (req, res) => {
  const queueId = req.params.id;
  const { estado } = req.body;

  db.run(
    `UPDATE cola SET estado = ? WHERE id = ?`,
    [estado, queueId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({
        success: true,
        message: 'Queue item updated'
      });
    }
  );
});

// ==================== ESTADO / HEALTH ====================

/**
 * GET /api/status
 * Estado general de la aplicación
 */
router.get('/status', async (req, res) => {
  try {
    const songCount = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM canciones", [], (err, row) => {
        if (err) reject(err);
        resolve(row.count);
      });
    });

    const queueCount = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM cola", [], (err, row) => {
        if (err) reject(err);
        resolve(row.count);
      });
    });

    const spotifyStatus = await spotifyClient.checkTokenValidity()
      .then(() => 'OK')
      .catch(() => 'ERROR');

    res.json({
      success: true,
      status: {
        songs: songCount,
        queue_items: queueCount,
        spotify: spotifyStatus,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
