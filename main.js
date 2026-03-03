const { app, BrowserWindow } = require('electron')
const path = require('path')

require('./backend/server')

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true
    }
  })

  win.loadFile('./frontend/index.html')
}

app.whenReady().then(createWindow)