import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../web/dist');
const port = Number(process.env.EVOFIT_DEMO_PORT || 5174);
const secretFile = process.env.EVOFIT_DEMO_SECRET_FILE;
if (!secretFile) throw new Error('EVOFIT_DEMO_SECRET_FILE is required');
const passcode = readFileSync(secretFile, 'utf8').trim();
if (passcode.length < 12) throw new Error('Demo passcode must be at least 12 characters');
const session = createHash('sha256').update(`evofit-demo:${passcode}`).digest('hex');

const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function sameSecret(value) {
  const a = Buffer.from(value || '');
  const b = Buffer.from(session);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieValue(header = '') {
  const match = header.match(/(?:^|;\s*)evofit_demo=([^;]+)/);
  return match?.[1];
}

function safeNext(value) {
  return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/';
}

function loginPage(next, incorrect = false) {
  const target = encodeURIComponent(safeNext(next));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>EvoFit demo access</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:radial-gradient(circle at top right,#4c171b,#111113 55%);color:white;font:16px system-ui,sans-serif;padding:24px}.card{width:min(100%,420px);padding:32px;border:1px solid #38383d;border-radius:18px;background:#1b1b1f;box-shadow:0 25px 60px #0006}.brand{font-weight:900;font-style:italic;font-size:28px;letter-spacing:-.04em}.brand span{color:#ef343e}h1{font-size:26px;margin:30px 0 8px}p{color:#b5b5be;line-height:1.5;margin:0 0 24px}label{display:block;font-size:13px;font-weight:700;margin-bottom:9px}input{width:100%;padding:14px;border-radius:9px;border:1px solid #55555f;background:#101013;color:white;font-size:18px;letter-spacing:.08em}button{width:100%;margin-top:14px;padding:14px;border:0;border-radius:9px;background:#e5323a;color:white;font-weight:800;font-size:16px}.error{color:#ff9ca0;margin-top:12px;font-size:13px}
  </style></head><body><main class="card"><div class="brand">EVO<span>FIT</span></div><h1>Gym demo</h1><p>Enter the access code to view the dashboard and screen player.</p><form method="post" action="/__demo_login?next=${target}"><label for="code">Access code</label><input id="code" name="code" type="password" autocomplete="off" required autofocus><button>Open demo</button>${incorrect ? '<div class="error">That code did not match. Please try again.</div>' : ''}</form></main></body></html>`;
}

function sendLogin(res, next, incorrect = false) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
  res.end(loginPage(next, incorrect));
}

function proxyApi(req, res) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.cookie;
  delete headers.connection;
  delete headers['content-length'];
  const upstream = httpRequest({ hostname: '127.0.0.1', port: 8080, path: req.url, method: req.method, headers }, response => {
    const responseHeaders = { ...response.headers, 'cache-control': 'no-store' };
    delete responseHeaders['set-cookie'];
    res.writeHead(response.statusCode || 502, responseHeaders);
    pipeline(response, res, () => {});
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('EvoFit backend is unavailable. Check Docker on the host Mac.');
  });
  pipeline(req, upstream, () => {});
}

function serveStatic(req, res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { res.writeHead(400); res.end(); return; }
  const candidate = resolve(root, `.${decoded}`);
  if (candidate !== root && !candidate.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  let file = candidate;
  try { if (!statSync(file).isFile()) file = resolve(root, 'index.html'); }
  catch { file = resolve(root, 'index.html'); }
  const stat = statSync(file);
  const headers = { 'content-type': mime[extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes' };
  if (file.endsWith('index.html')) headers['cache-control'] = 'no-store';
  const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || end < start) { res.writeHead(416, { 'content-range': `bytes */${stat.size}` }); res.end(); return; }
    res.writeHead(206, { ...headers, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${stat.size}` });
    if (req.method === 'HEAD') res.end(); else createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'content-length': stat.size });
  if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/__demo_login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024) req.destroy();
    });
    req.on('end', () => {
      const supplied = new URLSearchParams(body).get('code') || '';
      const a = Buffer.from(supplied);
      const b = Buffer.from(passcode);
      if (a.length !== b.length || !timingSafeEqual(a, b)) { sendLogin(res, url.searchParams.get('next'), true); return; }
      res.writeHead(303, { location: safeNext(url.searchParams.get('next')), 'set-cookie': `evofit_demo=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`, 'cache-control': 'no-store' });
      res.end();
    });
    return;
  }
  if (!sameSecret(cookieValue(req.headers.cookie))) {
    if (req.method === 'GET' && !url.pathname.startsWith('/api/') && !extname(url.pathname)) sendLogin(res, req.url);
    else { res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end('Demo access code required'); }
    return;
  }
  if (url.pathname === '/__demo_logout') {
    res.writeHead(303, { location: '/', 'set-cookie': 'evofit_demo=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0', 'cache-control': 'no-store' });
    res.end();
    return;
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) { proxyApi(req, res); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  serveStatic(req, res, url.pathname);
}).listen(port, '127.0.0.1', () => console.log(`EvoFit demo gateway listening on 127.0.0.1:${port}`));
