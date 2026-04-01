// ===== Config =====
const COLORS = {
  wohnzimmer:   { bg: '#3B82F6', icon: '🏠', name: 'Wohnzimmer' },
  schlafzimmer: { bg: '#8B5CF6', icon: '🛌', name: 'Schlafzimmer' },
  kueche:       { bg: '#F97316', icon: '🍳', name: 'Küche' },
  bad:          { bg: '#06B6D4', icon: '🚿', name: 'Bad' },
  kinderzimmer: { bg: '#22C55E', icon: '🌿', name: 'Kinderzimmer' },
  buero:        { bg: '#EAB308', icon: '💼', name: 'Büro / Arbeitszimmer' },
  keller:       { bg: '#6B7280', icon: '🕰', name: 'Keller / Lager' },
  dachboden:    { bg: '#A16207', icon: '🏠', name: 'Dachboden' },
  flur:         { bg: '#EC4899', icon: '🚪', name: 'Flur / Eingang' },
  sonstiges:    { bg: '#64748B', icon: '📦', name: 'Sonstiges' },
};

// ===== State =====
let boxes = [];

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

// ===== Init =====
loadBoxes();

// ===== Events =====
form.addEventListener('submit', onSubmit);
searchInput.addEventListener('input', renderList);
modalClose.addEventListener('click', closeModal);
modalCloseBtn.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);
cancelEditBtn.addEventListener('click', cancelEdit);
printAllBtn.addEventListener('click', printAll);

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
    contents: document.getElementById('contents').value.trim(),
    notes:    document.getElementById('notes').value.trim(),
  };
  if (id) {
    await fetch(`/api/boxes/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  } else {
    await fetch('/api/boxes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  }
  form.reset();
  cancelEdit();
  await loadBoxes();
}

async function deleteBox(id) {
  if (!confirm('Karton wirklich löschen?')) return;
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
  document.getElementById('contents').value = box.contents;
  document.getElementById('notes').value = box.notes;
  formTitle.textContent = 'Karton bearbeiten';
  cancelEditBtn.style.display = '';
  document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  form.reset();
  document.getElementById('edit-id').value = '';
  formTitle.textContent = 'Neuen Karton anlegen';
  cancelEditBtn.style.display = 'none';
}

// ===== Print =====
async function printLabel(id) {
  const box = boxes.find(b => b.id === id);
  if (!box) return;
  const res = await fetch(`/api/boxes/${id}/qr`);
  const { qr, url } = await res.json();
  printArea.innerHTML = buildLabelHTML(box, qr, url);
  printModal.classList.remove('hidden');
}

async function printAll() {
  const filtered = getFiltered();
  if (!filtered.length) { alert('Keine Kartons zum Drucken.'); return; }
  printArea.innerHTML = '<p style="text-align:center;color:#64748B;padding:12px">Lade QR-Codes...</p>';
  printModal.classList.remove('hidden');

  const labels = await Promise.all(filtered.map(async box => {
    const res = await fetch(`/api/boxes/${box.id}/qr`);
    const { qr, url } = await res.json();
    return buildLabelHTML(box, qr, url);
  }));
  printArea.innerHTML = labels.join('');
}

function buildLabelHTML(box, qrDataUrl, url) {
  const c = COLORS[box.color] || COLORS.sonstiges;
  const contentLines = box.contents
    ? box.contents.split('\n').filter(l => l.trim()).map(l => `<li>${escHtml(l.trim())}</li>`).join('')
    : '<li style="color:#94a3b8;font-style:italic">Kein Inhalt angegeben</li>';
  const notesHtml = box.notes
    ? `<div class="print-label-notes">⚠️ ${escHtml(box.notes)}</div>`
    : '';
  return `
    <div class="print-label">
      <div class="print-label-header color-${escHtml(box.color)}" style="background:${c.bg}">
        <div class="print-label-header-text">
          <h2>${escHtml(box.label)}</h2>
          <div class="room-name">${c.icon} ${c.name}</div>
        </div>
        <div class="print-label-icon">${c.icon}</div>
      </div>
      <div class="print-label-rooms">
        <div class="print-label-room">
          <div class="room-dir">📂 Kommt aus</div>
          <div class="room-val">${escHtml(box.old_room)}</div>
        </div>
        <div class="print-label-room">
          <div class="room-dir">🏠 Geht nach</div>
          <div class="room-val">${escHtml(box.new_room)}</div>
        </div>
      </div>
      <div class="print-label-body">
        <div class="print-label-qr">
          <img src="${qrDataUrl}" width="120" height="120" alt="QR Code">
        </div>
        <div class="print-label-info">
          <h4>Inhalt</h4>
          <ul>${contentLines}</ul>
          ${notesHtml}
        </div>
      </div>
      <div class="print-label-url">🔗 ${escHtml(url)}</div>
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
        <h3>${boxes.length ? 'Keine Treffer' : 'Noch keine Kartons'}</h3>
        <p>${boxes.length ? 'Andere Suchbegriffe versuchen.' : 'Lege oben deinen ersten Umzugskarton an.'}</p>
      </div>`;
    return;
  }

  boxList.innerHTML = filtered.map(box => {
    const c = COLORS[box.color] || COLORS.sonstiges;
    const preview = box.contents
      ? box.contents.split('\n').filter(l => l.trim()).slice(0, 3).join(' · ')
      : '<em style="color:#94a3b8">Kein Inhalt</em>';
    const notesHtml = box.notes
      ? `<div class="box-notes">⚠️ ${escHtml(box.notes)}</div>`
      : '';
    return `
      <div class="box-card">
        <div class="box-card-header color-${escHtml(box.color)}" style="background:${c.bg}">
          <div class="room-badge">${c.icon} ${c.name}</div>
          <h3>${escHtml(box.label)}</h3>
          <div class="box-icon">${c.icon}</div>
        </div>
        <div class="box-card-body">
          <div class="room-arrows">
            <span class="room-chip old">📂 ${escHtml(box.old_room)}</span>
            <span class="room-arrow">→</span>
            <span class="room-chip new">🏠 ${escHtml(box.new_room)}</span>
          </div>
          <div class="box-contents-preview">${preview}</div>
          ${notesHtml}
        </div>
        <div class="box-card-footer">
          <button class="btn btn-sm btn-outline" onclick="printLabel('${box.id}')">🖨 Label</button>
          <button class="btn btn-sm btn-secondary" onclick="editBox('${box.id}')">✏️ Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteBox('${box.id}')">🗑</button>
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
