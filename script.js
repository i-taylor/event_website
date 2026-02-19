/* =========================================================
   EVENT FEEDBACK — script.js
   Backend: Supabase
   ========================================================= */

'use strict';

// ── Supabase config ──────────────────────────────────────────
const SUPABASE_URL = 'https://rxskfvquuvxmwrgcnqij.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4c2tmdnF1dXZ4bXdyZ2NucWlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MjkzOTMsImV4cCI6MjA4NzAwNTM5M30.GJJxNpezwq4-Ui5rgZMwj6D6J8zOzIjBvzvi5gtfbZQ';

const HEADERS = {
  'Content-Type':  'application/json',
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Prefer':        'return=minimal',
};

// ── Prompts ──────────────────────────────────────────────────
const PROMPTS = [
  "What did you enjoy most about the event?",
  "What could be improved for next time?",
  "How would you rate the organisation and logistics?",
  "Any standout moments or speakers you'd like to highlight?",
  "Would you attend this event again, and why?",
];

// ── Profanity filter ─────────────────────────────────────────
// Profanity filter powered by leo-profanity (loaded via CDN in HTML)
function containsProfanity(text) {
  return leoProfanity.check(text);
}

// ── localStorage (upvote dedup only) ─────────────────────────
const LS_UPVOTES = 'umich_feedback_upvotes';

function getVotedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_UPVOTES)) || []); }
  catch { return new Set(); }
}

function markVoted(id) {
  const voted = getVotedIds();
  voted.add(id);
  localStorage.setItem(LS_UPVOTES, JSON.stringify([...voted]));
}

// ── Supabase API helpers ─────────────────────────────────────

async function dbInsert(entry) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions`, {
    method:  'POST',
    headers: HEADERS,
    body:    JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function dbGetPublic() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/submissions?visibility=eq.public&select=*`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function dbDelete(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${id}`, {
    method:  'DELETE',
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(await res.text());
}

async function dbUpvote(id) {
  // Uses Supabase RPC to atomically increment — avoids race conditions
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_upvote`, {
    method:  'POST',
    headers: HEADERS,
    body:    JSON.stringify({ submission_id: id }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // returns new upvote count
}

// ── Utilities ────────────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const UNDO_SECONDS = 5;

function showUndo(el, id) {
  let remaining = UNDO_SECONDS;
  let deleted = false;

  el.innerHTML = `
    ✓ Submitted!
    <button id="undo-btn" style="
      margin-left:.75rem;
      padding:.2rem .75rem;
      background:transparent;
      border:1.5px solid currentColor;
      border-radius:6px;
      font-family:inherit;
      font-size:.85rem;
      font-weight:700;
      cursor:pointer;
      color:inherit;
    ">Undo <span id="undo-timer">(${remaining}s)</span></button>`;
  el.className = 'msg success show';

  const timer = setInterval(() => {
    remaining--;
    const timerEl = document.getElementById('undo-timer');
    if (timerEl) timerEl.textContent = `(${remaining}s)`;
    if (remaining <= 0) {
      clearInterval(timer);
      if (!deleted) el.classList.remove('show');
    }
  }, 1000);

  document.getElementById('undo-btn').addEventListener('click', async () => {
    clearInterval(timer);
    deleted = true;
    el.innerHTML = '⏳ Removing your submission…';
    try {
      await dbDelete(id);
      el.innerHTML = '✓ Submission removed.';
      setTimeout(() => el.classList.remove('show'), 2500);
    } catch (err) {
      console.error(err);
      el.innerHTML = '❌ Could not undo. Please contact an organiser.';
      el.className = 'msg error show';
      setTimeout(() => el.classList.remove('show'), 4000);
    }
  });
}

function showMsg(el, text, type) {
  el.textContent = text;
  el.className   = `msg ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 5500);
}

// ── submit.html ──────────────────────────────────────────────

function initSubmitPage() {
  const form = document.getElementById('submit-form');
  if (!form) return;

  const promptSel  = document.getElementById('prompt');
  const feedbackEl = document.getElementById('feedback');
  const authorEl   = document.getElementById('author');
  const visToggle  = document.getElementById('vis-toggle');
  const msgEl      = document.getElementById('msg');
  const submitBtn  = form.querySelector('.btn-primary');

  // Populate prompts dropdown
  PROMPTS.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p;
    promptSel.appendChild(opt);
  });

  // Visibility toggle
  let visibility = 'public';
  visToggle.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      visibility = btn.dataset.val;
      visToggle.querySelectorAll('button')
        .forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text   = feedbackEl.value.trim();
    const author = authorEl.value.trim() || 'Anonymous';

    if (!text) {
      return showMsg(msgEl, 'Please enter your feedback before submitting.', 'error');
    }
    if (containsProfanity(text) || containsProfanity(author)) {
      return showMsg(msgEl,
        '⚠️ Your submission contains language we can\'t accept. Please revise it and try again.',
        'error');
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const newId = uid();
      await dbInsert({
        id:         newId,
        prompt_idx: Number(promptSel.value),
        prompt:     PROMPTS[Number(promptSel.value)],
        text,
        author,
        visibility,
        upvotes:    0,
        timestamp:  Date.now(),
      });

      // Reset form
      feedbackEl.value = '';
      authorEl.value   = '';
      promptSel.selectedIndex = 0;
      visibility = 'public';
      visToggle.querySelectorAll('button')
        .forEach((b, i) => b.classList.toggle('active', i === 0));

      // Show undo bar
      showUndo(msgEl, newId);

    } catch (err) {
      console.error(err);
      showMsg(msgEl, '❌ Something went wrong. Please try again.', 'error');
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Submit Feedback →';
    }
  });
}

// ── feedback.html ────────────────────────────────────────────

function initFeedbackPage() {
  const container = document.getElementById('feedback-container');
  if (!container) return;

  let sortMode = 'top';
  let allData  = [];

  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sortMode = btn.dataset.sort;
      document.querySelectorAll('.sort-btn')
        .forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
  });

  // Initial load
  container.innerHTML = `<div class="empty"><div class="empty-icon">⏳</div><p>Loading feedback…</p></div>`;

  dbGetPublic().then(data => {
    allData = data;
    render();
  }).catch(err => {
    console.error(err);
    container.innerHTML = `<div class="empty"><div class="empty-icon">❌</div><p>Could not load feedback. Please refresh.</p></div>`;
  });

  function render() {
    if (!allData.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">💬</div>
          <p>No public feedback yet.<br>Be the first to share your thoughts!</p>
        </div>`;
      return;
    }

    // Sort
    const sorted = [...allData].sort((a, b) =>
      sortMode === 'top'
        ? (b.upvotes || 0) - (a.upvotes || 0)
        : b.timestamp - a.timestamp
    );

    // Group by prompt index
    const groups = {};
    PROMPTS.forEach((_, i) => { groups[i] = []; });
    sorted.forEach(s => {
      if (groups[s.prompt_idx] !== undefined) groups[s.prompt_idx].push(s);
    });

    const voted = getVotedIds();
    container.innerHTML = '';

    PROMPTS.forEach((prompt, idx) => {
      if (!groups[idx].length) return;

      const section = document.createElement('section');
      section.className = 'prompt-section';
      section.innerHTML = `
        <div class="prompt-tag">Question ${idx + 1}</div>
        <h2>${escHtml(prompt)}</h2>`;

      groups[idx].forEach((s, i) => {
        const isVoted = voted.has(s.id);
        const item    = document.createElement('div');
        item.className = 'feedback-item';
        item.style.animationDelay = `${i * 40}ms`;
        item.innerHTML = `
          <button
            class="upvote-btn${isVoted ? ' voted' : ''}"
            data-id="${s.id}"
            aria-label="Upvote this response"
            ${isVoted ? 'disabled' : ''}
          >
            <span class="arrow">▲</span>
            <span class="count">${s.upvotes || 0}</span>
          </button>
          <div class="feedback-body">
            <p class="feedback-text">${escHtml(s.text)}</p>
            <p class="feedback-meta">${escHtml(s.author)} · ${timeAgo(s.timestamp)}</p>
          </div>`;
        section.appendChild(item);
      });

      container.appendChild(section);
    });

    // Upvote handler
    container.addEventListener('click', async e => {
      const btn = e.target.closest('.upvote-btn');
      if (!btn || btn.classList.contains('voted')) return;

      const id = btn.dataset.id;
      btn.disabled = true;

      try {
        const newCount = await dbUpvote(id);
        markVoted(id);
        btn.classList.add('voted');
        btn.querySelector('.count').textContent = newCount;

        // Update local cache so re-sorts stay accurate
        const item = allData.find(s => s.id === id);
        if (item) item.upvotes = newCount;

      } catch (err) {
        console.error(err);
        btn.disabled = false; // re-enable if it failed
      }
    });
  }
}

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSubmitPage();
  initFeedbackPage();
});