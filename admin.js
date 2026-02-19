/* =========================================================
   ADMIN — admin.js
   ========================================================= */
<script src="https://cdn.jsdelivr.net/npm/leo-profanity@1.6.1/src/index.js"></script>

(function() {
  'use strict';

  const ADMIN_PASSWORD = 'umich2026';
  const ADMIN_SESSION  = 'umich_admin_authed';

  let allRows      = [];
  let filterPrompt = 'all';
  let filterVis    = 'all';

  // ── Supabase: fetch all rows (public + private) ───────────
  async function dbGetAll() {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/submissions?select=*&order=timestamp.desc`,
      { headers: HEADERS }
    );
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // ── Login ─────────────────────────────────────────────────
  function tryLogin() {
    const input = document.getElementById('password-input');
    const error = document.getElementById('login-error');
    if (input.value === ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_SESSION, 'yes');
      error.textContent = '';
      showAdmin();
    } else {
      error.textContent = 'Incorrect password. Try again.';
      input.value = '';
      input.focus();
    }
  }

  function showAdmin() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-screen').style.display = 'block';
    loadData();
  }

  // ── Load data ─────────────────────────────────────────────
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

  // ── Stats ─────────────────────────────────────────────────
  function updateStats() {
    document.getElementById('stat-total').textContent   = allRows.length;
    document.getElementById('stat-public').textContent  = allRows.filter(r => r.visibility === 'public').length;
    document.getElementById('stat-private').textContent = allRows.filter(r => r.visibility === 'private').length;
    document.getElementById('stat-upvotes').textContent = allRows.reduce((s, r) => s + (r.upvotes || 0), 0);
  }

  // ── Render table ──────────────────────────────────────────
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
        <td data-label="Visibility"><span class="badge badge-${row.visibility}">${row.visibility}</span></td>
        <td data-label="Upvotes">▲ ${row.upvotes || 0}</td>
        <td data-label="Time">${timeAgo(row.timestamp)}</td>
        <td data-label="Action"><button class="btn-delete" data-id="${row.id}">Delete</button></td>`;
      tbody.appendChild(tr);
    });

    // Two-click confirm delete
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
          btn.disabled = true;
          btn.textContent = '…';
          try {
            await dbDelete(btn.dataset.id);
            tbody.querySelector(`tr[data-id="${btn.dataset.id}"]`)?.remove();
            allRows = allRows.filter(r => r.id !== btn.dataset.id);
            updateStats();
            if (!tbody.querySelector('tr'))
              tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No submissions match this filter.</td></tr>`;
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            btn.textContent = 'Error';
          }
        }
      });
    });
  }

  // ── CSV Export ────────────────────────────────────────────
  function exportCSV() {
    const cols = ['id', 'author', 'prompt_idx', 'prompt', 'text', 'visibility', 'upvotes', 'timestamp'];
    const esc  = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv  = [cols.join(','), ...allRows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    const a    = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: `feedback-export-${new Date().toISOString().slice(0,10)}.csv`,
    });
    a.click();
  }

  // ── Init ──────────────────────────────────────────────────
  document.getElementById('login-btn')
    .addEventListener('click', tryLogin);
  document.getElementById('password-input')
    .addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  document.getElementById('filter-prompt')
    .addEventListener('change', e => { filterPrompt = e.target.value; renderTable(); });
  document.getElementById('filter-vis')
    .addEventListener('change', e => { filterVis = e.target.value; renderTable(); });
  document.getElementById('export-btn')
    .addEventListener('click', exportCSV);

  // Populate prompt filter
  PROMPTS.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Q${i + 1}: ${p.slice(0, 45)}…`;
    document.getElementById('filter-prompt').appendChild(opt);
  });

  // Auto-login if session already set
  if (sessionStorage.getItem(ADMIN_SESSION) === 'yes') showAdmin();

})();