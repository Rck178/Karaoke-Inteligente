# 🎵 Karaoke Inteligente Pro

Aplicación Electron para buscar, descargar canciones y hacer karaoke inteligente con separación de voces por IA.

## ✨ Características

- 🔍 **Búsqueda en Spotify**: Busca cualquier canción directamente desde la app
- ⬇️ **Descarga automática de YouTube**: Descarga audios MP3 automáticamente
- 🎙️ **Separación de voces con IA**: Separa voces e instrumentales usando:
  - Spleeter (local, gratis, lento)
  - RapidAPI (online, rápido, requiere API key)
- 📝 **Letras sincronizadas**: Obtén letras en tiempo real desde Musixmatch/lrclib
- 🎤 **Reproductor integrado**: Controla reproducción, volumen y progreso
- 📋 **Cola de karaoke**: Gestiona cantantes en espera

## 🚀 Instalación

### Requisitos previos

- Node.js 14+ y npm
- Python 3.8+
- FFmpeg instalado en el sistema
- yt-dlp instalado (`pip install yt-dlp`)
- Spleeter instalado (opcional) (`pip install spleeter`)

### Paso 1: Clonar y configurar

```bash
cd karaoke-inteligente
npm install
```

### Paso 2: Configurar variables de entorno

Copia `.env.example` a `.env` y rellena tus credenciales:

```bash
cp .env.example .env
```

**Variables requeridas:**

```env
# Spotify (requerido)
SPOTIFY_CLIENT_ID=your_id
SPOTIFY_CLIENT_SECRET=your_secret

# Musixmatch (opcional, para letras)
MUSIXMATCH_API_KEY=your_key

# RapidAPI (opcional, para separación rápida)
RAPIDAPI_KEY=your_key
RAPIDAPI_HOST=your_host

# Rutas (por defecto está bien)
STORAGE_PATH=./storage
AUDIO_DOWNLOAD_PATH=./storage/downloaded_audios
```

### Cómo obtener credenciales

#### Spotify
1. Ve a https://developer.spotify.com/dashboard
2. Crea una nueva app
3. Obtén Client ID y Client Secret

#### Musixmatch
1. Regístrate en https://www.musixmatch.com/
2. Ve a la sección API
3. Solicita una API key

#### RapidAPI (Vocal Remover)
1. Regístrate en https://rapidapi.com/
2. Busca "Vocal Remover" o "Voice Separation"
3. Suscríbete al plan gratuito
4. Obtén tu API Key

### Paso 3: Crear carpetas de almacenamiento

```bash
mkdir -p storage/downloaded_audios storage/separated_tracks storage/cache
```

### Paso 4: Instalar dependencias de Python (opcional pero recomendado)

```bash
pip install -r python-engine/requirements.txt
```

Si usarás Spleeter:
```bash
pip install spleeter
```

### Paso 5: Iniciar la aplicación

```bash
npm start
```

O para desarrollo con live reload:
```bash
npm run dev
```

## 📖 Uso

### 1. Buscar canción
- Ve a la pestaña "🔍 Buscar Canciones"
- Ingresa artista y nombre de la canción
- Haz clic en "Buscar en Spotify"
- Selecciona el resultado y haz clic en "Descargar"

### 2. Procesar voces
- Ve a "📚 Mi Librería"
- Espera a que la canción se descargue
- Haz clic en "Procesar" para separar voces
- Elige si procesar localmente (gratis, lento) u online (rápido, pago)

### 3. Cantar con karaoke
- Ve a "♪ Reproductor"
- Carga una canción desde tu librería
- Las letras aparecerán automáticamente (sincronizadas)
- Usa los controles para reproducir, pausar, ajustar volumen

### 4. Gestionar cola
- Ve a "📋 Cola de Karaoke"
- Selecciona una canción y nombre del cantante
- Haz clic en "Agregar a la cola"
- Administra los cantantes en espera

## 🏗️ Arquitectura

```
┌─ Electron (UI)
│  ├─ index.html (Interfaz principal)
│  ├─ styles.css (Estilos)
│  └─ app.js (Lógica frontend)
│
├─ Express Backend (API)
│  ├─ server.js
│  ├─ routes.js (Todos los endpoints)
│  ├─ spotifyClient.js
│  ├─ youtubeService.js
│  ├─ spleeterService.js
│  ├─ rapidapiService.js
│  ├─ musixmatchService.js
│  ├─ separationOrchestrator.js
│  └─ database.js (SQLite)
│
└─ Python Engine
   └─ separate.py (Separación de voces, si lo necesitas)
```

## 📡 API Endpoints

### Búsqueda
- `GET /api/search/spotify?q=query` - Buscar canción en Spotify
- `POST /api/download` - Descargar canción de YouTube

### Canciones
- `GET /api/songs` - Listar todas las canciones
- `POST /api/songs` - Agregar canción manualmente
- `GET /api/songs/:id` - Obtener detalles de canción

### Procesamiento
- `POST /api/separate/:id` - Separar voces (elige método local/online)

### Letras
- `GET /api/lyrics/:id?source=musixmatch` - Obtener letras

### Cola
- `GET /api/queue` - Listar cola
- `POST /api/queue` - Agregar a la cola
- `DELETE /api/queue/:id` - Remover de cola
- `PUT /api/queue/:id` - Actualizar estado

## ⚙️ Configuración avanzada

### Cambiar método de separación por defecto
En `.env`:
```env
DEFAULT_SEPARATION_METHOD=local  # o "online"
```

### Usar GPU para Spleeter (si tienes NVIDIA)
```bash
pip install spleeter[gpu]
```

## 🐛 Solución de problemas

### "yt-dlp not found"
```bash
pip install yt-dlp
# O descarga manualmente desde https://github.com/yt-dlp/yt-dlp
```

### "Spleeter not found"
```bash
pip install spleeter librosa numpy scipy tensorflow
```

### "ffmpeg not found"
```bash
# Windows
choco install ffmpeg

# macOS
brew install ffmpeg

# Linux
sudo apt-get install ffmpeg
```

### Errores de conectividad a Spotify
- Verifica que SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET sean correctos
- Asegúrate de que tu cuenta de Spotify tenga acceso a API

### La separación toma mucho tiempo
- Sin GPU es normal que tarde 2-5 minutos por canción
- Considera usar el método "online" con RapidAPI para mayor velocidad

## 📝 Notas legales

Esta aplicación es para uso personal y educativo. Para negocio local de karaoke:

- Obtén **licencias de reproducción pública** (ASCAP, BMI, SESAC en USA)
- Respeta los términos de servicio de Spotify, YouTube y otras APIs
- No distribuyas archivos descargados fuera de tu negocio
- No uses para fines comerciales sin permiso

## 🤝 Contribuyciones

Las contribuciones son bienvenidas. Por favor:
1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## 📄 Licencia

MIT License - Libre para usar, modificar y distribuir

## 🎵 Créditos

- Spotify API por Spotify
- Spleeter por Deezer
- yt-dlp comun ity
- Musixmatch por sus letras
- Electron por GitHub

---

**¿Problemas o sugerencias?** Abre un issue en el repositorio o contacta al mantenedor.

**Versión:** 1.0.0
**Última actualización:** 2025-03-03
