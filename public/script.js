// Nav toggle
document.getElementById('navToggle').addEventListener('click', () => {
  document.getElementById('navLinks').classList.toggle('open');
});
document.querySelectorAll('.nav-links a').forEach(a =>
  a.addEventListener('click', () => document.getElementById('navLinks').classList.remove('open'))
);

// Theme toggle (light default, dark = black background / white text, orange stays as accent)
const THEME_KEY = 'dcm-theme';
const themeToggleBtn = document.getElementById('themeToggle');
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
(function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
  applyTheme(saved === 'dark' ? 'dark' : 'light');
})();
themeToggleBtn.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
});

// Chat widget
const chatPanel = document.getElementById('chatPanel');
const chatBody = document.getElementById('chatBody');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatQuick = document.getElementById('chatQuick');

const chatLauncher = document.getElementById('chatLauncher');
const chatLauncherIcon = document.getElementById('chatLauncherIcon');
const chatTooltip = document.getElementById('chatTooltip');
const TOOLTIP_DISMISSED_KEY = 'dcm-tooltip-dismissed';

function hideTooltip() {
  chatTooltip.hidden = true;
  try { localStorage.setItem(TOOLTIP_DISMISSED_KEY, '1'); } catch (e) {}
}

function setLauncherState(isOpen) {
  chatLauncher.classList.toggle('open', isOpen);
  chatLauncherIcon.textContent = isOpen ? '✕' : '✨';
  chatLauncher.setAttribute('aria-label', isOpen ? 'ปิดแชท DCM Bot' : 'เปิดแชท DCM Bot');
}

function openChat() {
  chatPanel.classList.add('open');
  setLauncherState(true);
  hideTooltip();
  chatInput.focus();
}
function closeChat() {
  chatPanel.classList.remove('open');
  setLauncherState(false);
}

chatLauncher.addEventListener('click', () => {
  chatPanel.classList.contains('open') ? closeChat() : openChat();
});
document.getElementById('closeChat').addEventListener('click', closeChat);
document.getElementById('closeTooltip').addEventListener('click', hideTooltip);
['openChatNav', 'openChatHero', 'openChatFaq'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', openChat);
});

// Show the greeting tooltip a couple seconds after page load, unless the
// visitor already dismissed it before (remembered per-browser).
(function initTooltip() {
  let dismissed = false;
  try { dismissed = localStorage.getItem(TOOLTIP_DISMISSED_KEY) === '1'; } catch (e) {}
  if (dismissed) { chatTooltip.hidden = true; return; }
  setTimeout(() => { if (!chatPanel.classList.contains('open')) chatTooltip.hidden = false; }, 1800);
})();

const QUICK_QUESTIONS = [
  'เรียนกี่ปี กี่หน่วยกิต',
  'จบแล้วทำงานอะไรได้บ้าง',
  'มีวิชาโทอะไรบ้าง',
  'ปี 3 เรียนวิชาอะไร',
];
chatQuick.innerHTML = QUICK_QUESTIONS.map(q => `<button type="button">${q}</button>`).join('');
chatQuick.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  sendMessage(btn.textContent);
});

// Minimal, safe Markdown-ish rendering for bot replies: escape HTML first
// (so the AI's text can never inject real markup), then convert just
// **bold** and line breaks. User messages stay as plain text.
function renderBotText(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function addMessage(text, who) {
  const div = document.createElement('div');
  div.className = `msg ${who}`;
  if (who.startsWith('bot')) {
    div.innerHTML = renderBotText(text);
  } else {
    div.textContent = text;
  }
  chatBody.appendChild(div);
  chatBody.scrollTop = chatBody.scrollHeight;
  return div;
}

let history = [];

async function sendMessage(text) {
  if (!text.trim()) return;
  addMessage(text, 'user');
  history.push({ role: 'user', content: text });
  chatInput.value = '';

  const typing = addMessage('กำลังพิมพ์...', 'bot typing');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json();
    typing.remove();
    const reply = data.reply || 'ขออภัยครับ ตอนนี้ระบบตอบคำถามขัดข้อง ลองใหม่อีกครั้งนะครับ';
    addMessage(reply, 'bot');
    history.push({ role: 'assistant', content: reply });
  } catch (err) {
    typing.remove();
    addMessage('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ครับ กรุณาตรวจสอบว่าเซิร์ฟเวอร์ (server.js) กำลังทำงานอยู่และตั้งค่า API key แล้ว', 'bot');
  }
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(chatInput.value);
});

// ---- Hero prompt launcher (suggestion chips + recent prompt history) ----
const RECENT_KEY = 'dcm-recent-prompts';
const heroForm = document.getElementById('heroPromptForm');
const heroInput = document.getElementById('heroPromptInput');
const heroChips = document.getElementById('heroChips');
const heroRecent = document.getElementById('heroRecent');

heroChips.innerHTML = QUICK_QUESTIONS.map(q => `<button type="button">${q}</button>`).join('');
heroChips.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  launchFromHero(btn.textContent);
});

function getRecentPrompts() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
}
function saveRecentPrompt(text) {
  try {
    let list = getRecentPrompts().filter(p => p !== text);
    list.unshift(text);
    list = list.slice(0, 4);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    renderRecentPrompts();
  } catch (e) {}
}
function renderRecentPrompts() {
  const list = getRecentPrompts();
  if (!list.length) { heroRecent.innerHTML = ''; return; }
  heroRecent.innerHTML =
    '<div class="prompt-recent-label">คำถามล่าสุดของคุณ</div>' +
    list.map(p => `<div class="prompt-recent-item"><span class="clock">🕓</span><span>${p}</span></div>`).join('');
  heroRecent.querySelectorAll('.prompt-recent-item').forEach((item, i) => {
    item.addEventListener('click', () => launchFromHero(list[i]));
  });
}
renderRecentPrompts();

function launchFromHero(text) {
  if (!text.trim()) return;
  saveRecentPrompt(text.trim());
  openChat();
  sendMessage(text.trim());
  heroInput.value = '';
}

heroForm.addEventListener('submit', (e) => {
  e.preventDefault();
  launchFromHero(heroInput.value);
});
