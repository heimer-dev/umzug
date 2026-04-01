// ===== Fach-Farben =====
const COLORS = {
  mathematik:     { bg: '#2563EB', icon: '📐', name: 'Mathematik' },
  deutsch:        { bg: '#DC2626', icon: '📖', name: 'Deutsch' },
  englisch:       { bg: '#16A34A', icon: '🌍', name: 'Englisch / Fremdsprachen' },
  geschichte:     { bg: '#854D0E', icon: '📜', name: 'Geschichte / Sozialkunde' },
  religion_ethik: { bg: '#4338CA', icon: '🕌', name: 'Religion / Ethik' },
  sport:          { bg: '#DB2777', icon: '🏃', name: 'Sport' },
  kunst:          { bg: '#C026D3', icon: '🎨', name: 'Kunst / Musik' },
  bwl:            { bg: '#B45309', icon: '📊', name: 'BWL / Wirtschaft' },
  informatik:     { bg: '#7C3AED', icon: '💻', name: 'Informatik' },
  technik:        { bg: '#475569', icon: '🔧', name: 'Technik' },
  physik:         { bg: '#EA580C', icon: '⚡', name: 'Physik' },
  chemie:         { bg: '#0891B2', icon: '🧪', name: 'Chemie' },
  biologie:       { bg: '#0D9488', icon: '🌱', name: 'Biologie' },
  verwaltung:     { bg: '#4B5563', icon: '📋', name: 'Verwaltung / Büro' },
  sonstiges:      { bg: '#64748B', icon: '📦', name: 'Sonstiges' },
};

// ===== State =====
let boxes = [];
let currentUser = null;

// ===== DOM refs =====
const form = document.getElementById('box-form');
const boxList = document.getElementById('box-list');
const boxCount = document.getElementById('box-count');
const searchInput = document.getElementById('search');
const printModal = document.getElementById('print-modal');
const printArea = document.getElementById('print-area');
const modalClose = document.getElementById('modal-close');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalBackdrop = document.getElementById('modal-backdrop');
const cancelEditBtn = document.getElementById('cancel-edit');
const formTitle = document.getElementById('form-title');
const printAllBtn = document.getElementById('print-all-btn');
const pdfBtn = document.getElementById('pdf-btn');
const pdfAllBtn = document.getElementById('pdf-all-btn');
const modalTitle = document.getElementById('modal-title');

// ===== Init =====
initAuth();

// ===== Events =====
form.addEventListener('submit', onSubmit);
searchInput.addEventListener('input', renderList);
modalClose.addEventListener('click', closeModal);
modalCloseBtn.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);
cancelEditBtn.addEventListener('click', cancelEdit);
printAllBtn.addEventListener('click', printAll);

// ===== Auth =====
async function initAuth() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) { window.location.href = '/login'; return; }
  currentUser = await res.json();

  const actions = document.getElementById('header-actions');
  if (actions) {
    const adminLink = currentUser.role === 'admin'
      ? `<a href="/admin" class="btn btn-outline-white">&#9881; Admin</a>` : '';
    actions.innerHTML = `
      <span class="header-user">&#128100; ${escHtml(currentUser.username)}</span>
      ${adminLink}
      <button class="btn btn-danger-outline" id="logout-btn">Abmelden</button>`;
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/login';
    });
  }
  // Formular und Schreib-Aktionen nur für Admins
  if (currentUser.role !== 'admin') {
    document.querySelector('.form-card').style.display = 'none';
    document.getElementById('print-all-btn').style.display = 'none';
  }
  loadBoxes();
}

// ===== API =====
async function loadBoxes() {
  const res = await fetch('/api/boxes');
  boxes = await res.json();
  renderList();
}

async function onSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('edit-id').value;
  const payload = {
    label:    document.getElementById('label').value.trim(),
    old_room: document.getElementById('old_room').value.trim(),
    new_room: document.getElementById('new_room').value.trim(),
    color:    document.getElementById('color').value,
    teacher:  document.getElementById('teacher').value.trim(),
    contents: document.getElementById('contents').value.trim(),
    notes:    document.getElementById('notes').value.trim(),
  };

  let newBoxId = null;
  if (id) {
    await fetch(`/api/boxes/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  } else {
    const res = await fetch('/api/boxes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const created = await res.json();
    newBoxId = created.id;
  }
  form.reset();
  cancelEdit();
  await loadBoxes();

  // Auto-Popup: direkt nach Anlegen Label anzeigen
  if (newBoxId) {
    showPdfModal(newBoxId, true);
  }
}

async function deleteBox(id) {
  if (!confirm('Kiste wirklich löschen?')) return;
  await fetch(`/api/boxes/${id}`, { method: 'DELETE' });
  await loadBoxes();
}

function editBox(id) {
  const box = boxes.find(b => b.id === id);
  if (!box) return;
  document.getElementById('edit-id').value = box.id;
  document.getElementById('label').value = box.label;
  document.getElementById('old_room').value = box.old_room;
  document.getElementById('new_room').value = box.new_room;
  document.getElementById('color').value = box.color;
  document.getElementById('teacher').value = box.teacher || '';
  document.getElementById('contents').value = box.contents;
  document.getElementById('notes').value = box.notes;
  formTitle.textContent = '✏️ Kiste bearbeiten';
  cancelEditBtn.style.display = '';
  document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  form.reset();
  document.getElementById('edit-id').value = '';
  formTitle.textContent = '➕ Neue Kiste anlegen';
  cancelEditBtn.style.display = 'none';
}

// ===== PDF Modal =====
async function showPdfModal(id, isNew = false) {
  const box = boxes.find(b => b.id === id);
  if (!box) return;
  const res = await fetch(`/api/boxes/${id}/qr`);
  const { qr, url } = await res.json();

  modalTitle.textContent = isNew ? '✓ Kiste angelegt – Label herunterladen' : '📄 Label-Vorschau';
  printArea.innerHTML = buildLabelHTML(box, qr, url);
  pdfBtn.href = `/api/boxes/${id}/pdf`;
  pdfBtn.download = `label-${box.label.replace(/[^a-z0-9]/gi, '_').slice(0, 20)}.pdf`;
  pdfBtn.classList.remove('hidden');
  pdfAllBtn.classList.add('hidden');
  printModal.classList.remove('hidden');
}

// Einzelnes Label anzeigen (vom Karten-Button)
function printLabel(id) {
  showPdfModal(id, false);
}

async function printAll() {
  const filtered = getFiltered();
  if (!filtered.length) { alert('Keine Kisten zum Herunterladen.'); return; }

  modalTitle.textContent = '📄 Alle Labels – Vorschau';
  printArea.innerHTML = '<p style="text-align:center;color:#64748B;padding:16px">Lade Vorschau...</p>';
  pdfBtn.classList.add('hidden');
  pdfAllBtn.classList.add('hidden');
  printModal.classList.remove('hidden');

  const labels = await Promise.all(filtered.map(async box => {
    const res = await fetch(`/api/boxes/${box.id}/qr`);
    const { qr, url } = await res.json();
    return buildLabelHTML(box, qr, url);
  }));
  printArea.innerHTML = labels.join('');

  // Einzel-PDF-Links pro Label einblenden (im HTML selbst)
  filtered.forEach(box => {
    const el = document.getElementById(`pdf-link-${box.id}`);
    if (el) el.href = `/api/boxes/${box.id}/pdf`;
  });
}

function buildLabelHTML(box, qrDataUrl, url) {
  const c = COLORS[box.color] || COLORS.sonstiges;
  const contentLines = box.contents
    ? box.contents.split('\n').filter(l => l.trim()).map(l => `<li>${escHtml(l.trim())}</li>`).join('')
    : '<li style="color:#94a3b8;font-style:italic">Kein Inhalt angegeben</li>';
  const notesHtml = box.notes
    ? `<div class="print-label-notes">⚠️ ${escHtml(box.notes)}</div>`
    : '';
  const teacherHtml = box.teacher
    ? `<div class="print-label-teacher">👩‍🏫 ${escHtml(box.teacher)}</div>`
    : '';
  return `
    <div class="print-label">
      <div class="print-label-header" style="background:${c.bg}">
        <div class="print-label-header-text">
          <h2>${escHtml(box.label)}</h2>
          <div class="fach-name">${c.icon} ${c.name}</div>
        </div>
        <div class="print-label-icon">${c.icon}</div>
      </div>
      <div class="print-label-rooms">
        <div class="print-label-room">
          <div class="room-dir">📂 Aktueller Raum</div>
          <div class="room-val">${escHtml(box.old_room)}</div>
        </div>
        <div class="print-label-room">
          <div class="room-dir">🏫 Zielraum</div>
          <div class="room-val">${escHtml(box.new_room)}</div>
        </div>
      </div>
      <div class="print-label-body">
        <div class="print-label-qr">
          <img src="${qrDataUrl}" width="120" height="120" alt="QR Code">
        </div>
        <div class="print-label-info">
          ${teacherHtml}
          <h4>Inhalt</h4>
          <ul>${contentLines}</ul>
          ${notesHtml}
        </div>
      </div>
      <div class="print-label-bottom">
        <span class="print-label-url">🔗 ${escHtml(url)}</span>
        <a id="pdf-link-${escHtml(box.id)}" href="/api/boxes/${escHtml(box.id)}/pdf"
           class="btn btn-sm btn-outline" download>⬇ PDF</a>
      </div>
    </div>
  `;
}

function closeModal() {
  printModal.classList.add('hidden');
  printArea.innerHTML = '';
}

// ===== Render =====
function getFiltered() {
  const q = searchInput.value.toLowerCase();
  if (!q) return boxes;
  return boxes.filter(b =>
    b.label.toLowerCase().includes(q) ||
    b.old_room.toLowerCase().includes(q) ||
    b.new_room.toLowerCase().includes(q) ||
    (b.teacher || '').toLowerCase().includes(q) ||
    b.contents.toLowerCase().includes(q)
  );
}

function renderList() {
  const filtered = getFiltered();
  boxCount.textContent = filtered.length;

  if (!filtered.length) {
    boxList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <h3>${boxes.length ? 'Keine Treffer' : 'Noch keine Kisten'}</h3>
        <p>${boxes.length ? 'Andere Suchbegriffe versuchen.' : 'Lege oben die erste Umzugskiste an.'}</p>
      </div>`;
    return;
  }

  boxList.innerHTML = filtered.map(box => {
    const c = COLORS[box.color] || COLORS.sonstiges;
    const preview = box.contents
      ? box.contents.split('\n').filter(l => l.trim()).slice(0, 3).join(' · ')
      : '<em style="color:#94a3b8">Kein Inhalt angegeben</em>';
    const teacherHtml = box.teacher
      ? `<div class="box-teacher">👩‍🏫 ${escHtml(box.teacher)}</div>`
      : '';
    const notesHtml = box.notes
      ? `<div class="box-notes">⚠️ ${escHtml(box.notes)}</div>`
      : '';
    return `
      <div class="box-card">
        <div class="box-card-header" style="background:${c.bg}">
          <div class="room-badge">${c.icon} ${c.name}</div>
          <h3>${escHtml(box.label)}</h3>
          <div class="box-icon">${c.icon}</div>
        </div>
        <div class="box-card-body">
          <div class="room-arrows">
            <span class="room-chip old">📂 ${escHtml(box.old_room)}</span>
            <span class="room-arrow">→</span>
            <span class="room-chip new">🏫 ${escHtml(box.new_room)}</span>
          </div>
          ${teacherHtml}
          <div class="box-contents-preview">${preview}</div>
          ${notesHtml}
        </div>
        <div class="box-card-footer">
          <button class="btn btn-sm btn-outline" onclick="printLabel('${box.id}')">🖨 Label</button>
          ${currentUser?.role === 'admin' ? `
            <button class="btn btn-sm btn-secondary" onclick="editBox('${box.id}')">✏️ Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteBox('${box.id}')">🗑</button>
          ` : ''}
        </div>
      </div>`;
  }).join('');
}

// ===== Utils =====
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
