const express = require('express');
const Database = require('better-sqlite3');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
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
app.get('/api/boxes', (req, res) => {
  const boxes = db.prepare('SELECT * FROM boxes ORDER BY created_at DESC').all();
  res.json(boxes);
});

// API: get single box
app.get('/api/boxes/:id', (req, res) => {
  const box = db.prepare('SELECT * FROM boxes WHERE id = ?').get(req.params.id);
  if (!box) return res.status(404).json({ error: 'Kiste nicht gefunden' });
  res.json(box);
});

// API: create box
app.post('/api/boxes', (req, res) => {
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
app.put('/api/boxes/:id', (req, res) => {
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
app.delete('/api/boxes/:id', (req, res) => {
  const box = db.prepare('SELECT * FROM boxes WHERE id = ?').get(req.params.id);
  if (!box) return res.status(404).json({ error: 'Kiste nicht gefunden' });
  db.prepare('DELETE FROM boxes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// API: generate QR code as data URL
app.get('/api/boxes/:id/qr', async (req, res) => {
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
app.get('/box/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'box.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Berufskolleg Umzug-App läuft auf Port ${PORT}`);
  if (BASE_URL) console.log(`Base URL: ${BASE_URL}`);
});
