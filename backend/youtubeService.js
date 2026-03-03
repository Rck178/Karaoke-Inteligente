/**
 * YouTube Service - Descarga de audios
 * Utiliza yt-dlp para descargar canciones de YouTube
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const DOWNLOAD_PATH = process.env.AUDIO_DOWNLOAD_PATH || './storage/downloaded_audios';

/**
 * Buscar la mejor coincidencia en YouTube
 * @param {string} artist - Artista
 * @param {string} title - Título
 * @returns {Promise<string>} URL de YouTube
 */
async function findYouTubeURL(artist, title) {
  try {
    // Construir búsqueda (preferir "official" para evitar covers)
    const query = `${artist} ${title} official`;

    // Usar youtube-dl para obtener URL del primer resultado
    return new Promise((resolve, reject) => {
      const ytDlp = spawn(process.env.YT_DLP_EXECUTABLE || 'yt-dlp', [
        '--no-warnings',
        '-f', 'best',
        '--quiet',
        '-j',  // JSON output
        `ytsearch:${query}`
      ]);

      let output = '';
      let error = '';

      ytDlp.stdout.on('data', (data) => {
        output += data.toString();
      });

      ytDlp.stderr.on('data', (data) => {
        error += data.toString();
      });

      ytDlp.on('close', (code) => {
        if (code !== 0 || !output) {
          reject(new Error(`Failed to find YouTube URL: ${error || 'No results'}`));
        } else {
          try {
            const result = JSON.parse(output);
            const videoUrl = `https://www.youtube.com/watch?v=${result.id}`;
            resolve(videoUrl);
          } catch (e) {
            reject(e);
          }
        }
      });

      ytDlp.on('error', reject);
    });
  } catch (err) {
    throw new Error(`YouTube search error: ${err.message}`);
  }
}

/**
 * Descargar audio de YouTube
 * @param {number} songId - ID interno de canción
 * @param {string} artist - Artista
 * @param {string} title - Título
 * @param {Database} db - Instancia SQLite
 * @returns {Promise<string>} Ruta del archivo descargado
 */
async function downloadFromYouTube(songId, artist, title, db) {
  return new Promise(async (resolve, reject) => {
    try {
      // Asegurar que directorio existe
      if (!fs.existsSync(DOWNLOAD_PATH)) {
        fs.mkdirSync(DOWNLOAD_PATH, { recursive: true });
      }

      // Actualizar estado en BD
      db.run(`UPDATE canciones SET procesada = -2 WHERE id = ?`, [songId]);

      // Buscar URL
      console.log(`[YT] Searching: ${artist} - ${title}`);
      const youtubeUrl = await findYouTubeURL(artist, title);
      console.log(`[YT] Found: ${youtubeUrl}`);

      // Descargar
      const outputPath = path.join(DOWNLOAD_PATH, `${songId}.%(ext)s`);

      const ytDlp = spawn(process.env.YT_DLP_EXECUTABLE || 'yt-dlp', [
        '-f', 'bestaudio',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192',
        '-o', outputPath,
        youtubeUrl
      ]);

      let error = '';

      ytDlp.stderr.on('data', (data) => {
        console.log(`[YT] ${data.toString().trim()}`);
      });

      ytDlp.on('close', (code) => {
        if (code !== 0) {
          const err = new Error(`yt-dlp failed with code ${code}: ${error}`);
          db.run(`UPDATE canciones SET procesada = -1 WHERE id = ?`, [songId]);
          reject(err);
        } else {
          // Buscar archivo descargado (puede ser .mp3 o .m4a convertido)
          const mp3Path = path.join(DOWNLOAD_PATH, `${songId}.mp3`);
          const m4aPath = path.join(DOWNLOAD_PATH, `${songId}.m4a`);
          const webmPath = path.join(DOWNLOAD_PATH, `${songId}.webm`);

          let finalPath;
          if (fs.existsSync(mp3Path)) {
            finalPath = mp3Path;
          } else if (fs.existsSync(m4aPath)) {
            finalPath = m4aPath;
          } else if (fs.existsSync(webmPath)) {
            finalPath = webmPath;
          } else {
            // Buscar cualquier archivo creado
            const files = fs.readdirSync(DOWNLOAD_PATH).filter(f => f.startsWith(`${songId}.`));
            if (files.length > 0) {
              finalPath = path.join(DOWNLOAD_PATH, files[0]);
            } else {
              const err = new Error('Audio file not found after download');
              db.run(`UPDATE canciones SET procesada = -1 WHERE id = ?`, [songId]);
              return reject(err);
            }
          }

          console.log(`[YT] Download complete: ${finalPath}`);
          resolve(finalPath);
        }
      });

      ytDlp.on('error', (err) => {
        db.run(`UPDATE canciones SET procesada = -1 WHERE id = ?`, [songId]);
        reject(new Error(`yt-dlp process error: ${err.message}`));
      });
    } catch (err) {
      db.run(`UPDATE canciones SET procesada = -1 WHERE id = ?`, [songId]);
      reject(err);
    }
  });
}

/**
 * Validar que yt-dlp está instalado
 */
function validateYtDlpInstallation() {
  return new Promise((resolve) => {
    const ytDlp = spawn(process.env.YT_DLP_EXECUTABLE || 'yt-dlp', ['--version']);

    ytDlp.on('close', (code) => {
      if (code === 0) {
        console.log('✓ yt-dlp is installed and available');
        resolve(true);
      } else {
        console.warn('✗ yt-dlp not found. Please run: pip install yt-dlp');
        resolve(false);
      }
    });

    ytDlp.on('error', () => {
      console.warn('✗ yt-dlp executable not found in PATH');
      resolve(false);
    });
  });
}

module.exports = {
  downloadFromYouTube,
  findYouTubeURL,
  validateYtDlpInstallation
};
