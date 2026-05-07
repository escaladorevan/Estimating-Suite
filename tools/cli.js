#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const DAEMON_PORT = 7777;

function daemonRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: DAEMON_PORT,
        path: urlPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); }
          catch { resolve({ raw }); }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function isDaemonRunning() {
  try {
    await daemonRequest('GET', '/health');
    return true;
  } catch {
    return false;
  }
}

async function startDaemon() {
  const daemonScript = path.join(__dirname, 'daemon.js');
  const child = spawn(process.execPath, [daemonScript], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Poll until daemon is ready (up to 15 s)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isDaemonRunning()) return;
  }
  throw new Error('Daemon failed to start within 15 s');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      positional.push(args[i]);
    }
  }
  return { positional, flags };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv);

  // No subcommand → start daemon + web + desktop
  if (positional.length === 0) {
    if (await isDaemonRunning()) {
      console.log('tools-dev: already running');
      return;
    }
    process.stdout.write('tools-dev: starting daemon + web + desktop … ');
    await startDaemon();
    console.log('ready');
    return;
  }

  const [cmd, target, action] = positional;

  if (cmd !== 'inspect') {
    console.error(`tools-dev: unknown command "${cmd}"`);
    process.exit(1);
  }

  if (target !== 'desktop') {
    console.error(`tools-dev: unknown target "${target}"`);
    process.exit(1);
  }

  if (!action) {
    console.error('tools-dev: missing action (status | screenshot)');
    process.exit(1);
  }

  if (!(await isDaemonRunning())) {
    console.error('tools-dev: daemon is not running – start it first with: pnpm tools-dev');
    process.exit(1);
  }

  if (action === 'status') {
    const result = await daemonRequest('GET', '/inspect/desktop/status');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (action === 'screenshot') {
    const outputPath = flags.path;
    if (!outputPath) {
      console.error('tools-dev: screenshot requires --path <file>');
      process.exit(1);
    }
    const result = await daemonRequest('POST', '/inspect/desktop/screenshot', { path: outputPath });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error(`tools-dev: unknown action "${action}" (status | screenshot)`);
  process.exit(1);
}

main().catch((e) => {
  console.error(`tools-dev: ${e.message}`);
  process.exit(1);
});
