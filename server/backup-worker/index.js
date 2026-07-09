// Cloudflare Worker for encrypted Lore Injector backups.
// Keep this source in the repository so client and server backup formats evolve together.

const BACKUP_LIMIT = 10;
const RETENTION_DAYS = 365;
const CHUNK_SIZE = 450000;
const SESSION_DAYS = 30;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    try {
      if (!env.DB) return json({ ok: false, error: 'D1 binding DB missing' }, 500);
      // Await each route so errors from its async body are converted to JSON responses below.
      if (url.pathname === '/api/init') return await initDb(env);
      if (url.pathname === '/api/check-id') return await checkId(request, env);
      if (url.pathname === '/api/register') return await register(request, env);
      if (url.pathname === '/api/login') return await login(request, env);
      if (url.pathname === '/api/backups/list') return await listBackups(request, env);
      if (url.pathname === '/api/backups/create') return await createBackup(request, env);
      if (url.pathname === '/api/backups/replace') return await replaceBackup(request, env);
      if (url.pathname === '/api/backups/get') return await getBackup(request, env);
      if (url.pathname === '/api/backups/delete') return await deleteBackup(request, env);
      if (url.pathname === '/admin') return await adminDashboard(request, env);
      return json({ ok: true, service: 'crack-lore-backup', retentionDays: RETENTION_DAYS, backupLimit: BACKUP_LIMIT });
    } catch (e) {
      return json({ ok: false, error: e && e.message ? e.message : String(e) }, e && e.status ? e.status : 500);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(deleteExpiredBackups(env));
  }
};

async function initDb(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      salt TEXT NOT NULL,
      auth_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_login_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS backups (
      backup_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT,
      created_at INTEGER NOT NULL,
      payload_bytes INTEGER NOT NULL,
      chunk_count INTEGER NOT NULL,
      encrypted_meta TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS backup_chunks (
      backup_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_data TEXT NOT NULL,
      PRIMARY KEY (backup_id, chunk_index)
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expires_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_backups_user_time ON backups(user_id, created_at DESC)')
  ]);
  return json({ ok: true });
}

async function readJson(request) {
  if (request.method !== 'POST') throw httpError('POST required', 405);
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

function cleanId(id) {
  const value = String(id || '').trim();
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(value)) throw httpError('ID must use 3-80 letters, numbers, dot, underscore, or dash', 400);
  return value;
}

function assertAuthSecret(authSecret) {
  const value = String(authSecret || '').trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(value)) throw httpError('invalid auth secret', 400);
  return value;
}

function assertEncryptedPayload(value) {
  const payload = String(value || '');
  if (!/^(?:v1|v2gzip)\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(payload)) throw httpError('invalid encrypted payload', 400);
  return payload;
}

async function checkId(request, env) {
  const body = await readJson(request);
  const id = cleanId(body.id);
  const row = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  return json({ ok: true, available: !row });
}

async function register(request, env) {
  const body = await readJson(request);
  const id = cleanId(body.id);
  const authSecret = assertAuthSecret(body.authSecret);
  const exists = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (exists) throw httpError('ID already exists', 409);
  const salt = randomToken(24);
  const authHash = await sha256Hex(salt + ':' + authSecret);
  await env.DB.prepare('INSERT INTO users (id, salt, auth_hash, created_at) VALUES (?, ?, ?, ?)').bind(id, salt, authHash, Date.now()).run();
  return json({ ok: true });
}

async function login(request, env) {
  const body = await readJson(request);
  const id = cleanId(body.id);
  const authSecret = assertAuthSecret(body.authSecret);
  const row = await env.DB.prepare('SELECT id, salt, auth_hash FROM users WHERE id = ?').bind(id).first();
  if (!row) throw httpError('login failed', 401);
  const authHash = await sha256Hex(row.salt + ':' + authSecret);
  if (!constantEqual(authHash, row.auth_hash)) throw httpError('login failed', 401);
  const token = randomToken(32);
  const now = Date.now();
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(await sha256Hex(token), id, expiresAt, now),
    env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now, id),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now)
  ]);
  return json({ ok: true, token, expiresAt });
}

async function authUser(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw httpError('login required', 401);
  const row = await env.DB.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).first();
  if (!row || Number(row.expires_at) < Date.now()) throw httpError('login required', 401);
  return row.user_id;
}

async function listBackups(request, env) {
  const userId = await authUser(request, env);
  const { results } = await env.DB.prepare('SELECT backup_id, title, created_at, payload_bytes, chunk_count, encrypted_meta FROM backups WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
  return json({ ok: true, items: (results || []).map((row) => ({
    backupId: row.backup_id,
    title: row.title,
    createdAt: row.created_at,
    payloadBytes: row.payload_bytes,
    chunkCount: row.chunk_count,
    encryptedMeta: row.encrypted_meta
  })) });
}

async function createBackup(request, env) {
  const userId = await authUser(request, env);
  const body = await readJson(request);
  const payload = assertEncryptedPayload(body.payload);
  const countRow = await env.DB.prepare('SELECT COUNT(*) AS c FROM backups WHERE user_id = ?').bind(userId).first();
  if (Number(countRow && countRow.c || 0) >= BACKUP_LIMIT) throw httpError('backup limit reached. delete an old backup first', 409);
  const backupId = crypto.randomUUID();
  const chunks = splitChunks(payload, CHUNK_SIZE);
  const now = Date.now();
  const title = String(body.title || '').slice(0, 120);
  const encryptedMeta = String(body.encryptedMeta || '').slice(0, 200000);
  const stmts = [
    env.DB.prepare('INSERT INTO backups (backup_id, user_id, title, created_at, payload_bytes, chunk_count, encrypted_meta) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(backupId, userId, title, now, payload.length, chunks.length, encryptedMeta)
  ];
  chunks.forEach((chunk, i) => stmts.push(env.DB.prepare('INSERT INTO backup_chunks (backup_id, chunk_index, chunk_data) VALUES (?, ?, ?)').bind(backupId, i, chunk)));
  await env.DB.batch(stmts);
  return json({ ok: true, backupId, createdAt: now });
}

async function replaceBackup(request, env) {
  const userId = await authUser(request, env);
  const body = await readJson(request);
  const backupId = String(body.backupId || '');
  const payload = assertEncryptedPayload(body.payload);
  const current = await env.DB.prepare('SELECT backup_id, created_at FROM backups WHERE backup_id = ? AND user_id = ?').bind(backupId, userId).first();
  if (!current) throw httpError('backup not found', 404);
  const chunks = splitChunks(payload, CHUNK_SIZE);
  const encryptedMeta = String(body.encryptedMeta || '').slice(0, 200000);
  const stmts = [
    env.DB.prepare('DELETE FROM backup_chunks WHERE backup_id = ?').bind(backupId),
    env.DB.prepare('UPDATE backups SET payload_bytes = ?, chunk_count = ?, encrypted_meta = ? WHERE backup_id = ? AND user_id = ?').bind(payload.length, chunks.length, encryptedMeta, backupId, userId)
  ];
  chunks.forEach((chunk, i) => stmts.push(env.DB.prepare('INSERT INTO backup_chunks (backup_id, chunk_index, chunk_data) VALUES (?, ?, ?)').bind(backupId, i, chunk)));
  await env.DB.batch(stmts);
  return json({ ok: true, backupId, createdAt: current.created_at });
}

async function getBackup(request, env) {
  const userId = await authUser(request, env);
  const body = await readJson(request);
  const backupId = String(body.backupId || '');
  const meta = await env.DB.prepare('SELECT backup_id FROM backups WHERE backup_id = ? AND user_id = ?').bind(backupId, userId).first();
  if (!meta) throw httpError('backup not found', 404);
  const { results } = await env.DB.prepare('SELECT chunk_data FROM backup_chunks WHERE backup_id = ? ORDER BY chunk_index ASC').bind(backupId).all();
  return json({ ok: true, payload: (results || []).map((row) => row.chunk_data).join('') });
}

async function deleteBackup(request, env) {
  const userId = await authUser(request, env);
  const body = await readJson(request);
  const backupId = String(body.backupId || '');
  const meta = await env.DB.prepare('SELECT backup_id FROM backups WHERE backup_id = ? AND user_id = ?').bind(backupId, userId).first();
  if (!meta) throw httpError('backup not found', 404);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM backup_chunks WHERE backup_id = ?').bind(backupId),
    env.DB.prepare('DELETE FROM backups WHERE backup_id = ?').bind(backupId)
  ]);
  return json({ ok: true });
}

async function adminDashboard(request, env) {
  const url = new URL(request.url);
  const configured = String(env.ADMIN_TOKEN || '');
  if (!configured) return html('<p>ADMIN_TOKEN secret missing.</p>', 403);
  const provided = request.headers.get('X-Admin-Token') || url.searchParams.get('token') || '';
  if (!constantEqual(provided, configured)) return html('<p>Forbidden.</p>', 403);
  const { results } = await env.DB.prepare(`SELECT u.id, u.created_at, u.last_login_at, COUNT(b.backup_id) AS backup_count, COALESCE(SUM(b.payload_bytes), 0) AS bytes, MAX(b.created_at) AS last_backup_at
    FROM users u LEFT JOIN backups b ON u.id = b.user_id
    GROUP BY u.id ORDER BY last_backup_at IS NULL, last_backup_at DESC, u.created_at DESC`).all();
  const rows = (results || []).map((row) => `<tr><td>${escapeHtml(row.id)}</td><td>${fmt(row.backup_count)}</td><td>${fmtBytes(row.bytes)}</td><td>${fmtDate(row.last_backup_at)}</td><td>${fmtDate(row.last_login_at)}</td><td>${fmtDate(row.created_at)}</td></tr>`).join('');
  return html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lore Backup Admin</title><style>body{font-family:system-ui,sans-serif;background:#111;color:#ddd;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:8px;text-align:left}th{background:#1d1d1d}td{font-size:13px}.muted{color:#888}</style><h1>Lore Backup Admin</h1><p class="muted">Encrypted payloads are not shown.</p><table><thead><tr><th>ID</th><th>Backups</th><th>Size</th><th>Last Backup</th><th>Last Login</th><th>Created</th></tr></thead><tbody>${rows}</tbody></table>`);
}

async function deleteExpiredBackups(env) {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const { results } = await env.DB.prepare('SELECT backup_id FROM backups WHERE created_at < ? LIMIT 200').bind(cutoff).all();
  for (const row of results || []) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM backup_chunks WHERE backup_id = ?').bind(row.backup_id),
      env.DB.prepare('DELETE FROM backups WHERE backup_id = ?').bind(row.backup_id)
    ]);
  }
}

function splitChunks(text, size) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });
}

function html(body, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS } });
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function randomToken(bytes) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function constantEqual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function fmt(value) { return String(value == null ? '' : value); }

function fmtBytes(value) {
  const bytes = Number(value || 0);
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  if (bytes > 1024) return Math.ceil(bytes / 1024) + ' KB';
  return bytes + ' B';
}

function fmtDate(timestamp) {
  if (!timestamp) return '-';
  return new Date(Number(timestamp)).toISOString().replace('T', ' ').slice(0, 19);
}
