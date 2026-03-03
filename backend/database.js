const sqlite3 = require('sqlite3').verbose()

const db = new sqlite3.Database('./backend/database.sqlite')

db.serialize(() => {
  // Tabla principal de canciones (actualizada con nuevos campos)
  db.run(`
    CREATE TABLE IF NOT EXISTS canciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      artista TEXT NOT NULL,
      spotify_id TEXT UNIQUE,
      youtube_url TEXT,
      ruta_original TEXT,
      ruta_instrumental TEXT,
      ruta_voces TEXT,
      descargada INTEGER DEFAULT 0,
      separada INTEGER DEFAULT 0,
      letras TEXT,
      letra_sincronizada TEXT,
      metodo_separacion TEXT,
      procesada INTEGER DEFAULT 0,
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fecha_procesamiento TIMESTAMP
    )
  `)

  // Tabla de caché Spotify
  db.run(`
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
  `)

  // Tabla de tracking de procesos
  db.run(`
    CREATE TABLE IF NOT EXISTS procesos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cancion_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      estado TEXT DEFAULT 'pendiente',
      progreso INTEGER DEFAULT 0,
      mensaje_error TEXT,
      fecha_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fecha_fin TIMESTAMP,
      FOREIGN KEY(cancion_id) REFERENCES canciones(id)
    )
  `)

  // Tabla de cola karaoke (actualizada)
  db.run(`
    CREATE TABLE IF NOT EXISTS cola (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cancion_id INTEGER UNIQUE,
      cantante TEXT,
      estado TEXT DEFAULT 'pendiente',
      fecha_agregacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(cancion_id) REFERENCES canciones(id)
    )
  `)

  console.log('✓ Database initialized with all tables')
})

module.exports = db