#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const WEB_PORT = 3000;
const DAEMON_PORT = 7777;
const ELECTRON_PORT = 7778;
const PROJECT_ROOT = path.join(__dirname, '..');
const PID_FILE = path.join(os.tmpdir(), 'tools-dev-daemon.pid');

// Clean up on exit
function cleanup() {
  try { fs.unlinkSync(PID_FILE); } catch {}
}
process.on('exit', cleanup);
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

fs.writeFileSync(PID_FILE, String(process.pid));

// ── Static file web server ────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html',
  '.htm':  'text/html',
  '.js':   'application/javascript',
  '.jsx':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
};

const webServer = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  let filePath = path.normalize(path.join(PROJECT_ROOT, urlPath === '/' ? 'index.html' : urlPath));

  // Prevent path traversal
  if (!filePath.startsWith(PROJECT_ROOT + path.sep) && filePath !== PROJECT_ROOT) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const mime = MIME[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

webServer.listen(WEB_PORT, '127.0.0.1', () => {
  console.log(`[daemon] web server  → http://127.0.0.1:${WEB_PORT}`);
  launchElectron();
});

// ── Electron process ──────────────────────────────────────────────────────────

let electronProc = null;
let electronPid = null;

function launchElectron() {
  // Resolve the electron binary; fall back gracefully if not installed
  let electronBin;
  try {
    electronBin = require('electron');
  } catch {
    console.warn('[daemon] electron package not found – desktop will be unavailable');
    startDaemonApi();
    return;
  }

  const mainScript = path.join(__dirname, 'electron-main.js');

  electronProc = spawn(electronBin, [mainScript], {
    env: {
      ...process.env,
      ELECTRON_CONTROL_PORT: String(ELECTRON_PORT),
      APP_URL: `http://127.0.0.1:${WEB_PORT}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  electronPid = electronProc.pid;
  electronProc.stdout.on('data', (d) => process.stdout.write(`[electron] ${d}`));
  electronProc.stderr.on('data', (d) => process.stderr.write(`[electron] ${d}`));
  electronProc.on('exit', (code) => {
    console.log(`[daemon] electron exited (code ${code})`);
    electronProc = null;
    electronPid = null;
  });

  console.log(`[daemon] electron     → pid ${electronPid}`);
  startDaemonApi();
}

// ── Electron control relay ────────────────────────────────────────────────────

function electronRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: ELECTRON_PORT,
        path: urlPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); }
          catch { resolve({ raw }); }
        });
      }
    );
    req.setTimeout(10000, () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Daemon HTTP API ───────────────────────────────────────────────────────────

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

function startDaemonApi() {
  const server = http.createServer(async (req, res) => {
    const { method, url } = req;

    if (method === 'GET' && url === '/health') {
      send(res, 200, { ok: true, pid: process.pid });
      return;
    }

    if (method === 'GET' && url === '/inspect/desktop/status') {
      if (!electronPid) {
        send(res, 200, { running: false, reason: 'electron not started' });
        return;
      }
      try {
        const info = await electronRequest('GET', '/status');
        send(res, 200, { running: true, pid: electronPid, ...info });
      } catch (e) {
        send(res, 200, { running: false, pid: electronPid, reason: e.message });
      }
      return;
    }

    if (method === 'POST' && url === '/inspect/desktop/screenshot') {
      if (!electronPid) {
        send(res, 503, { error: 'electron is not running' });
        return;
      }
      try {
        const body = await bodyOf(req);
        const result = await electronRequest('POST', '/screenshot', { path: body.path });
        send(res, 200, result);
      } catch (e) {
        send(res, 500, { error: e.message });
      }
      return;
    }

    send(res, 404, { error: 'Not found' });
  });

  server.listen(DAEMON_PORT, '127.0.0.1', () => {
    console.log(`[daemon] control api  → http://127.0.0.1:${DAEMON_PORT}`);
  });

  // Shut down cleanly when parent goes away
  process.on('SIGTERM', () => {
    server.close();
    webServer.close();
    if (electronProc) electronProc.kill('SIGTERM');
    process.exit(0);
  });
}
