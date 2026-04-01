const express = require('express');
const Database = require('better-sqlite3');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || null;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'umzug.db'));

// Init DB
db.exec(`
  CREATE TABLE IF NOT EXISTS boxes (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    old_room TEXT NOT NULL,
    new_room TEXT NOT NULL,
    color TEXT NOT NULL,
    teacher TEXT DEFAULT '',
    contents TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )
`);

// Migration: add teacher column if it doesn't exist (for existing DBs)
try {
  db.exec(`ALTER TABLE boxes ADD COLUMN teacher TEXT DEFAULT ''`);
} catch (_) { /* column already exists */ }

// ===== Sicherheits-Header =====
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],  // inline scripts in box.html
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", "data:"],             // QR-Code data-URLs
    }
  }
}));

// ===== Rate Limiting =====
// Interne Netze (Schule, Büro) vom Limit ausnehmen
const TRUSTED_NETWORKS = (process.env.TRUSTED_NETWORKS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function isTrusted(ip) {
  if (!TRUSTED_NETWORKS.length) return false;
  return TRUSTED_NETWORKS.some(net => ip.startsWith(net));
}

function makeLimit(max, windowMin) {
  return rateLimit({
    windowMs: windowMin * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => isTrusted(req.ip),
    message: { error: 'Zu viele Anfragen – bitte kurz warten.' }
  });
}

// QR-Scans: Träger scannt viele Kisten am Tag → grosszügig
const limitScan   = makeLimit(300, 15);   // 300 Scans / 15 Min
// Übersicht & Daten lesen
const limitRead   = makeLimit(100, 15);   // 100 Req  / 15 Min
// QR-Code generieren (CPU-intensiver)
const limitQr     = makeLimit(60,  15);   //  60 Req  / 15 Min
// Schreiben: nur Lehrer/Admin legen Kisten an
const limitWrite  = makeLimit(30,  15);   //  30 Req  / 15 Min

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: get base URL from request
function getBaseUrl(req) {
  if (BASE_URL) return BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// API: list all boxes
app.get('/api/boxes', limitRead, (req, res) => {
  const boxes = db.prepare('SELECT * FROM boxes ORDER BY created_at DESC').all();
  res.json(boxes);
});

// API: get single box
app.get('/api/boxes/:id', limitScan, (req, res) => {
  const box = db.prepare('SELECT * FROM boxes WHERE id = ?').get(req.params.id);
  if (!box) return res.status(404).json({ error: 'Kiste nicht gefunden' });
  res.json(box);
});

// API: create box
app.post('/api/boxes', limitWrite, (req, res) => {
  const { label, old_room, new_room, color, teacher, contents, notes } = req.body;
  if (!label || !old_room || !new_room || !color) {
    return res.status(400).json({ error: 'label, old_room, new_room, color sind Pflichtfelder' });
  }
  const id = uuidv4();
  db.prepare(
    'INSERT INTO boxes (id, label, old_room, new_room, color, teacher, contents, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, label, old_room, new_room, color, teacher || '', contents || '', notes || '');
  const box = db.prepare('SELECT * FROM boxes WHERE id = ?').get(id);
  res.status(201).json(box);
});

// API: update box
app.put('/api/boxes/:id', limitWrite, (req, res) => {
  const { label, old_room, new_room, color, teacher, contents, notes } = req.body;
  const box = db.prepare('SELECT * FROM boxes WHERE id = ?').get(req.params.id);
  if (!box) return res.status(404).json({ error: 'Kiste nicht gefunden' });
  db.prepare(
    'UPDATE boxes SET label=?, old_room=?, new_room=?, color=?, teacher=?, contents=?, notes=? WHERE id=?'
  ).run(
    label ?? box.label,
    old_room ?? box.old_room,
    new_room ?? box.new_room,
    color ?? box.color,
    teacher ?? box.teacher,
    contents ?? box.contents,
    notes ?? box.notes,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM boxes WHERE id = ?').get(req.params.id));
});

// API: delete box
app.delete('/api/boxes/:id', limitWrite, (req, res) => {
  const box = db.prepare('SELECT * FROM boxes WHERE id = ?').get(req.params.id);
  if (!box) return res.status(404).json({ error: 'Kiste nicht gefunden' });
  db.prepare('DELETE FROM boxes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// API: generate QR code as data URL
app.get('/api/boxes/:id/qr', limitQr, async (req, res) => {
  const box = db.prepare('SELECT * FROM boxes WHERE id = ?').get(req.params.id);
  if (!box) return res.status(404).json({ error: 'Kiste nicht gefunden' });
  const url = `${getBaseUrl(req)}/box/${box.id}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    });
    res.json({ qr: qrDataUrl, url });
  } catch (err) {
    res.status(500).json({ error: 'QR-Generierung fehlgeschlagen' });
  }
});

// Box detail page (for QR scan)
app.get('/box/:id', limitScan, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'box.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Berufskolleg Umzug-App läuft auf Port ${PORT}`);
  if (BASE_URL) console.log(`Base URL: ${BASE_URL}`);
});
