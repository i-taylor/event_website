/* =========================================================
   ADMIN — admin.js
   Loaded only on admin.html, after script.js.
   Relies on SUPABASE_URL, SUPABASE_KEY, HEADERS, PROMPTS
   and dbDelete() defined in script.js.
   ========================================================= */

'use strict';

// ── Change this password! ────────────────────────────────────
const ADMIN_PASSWORD = 'umich2026';
const ADMIN_SESSION  = 'umich_admin_authed';

// ── Fetch ALL submissions (public + private) using service key
// For simplicity we reuse the anon key + RLS bypass via a
// special select policy. See SQL below.
async function dbGetAll() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/submissions?select=*&order=timestamp.desc`,
    { headers: { ...HEADERS, 'Prefer': 'return=representation' } }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── State ────────────────────────────────────────────────────
let allRows      = [];
let filterPrompt = 'all';
let filterVis    = 'all';

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const loginScreen  = document.getElementById('login-screen');
  const adminScreen  = document.getElementById('admin-screen');
  const passwordInput = document.getElementById('password-input');
  const loginBtn     = document.getElementById('login-btn');
  const loginError   = document.getElementById('login-error');

  // Auto-login if already authed this session
  if (sessionStorage.getItem(ADMIN_SESSION) === 'yes') {
    showAdmin();
  }

  // Login
  function tryLogin() {
    if (passwordInput.value === ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_SESSION, 'yes');
      loginError.textContent = '';
      showAdmin();
    } else {
      loginError.textContent = 'Incorrect password. Try again.';
      passwordInput.value = '';
      passwordInput.focus();
    }
  }

  loginBtn.addEventListener('click', tryLogin);
  passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });

  function showAdmin() {
    loginScreen.style.display = 'none';
    adminScreen.style.display = 'block';
    loadData();
  }

  // Filters
  document.getElementById('filter-prompt').addEventListener('change', e => {
    filterPrompt = e.target.value;
    renderTable();
  });
  document.getElementById('filter-vis').addEventListener('change', e => {
    filterVis = e.target.value;
    renderTable();
  });

  // Export
  document.getElementById('export-btn').addEventListener('click', exportCSV);

  // Populate prompt filter
  const promptFilter = document.getElementById('filter-prompt');
  PROMPTS.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Q${i + 1}: ${p.slice(0, 45)}…`;
    promptFilter.appendChild(opt);
  });
});

// ── Load data ────────────────────────────────────────────────
async function loadData() {
  const tbody = document.getElementById('admin-tbody');
  tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Loading…</td></tr>`;

  try {
    allRows = await dbGetAll();
    updateStats();
    renderTable();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">❌ Failed to load. Check console.</td></tr>`;
  }
}

// ── Stats ─────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-total').textContent   = allRows.length;
  document.getElementById('stat-public').textContent  = allRows.filter(r => r.visibility === 'public').length;
  document.getElementById('stat-private').textContent = allRows.filter(r => r.visibility === 'private').length;
  document.getElementById('stat-upvotes').textContent = allRows.reduce((s, r) => s + (r.upvotes || 0), 0);
}

// ── Render table ──────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('admin-tbody');

  let rows = allRows;
  if (filterPrompt !== 'all') rows = rows.filter(r => String(r.prompt_idx) === filterPrompt);
  if (filterVis    !== 'all') rows = rows.filter(r => r.visibility === filterVis);

  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No submissions match this filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.dataset.id = row.id;
    tr.innerHTML = `
      <td data-label="Author">${escHtml(row.author)}</td>
      <td data-label="Question">Q${row.prompt_idx + 1}</td>
      <td data-label="Response" class="col-text"><p>${escHtml(row.text)}</p></td>
      <td data-label="Visibility">
        <span class="badge badge-${row.visibility}">${row.visibility}</span>
      </td>
      <td data-label="Upvotes">▲ ${row.upvotes || 0}</td>
      <td data-label="Time">${timeAgo(row.timestamp)}</td>
      <td data-label="Action">
        <button class="btn-delete" data-id="${row.id}">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Delete with two-click confirm
  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    let confirming = false;
    let resetTimer;

    btn.addEventListener('click', async () => {
      if (!confirming) {
        confirming = true;
        btn.textContent = 'Confirm?';
        btn.classList.add('confirming');
        resetTimer = setTimeout(() => {
          confirming = false;
          btn.textContent = 'Delete';
          btn.classList.remove('confirming');
        }, 2500);
      } else {
        clearTimeout(resetTimer);
        btn.disabled    = true;
        btn.textContent = '…';
        const id = btn.dataset.id;
        try {
          await dbDelete(id);
          const tr = tbody.querySelector(`tr[data-id="${id}"]`);
          if (tr) tr.remove();
          allRows = allRows.filter(r => r.id !== id);
          updateStats();
          if (!tbody.querySelector('tr')) {
            tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No submissions match this filter.</td></tr>`;
          }
        } catch (err) {
          console.error(err);
          btn.disabled    = false;
          btn.textContent = 'Error';
        }
      }
    });
  });
}

// ── CSV Export ────────────────────────────────────────────────
function exportCSV() {
  const cols = ['id', 'author', 'prompt_idx', 'prompt', 'text', 'visibility', 'upvotes', 'timestamp'];
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const header = cols.join(',');
  const csvRows = allRows.map(r => cols.map(c => escape(r[c])).join(','));
  const csv     = [header, ...csvRows].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `feedback-export-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}