/**
 * Spleeter Service - Separación de voces
 * Usa la librería Spleeter de Deezer para separar voces e instrumentales
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SEPARATED_PATH = process.env.SEPARATED_PATH || './storage/separated_tracks';

/**
 * Separar voces usando Spleeter
 * @param {number} songId - ID de la canción
 * @param {string} audioPath - Ruta del archivo de audio original
 * @param {Database} db - Instancia SQLite
 * @returns {Promise<Object>} {voces, instrumental, duracion}
 */
async function separateVoices(songId, audioPath, db) {
  return new Promise((resolve, reject) => {
    try {
      // Verificar que archivo existe
      if (!fs.existsSync(audioPath)) {
        const err = new Error(`Audio file not found: ${audioPath}`);
        db.run(`UPDATE canciones SET procesada = -1 WHERE id = ?`, [songId]);
        return reject(err);
      }

      // Crear directorio de salida
      const outputDir = path.join(SEPARATED_PATH, `song_${songId}`);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Actualizar estado: separando
      db.run(`UPDATE canciones SET procesada = -2 WHERE id = ?`, [songId]);

      console.log(`[Spleeter] Separating: ${audioPath}`);
      console.log(`[Spleeter] Output: ${outputDir}`);

      // Ejecutar spleeter
      // Nota: puede tomar 2-5 minutos en CPU
      const spleeter = spawn(process.env.SPLEETER_EXECUTABLE || 'spleeter', [
        'separate',
        '-B', 'musdb_20170726/models/512centrics',  // Backbone (modelo)
        '-p', 'spleeter:2stems',  // 2 stems: vocals + accompaniment
        '-o', outputDir,
        '-f', '120s',  // max 2 minutos por archivo para CPU
        audioPath
      ]);

      let errorOutput = '';

      spleeter.stdout.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[Spleeter] ${msg}`);
      });

      spleeter.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[Spleeter] WARN: ${msg}`);
        errorOutput += msg;
      });

      spleeter.on('close', (code) => {
        if (code !== 0) {
          const err = new Error(`Spleeter failed with code ${code}: ${errorOutput}`);
          db.run(`UPDATE canciones SET procesada = -1 WHERE id = ?`, [songId]);
          return reject(err);
        }

        // Buscar archivos generados
        // Estructura esperada: outputDir/song_name/{vocals.wav, accompaniment.wav}
        const songDirs = fs.readdirSync(outputDir);
        if (songDirs.length === 0) {
          const err = new Error('No output directory created by Spleeter');
          db.run(`UPDATE canciones SET procesada = -1 WHERE id = ?`, [songId]);
          return reject(err);
        }

        const stemDir = path.join(outputDir, songDirs[0]);
        const vocalsPath = path.join(stemDir, 'vocals.wav');
        const accompanimentPath = path.join(stemDir, 'accompaniment.wav');

        if (!fs.existsSync(vocalsPath) || !fs.existsSync(accompanimentPath)) {
          const err = new Error('Vocals or accompaniment file not found');
          db.run(`UPDATE canciones SET procesada = -1 WHERE id = ?`, [songId]);
          return reject(err);
        }

        // Copiar a rutas estándar
        const finalVocalsPath = path.join(SEPARATED_PATH, `${songId}_vocals.wav`);
        const finalAccompanimentPath = path.join(SEPARATED_PATH, `${songId}_instrumental.wav`);

        try {
          fs.copyFileSync(vocalsPath, finalVocalsPath);
          fs.copyFileSync(accompanimentPath, finalAccompanimentPath);

          // Actualizar BD
          db.run(
            `UPDATE canciones SET
              ruta_voces = ?,
              ruta_instrumental = ?,
              separada = 1,
              metodo_separacion = 'spleeter',
              procesada = 1
            WHERE id = ?`,
            [finalVocalsPath, finalAccompanimentPath, songId],
            function(err) {
              if (err) {
                console.error('DB error:', err);
                reject(err);
              } else {
                console.log(`[Spleeter] ✓ Complete: Song ${songId}`);
                resolve({
                  song_id: songId,
                  voces: finalVocalsPath,
                  instrumental: finalAccompanimentPath,
                  metodo: 'spleeter'
                });
              }
            }
          );
        } catch (copyErr) {
          db.run(`UPDATE canciones SET procesada = -1 WHERE id = ?`, [songId]);
          reject(copyErr);
        }
      });

      spleeter.on('error', (err) => {
        db.run(`UPDATE canciones SET procesada = -1 WHERE id = ?`, [songId]);
        reject(new Error(`Spleeter process error: ${err.message}`));
      });
    } catch (err) {
      db.run(`UPDATE canciones SET procesada = -1 WHERE id = ?`, [songId]);
      reject(err);
    }
  });
}

/**
 * Validar instalación de Spleeter
 */
function validateSpleeterInstallation() {
  return new Promise((resolve) => {
    const spleeter = spawn(process.env.SPLEETER_EXECUTABLE || 'spleeter', ['--version']);

    spleeter.on('close', (code) => {
      if (code === 0) {
        console.log('✓ Spleeter is installed and available');
        resolve(true);
      } else {
        console.warn('✗ Spleeter not found. Please run: pip install spleeter');
        resolve(false);
      }
    });

    spleeter.on('error', () => {
      console.warn('✗ Spleeter executable not found in PATH');
      resolve(false);
    });
  });
}

/**
 * Limpiar archivos de output (opcional)
 */
function cleanupOutputDir(songId) {
  const outputDir = path.join(SEPARATED_PATH, `song_${songId}`);
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

module.exports = {
  separateVoices,
  validateSpleeterInstallation,
  cleanupOutputDir
};
