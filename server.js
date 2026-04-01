const express = require('express');
const Database = require('better-sqlite3');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const PDFDocument = require('pdfkit');
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

// ===== PDF-Label-Generierung =====
const SUBJECT_MAP = {
  mathematik:     { name: 'Mathematik',              color: '#2563EB' },
  deutsch:        { name: 'Deutsch',                 color: '#DC2626' },
  englisch:       { name: 'Englisch / Fremdsprachen',color: '#16A34A' },
  geschichte:     { name: 'Geschichte / Sozialkunde',color: '#854D0E' },
  religion_ethik: { name: 'Religion / Ethik',        color: '#4338CA' },
  sport:          { name: 'Sport',                   color: '#DB2777' },
  kunst:          { name: 'Kunst / Musik',           color: '#C026D3' },
  bwl:            { name: 'BWL / Wirtschaft',        color: '#B45309' },
  informatik:     { name: 'Informatik',              color: '#7C3AED' },
  technik:        { name: 'Technik',                 color: '#475569' },
  physik:         { name: 'Physik',                  color: '#EA580C' },
  chemie:         { name: 'Chemie',                  color: '#0891B2' },
  biologie:       { name: 'Biologie',                color: '#0D9488' },
  verwaltung:     { name: 'Verwaltung / Buero',      color: '#4B5563' },
  sonstiges:      { name: 'Sonstiges',               color: '#64748B' },
};

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

app.get('/api/boxes/:id/pdf', limitQr, async (req, res) => {
  const box = db.prepare('SELECT * FROM boxes WHERE id = ?').get(req.params.id);
  if (!box) return res.status(404).json({ error: 'Kiste nicht gefunden' });

  const url = `${getBaseUrl(req)}/box/${box.id}`;

  let qrBuffer;
  try {
    qrBuffer = await QRCode.toBuffer(url, { type: 'png', width: 220, margin: 1 });
  } catch (err) {
    return res.status(500).json({ error: 'QR-Generierung fehlgeschlagen' });
  }

  const subject = SUBJECT_MAP[box.color] || SUBJECT_MAP.sonstiges;
  const [r, g, b] = hexToRgb(subject.color);

  const doc = new PDFDocument({ size: 'A5', margin: 0 });
  const safeName = box.label.replace(/[^a-z0-9äöüß]/gi, '_').slice(0, 30);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="label-${safeName}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width;   // 419.53 pt
  const H = doc.page.height;  // 595.28 pt
  const M = 26;

  // ── Farbiger Header ──
  doc.rect(0, 0, W, 90).fill([r, g, b]);
  doc.fillColor('white')
     .font('Helvetica').fontSize(9)
     .text(subject.name.toUpperCase(), M, 16, { characterSpacing: 1.2, width: W - M * 2 });
  doc.fillColor('white')
     .font('Helvetica-Bold').fontSize(21)
     .text(box.label, M, 33, { width: W - M * 2 });

  // ── Räume ──
  const roomY = 104;
  const colW = Math.floor((W - M * 2 - 28) / 2);

  doc.fillColor('#64748B').font('Helvetica').fontSize(8)
     .text('AKTUELLER RAUM', M, roomY, { characterSpacing: 0.5, width: colW });
  doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(13)
     .text(box.old_room, M, roomY + 12, { width: colW });

  doc.fillColor('#94A3B8').font('Helvetica').fontSize(20)
     .text('>', M + colW + 4, roomY + 8, { width: 20, align: 'center' });

  doc.fillColor('#64748B').font('Helvetica').fontSize(8)
     .text('ZIELRAUM', M + colW + 28, roomY, { characterSpacing: 0.5, width: colW });
  doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(13)
     .text(box.new_room, M + colW + 28, roomY + 12, { width: colW });

  let y = 153;
  doc.moveTo(M, y).lineTo(W - M, y).strokeColor('#E2E8F0').lineWidth(0.5).stroke();
  y += 12;

  // ── Lehrkraft ──
  if (box.teacher && box.teacher.trim()) {
    doc.fillColor('#64748B').font('Helvetica').fontSize(8)
       .text('LEHRKRAFT', M, y, { characterSpacing: 0.5 });
    doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(12)
       .text(box.teacher, M, y + 11);
    y += 38;
    doc.moveTo(M, y).lineTo(W - M, y).strokeColor('#E2E8F0').lineWidth(0.5).stroke();
    y += 12;
  }

  // ── QR-Code (rechts) + Inhalt (links) ──
  const qrSize = 115;
  const qrX = W - M - qrSize;
  const qrY = y;
  doc.image(qrBuffer, qrX, qrY, { width: qrSize });

  const contentW = qrX - M - 14;
  doc.fillColor('#64748B').font('Helvetica').fontSize(8)
     .text('INHALT', M, y, { characterSpacing: 0.5 });
  y += 14;

  if (box.contents && box.contents.trim()) {
    box.contents.split('\n').filter(l => l.trim()).slice(0, 10).forEach(line => {
      doc.fillColor('#1E293B').font('Helvetica').fontSize(10)
         .text('\u2022 ' + line.trim(), M, y, { width: contentW, lineBreak: false });
      y += 15;
    });
  } else {
    doc.fillColor('#94A3B8').font('Helvetica-Oblique').fontSize(10)
       .text('Kein Inhalt angegeben', M, y, { width: contentW });
    y += 15;
  }

  // ── Hinweis-Box ──
  if (box.notes && box.notes.trim()) {
    const notesY = Math.max(y + 12, qrY + qrSize + 12);
    const notesH = 34;
    doc.rect(M, notesY, W - M * 2, notesH).fill('#FEF3C7');
    doc.rect(M, notesY, 4, notesH).fill('#F59E0B');
    doc.fillColor('#92400E').font('Helvetica-Bold').fontSize(9)
       .text('HINWEIS:  ', M + 12, notesY + 11, { continued: true })
       .font('Helvetica').text(box.notes, { width: W - M * 2 - 20, lineBreak: false });
  }

  // ── URL unten ──
  doc.fillColor('#94A3B8').font('Helvetica').fontSize(7.5)
     .text(url, M, H - 18, { width: W - M * 2 });

  doc.end();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Berufskolleg Umzug-App läuft auf Port ${PORT}`);
  if (BASE_URL) console.log(`Base URL: ${BASE_URL}`);
});
