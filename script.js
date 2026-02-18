/* =========================================================
   EVENT FEEDBACK — script.js
   Data stored in localStorage.
   Search "BACKEND:" to find swap points for a real API.
   ========================================================= */

'use strict';

// ── Config ───────────────────────────────────────────────────
const PROMPTS = [
  "What did you enjoy most about the event?",
  "What could be improved for next time?",
  "How would you rate the organisation and logistics?",
  "Any standout moments or speakers you'd like to highlight?",
  "Would you attend this event again, and why?",
];

const BANNED_WORDS = [
  'badword1', 'badword2', // extend this list as needed (keep lowercase)
];

const LS_SUBMISSIONS = 'umich_feedback_submissions';
const LS_UPVOTES     = 'umich_feedback_upvotes';

// ── Storage helpers ──────────────────────────────────────────

// BACKEND: replace with API GET
function getSubmissions() {
  try { return JSON.parse(localStorage.getItem(LS_SUBMISSIONS)) || []; }
  catch { return []; }
}

// BACKEND: replace with API POST
function saveSubmission(entry) {
  const all = getSubmissions();
  all.push(entry);
  localStorage.setItem(LS_SUBMISSIONS, JSON.stringify(all));
}

function getVotedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_UPVOTES)) || []); }
  catch { return new Set(); }
}

function markVoted(id) {
  // BACKEND: server-side dedup by session/IP; this is client-only
  const voted = getVotedIds();
  voted.add(id);
  localStorage.setItem(LS_UPVOTES, JSON.stringify([...voted]));
}

// BACKEND: replace with API PATCH / RPC
function incrementUpvote(id) {
  const all  = getSubmissions();
  const item = all.find(s => s.id === id);
  if (item) {
    item.upvotes = (item.upvotes || 0) + 1;
    localStorage.setItem(LS_SUBMISSIONS, JSON.stringify(all));
    return item.upvotes;
  }
  return 0;
}

// ── Utilities ────────────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function containsProfanity(text) {
  const lower = text.toLowerCase();
  return BANNED_WORDS.some(w => lower.includes(w));
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

function showMsg(el, text, type) {
  el.textContent = text;
  el.className   = `msg ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 5500);
}

// ── submit.html ──────────────────────────────────────────────

function initSubmitPage() {
  const form        = document.getElementById('submit-form');
  if (!form) return;

  const promptSel   = document.getElementById('prompt');
  const feedbackEl  = document.getElementById('feedback');
  const authorEl    = document.getElementById('author');
  const visToggle   = document.getElementById('vis-toggle');
  const msgEl       = document.getElementById('msg');

  // Populate prompts dropdown
  PROMPTS.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p;
    promptSel.appendChild(opt);
  });

  // Visibility state
  let visibility = 'public';
  visToggle.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      visibility = btn.dataset.val;
      visToggle.querySelectorAll('button')
        .forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  form.addEventListener('submit', e => {
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

    const entry = {
      id:        uid(),
      promptIdx: Number(promptSel.value),
      prompt:    PROMPTS[Number(promptSel.value)],
      text,
      author,
      visibility,
      upvotes:   0,
      timestamp: Date.now(),
    };

    saveSubmission(entry); // BACKEND: swap this line with your API call
    showMsg(msgEl, '✓ Thank you — your feedback has been submitted!', 'success');

    // Reset
    feedbackEl.value = '';
    authorEl.value   = '';
    promptSel.selectedIndex = 0;
    visibility = 'public';
    visToggle.querySelectorAll('button')
      .forEach((b, i) => b.classList.toggle('active', i === 0));
  });
}

// ── feedback.html ────────────────────────────────────────────

function initFeedbackPage() {
  const container = document.getElementById('feedback-container');
  if (!container) return;

  let sortMode = 'top';

  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sortMode = btn.dataset.sort;
      document.querySelectorAll('.sort-btn')
        .forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
  });

  render();

  function render() {
    // BACKEND: replace getSubmissions() with your fetch call
    const all = getSubmissions().filter(s => s.visibility === 'public');

    if (!all.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">💬</div>
          <p>No public feedback yet.<br>Be the first to share your thoughts!</p>
        </div>`;
      return;
    }

    // Sort
    const sorted = [...all].sort((a, b) =>
      sortMode === 'top'
        ? (b.upvotes || 0) - (a.upvotes || 0)
        : b.timestamp - a.timestamp
    );

    // Group by prompt index
    const groups = {};
    PROMPTS.forEach((_, i) => { groups[i] = []; });
    sorted.forEach(s => {
      if (groups[s.promptIdx] !== undefined) groups[s.promptIdx].push(s);
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

    // Upvote handler (event delegation)
    container.addEventListener('click', e => {
      const btn = e.target.closest('.upvote-btn');
      if (!btn || btn.classList.contains('voted')) return;

      const id      = btn.dataset.id;
      const updated = incrementUpvote(id); // BACKEND: API call here
      markVoted(id);

      btn.classList.add('voted');
      btn.disabled = true;
      btn.querySelector('.count').textContent = updated;
    });
  }
}

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSubmitPage();
  initFeedbackPage();
});
