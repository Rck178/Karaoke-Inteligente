/**
 * RapidAPI Service - Separación de voces online
 * Integración con APIs de separación de voces alojadas en RapidAPI
 * Ejemplo: Vocal Remover API
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const SEPARATED_PATH = process.env.SEPARATED_PATH || './storage/separated_tracks';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST;

/**
 * Separar voces usando API online (RapidAPI Vocal Remover)
 * @param {number} songId - ID de la canción
 * @param {string} audioPath - Ruta del archivo de audio
 * @param {Database} db - Instancia SQLite
 * @returns {Promise<Object>} {voces, instrumental}
 */
async function separateVoicesOnline(songId, audioPath, db) {
  try {
    if (!RAPIDAPI_KEY || !RAPIDAPI_HOST) {
      const err = new Error('RapidAPI credentials not configured');
      db.run(`UPDATE canciones SET procesada = -1 WHERE id = ?`, [songId]);
      throw err;
    }

    // Verificar que archivo existe
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    // Actualizar estado
    db.run(`UPDATE canciones SET procesada = -2 WHERE id = ?`, [songId]);

    console.log(`[RapidAPI] Uploading for separation: ${audioPath}`);

    // Crear form data con archivo
    const form = new FormData();
    form.append('file', fs.createReadStream(audioPath));

    // Upload y procesamiento
    // NOTA: Ajustar URL y headers según la API específica usada
    const options = {
      method: 'POST',
      url: `https://${RAPIDAPI_HOST}/up`,
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
        ...form.getHeaders()
      },
      data: form,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    };

    // Subir archivo
    const uploadResponse = await axios.request(options);

    if (!uploadResponse.data || !uploadResponse.data.id) {
      throw new Error('Failed to upload file to API');
    }

    const fileId = uploadResponse.data.id;
    console.log(`[RapidAPI] File uploaded with ID: ${fileId}`);

    // Esperar a procesamiento (poll cada 2 segundos, máx 60 segundos)
    let separated = false;
    let attempts = 0;
    let vocals, instrumental;

    while (!separated && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar 2 segundos
      attempts++;

      try {
        const statusOptions = {
          method: 'GET',
          url: `https://${RAPIDAPI_HOST}/up/${fileId}`,
          headers: {
            'X-RapidAPI-Key': RAPIDAPI_KEY,
            'X-RapidAPI-Host': RAPIDAPI_HOST
          }
        };

        const statusResponse = await axios.request(statusOptions);

        if (statusResponse.data.status === 'done' || statusResponse.data.status === 'complete') {
          vocal = statusResponse.data.vocal_url;
          instrumental = statusResponse.data.instrumental_url;
          separated = true;

          console.log(`[RapidAPI] Processing complete after ${attempts * 2} seconds`);
        } else if (statusResponse.data.status === 'error' || statusResponse.data.status === 'failed') {
          throw new Error(`API processing failed: ${statusResponse.data.message}`);
        } else {
          console.log(`[RapidAPI] Processing... (attempt ${attempts})`);
        }
      } catch (statusErr) {
        if (statusErr.response?.status === 404) {
          console.log(`[RapidAPI] Still processing... (${attempts}/30)`);
        } else {
          throw statusErr;
        }
      }
    }

    if (!separated) {
      throw new Error('API processing timeout after 60 seconds');
    }

    // Descargar archivos separados
    const vocalsPath = path.join(SEPARATED_PATH, `${songId}_vocals.mp3`);
    const instrumentalPath = path.join(SEPARATED_PATH, `${songId}_instrumental.mp3`);

    if (!fs.existsSync(SEPARATED_PATH)) {
      fs.mkdirSync(SEPARATED_PATH, { recursive: true });
    }

    console.log(`[RapidAPI] Downloading stems...`);

    // Descargar voces
    const vocalsResponse = await axios({
      method: 'GET',
      url: vocals,
      responseType: 'stream'
    });

    await new Promise((resolve, reject) => {
      vocalsResponse.data
        .pipe(fs.createWriteStream(vocalsPath))
        .on('finish', resolve)
        .on('error', reject);
    });

    // Descargar instrumental
    const instrumentalResponse = await axios({
      method: 'GET',
      url: instrumental,
      responseType: 'stream'
    });

    await new Promise((resolve, reject) => {
      instrumentalResponse.data
        .pipe(fs.createWriteStream(instrumentalPath))
        .on('finish', resolve)
        .on('error', reject);
    });

    // Actualizar BD
    db.run(
      `UPDATE canciones SET
        ruta_voces = ?,
        ruta_instrumental = ?,
        separada = 1,
        metodo_separacion = 'online',
        procesada = 1
      WHERE id = ?`,
      [vocalsPath, instrumentalPath, songId],
      function(err) {
        if (err) {
          console.error('DB error:', err);
          throw err;
        }
        console.log(`[RapidAPI] ✓ Complete: Song ${songId}`);
      }
    );

    return {
      song_id: songId,
      voces: vocalsPath,
      instrumental: instrumentalPath,
      metodo: 'online'
    };
  } catch (err) {
    console.error('[RapidAPI] Error:', err.message);
    db.run(`UPDATE canciones SET procesada = -1 WHERE id = ?`, [songId]);
    throw err;
  }
}

/**
 * Verificar disponibilidad de API
 */
async function validateAPIAvailability() {
  if (!RAPIDAPI_KEY || !RAPIDAPI_HOST) {
    console.warn('✗ RapidAPI credentials not configured');
    return false;
  }

  try {
    const options = {
      method: 'GET',
      url: `https://${RAPIDAPI_HOST}/`,
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      },
      timeout: 5000
    };

    await axios.request(options);
    console.log('✓ RapidAPI is reachable');
    return true;
  } catch (err) {
    console.warn(`✗ RapidAPI not available: ${err.message}`);
    return false;
  }
}

module.exports = {
  separateVoicesOnline,
  validateAPIAvailability
};
