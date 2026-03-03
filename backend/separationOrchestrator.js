/**
 * Separation Orchestrator
 * Decide si usar Spleeter local o API online basado en preferencias y disponibilidad
 */

const spleeterService = require('./spleeterService');
const rapidapiService = require('./rapidapiService');
const fs = require('fs');

/**
 * Separar voces eligiendo el mejor método
 * @param {number} songId - ID de la canción
 * @param {string} audioPath - Ruta del archivo
 * @param {string} preferredMethod - 'local', 'online', o 'auto'
 * @param {Database} db - Instancia SQLite
 * @returns {Promise<Object>} Resultado de separación
 */
async function separateVoices(songId, audioPath, preferredMethod = 'auto', db) {
  try {
    let method = preferredMethod;

    // Si es auto, decidir basado en tamaño y disponibilidad
    if (method === 'auto') {
      const fileStats = fs.statSync(audioPath);
      const fileSizeMB = fileStats.size / (1024 * 1024);

      // Si < 30MB y API disponible, usar online (más rápido)
      // Si >= 30MB, usar local (no bloquea servidor)
      const apiAvailable = await rapidapiService.validateAPIAvailability();

      if (fileSizeMB < 30 && apiAvailable) {
        method = 'online';
        console.log(`[Orchestrator] Auto: selected 'online' (${fileSizeMB.toFixed(1)}MB, API available)`);
      } else {
        method = 'local';
        console.log(`[Orchestrator] Auto: selected 'local' (${fileSizeMB.toFixed(1)}MB or API unavailable)`);
      }
    }

    console.log(`[Orchestrator] Using method: ${method}`);

    let result;

    if (method === 'online') {
      try {
        result = await rapidapiService.separateVoicesOnline(songId, audioPath, db);
      } catch (err) {
        console.warn(`[Orchestrator] Online method failed, falling back to local: ${err.message}`);
        // Fallback a local si online falla
        result = await spleeterService.separateVoices(songId, audioPath, db);
      }
    } else if (method === 'local') {
      result = await spleeterService.separateVoices(songId, audioPath, db);
    } else {
      throw new Error(`Unknown separation method: ${method}`);
    }

    return result;
  } catch (err) {
    console.error('[Orchestrator] Error:', err.message);
    db.run(`UPDATE canciones SET procesada = -1 WHERE id = ?`, [songId]);
    throw err;
  }
}

/**
 * Obtener estado de disponibilidad de métodos
 */
async function getAvailableMethods() {
  const methods = {
    local: {
      name: 'Spleeter (Local)',
      available: await spleeterService.validateSpleeterInstallation(),
      speed: 'Lento (2-5 min/canción)',
      cost: 'Gratis',
      quality: 'Bueno'
    },
    online: {
      name: 'RapidAPI (Online)',
      available: await rapidapiService.validateAPIAvailability(),
      speed: 'Rápido (10-30 seg)',
      cost: '$0.10-0.50/canción',
      quality: 'Excelente'
    }
  };

  return methods;
}

module.exports = {
  separateVoices,
  getAvailableMethods
};
