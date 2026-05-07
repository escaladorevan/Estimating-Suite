'use strict';

const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');

const CONTROL_PORT = parseInt(process.env.ELECTRON_CONTROL_PORT || '7778', 10);
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:3000';

let mainWindow = null;
let controlServer = null;

// ── Window ────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'F&S Estimating Suite',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(APP_URL);
  mainWindow.on('closed', () => { mainWindow = null; });

  startControlServer();
});

app.on('window-all-closed', () => {
  if (controlServer) controlServer.close();
  if (process.platform !== 'darwin') app.quit();
});

// ── Control HTTP server ───────────────────────────────────────────────────────

function bodyOf(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(e); }
    });
  });
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function startControlServer() {
  controlServer = http.createServer(async (req, res) => {
    const { method, url } = req;

    if (method === 'GET' && url === '/status') {
      if (!mainWindow) {
        send(res, 200, { visible: false, url: null, title: null });
        return;
      }
      send(res, 200, {
        visible: mainWindow.isVisible(),
        focused: mainWindow.isFocused(),
        url: mainWindow.webContents.getURL(),
        title: mainWindow.getTitle(),
        bounds: mainWindow.getBounds(),
      });
      return;
    }

    if (method === 'POST' && url === '/screenshot') {
      if (!mainWindow) {
        send(res, 503, { error: 'no window open' });
        return;
      }
      try {
        const body = await bodyOf(req);
        const outputPath = body.path;
        if (!outputPath) { send(res, 400, { error: 'path is required' }); return; }

        const image = await mainWindow.webContents.capturePage();
        const buffer = image.toPNG();
        fs.writeFileSync(outputPath, buffer);

        send(res, 200, { ok: true, path: outputPath, bytes: buffer.length });
      } catch (e) {
        send(res, 500, { error: e.message });
      }
      return;
    }

    send(res, 404, { error: 'Not found' });
  });

  controlServer.listen(CONTROL_PORT, '127.0.0.1', () => {
    console.log(`[electron] control server → http://127.0.0.1:${CONTROL_PORT}`);
  });
}
