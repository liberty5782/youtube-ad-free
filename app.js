'use strict';

// ── Config ────────────────────────────────────────────────────────────────────

const INVIDIOUS_INSTANCES = [
  'https://invidious.io',
  'https://inv.nadeko.net',
  'https://invidious.privacydev.net',
  'https://yt.cdaut.de',
];

const PIPED_INSTANCES = [
  'https://piped.kavin.rocks',
  'https://piped.privacydev.net',
];

const DEFAULTS = {
  backend: 'invidious',
  invidiousInstance: INVIDIOUS_INSTANCES[0],
  autoplay: false,
};

// ── State ─────────────────────────────────────────────────────────────────────

let settings = loadSettings();
let currentVideoId = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract YouTube video ID from various URL formats or raw IDs.
 * Supports: youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID,
 *           /live/ID, and bare 11-char IDs.
 */
function parseVideoId(input) {
  if (!input) return null;
  input = input.trim();

  const patterns = [
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];

  for (const re of patterns) {
    const m = input.match(re);
    if (m) return m[1];
  }
  return null;
}

function buildEmbedUrl(videoId, backend, autoplay) {
  const ap = autoplay ? 1 : 0;
  const instance = settings.invidiousInstance || INVIDIOUS_INSTANCES[0];

  switch (backend) {
    case 'piped': {
      const piped = PIPED_INSTANCES[0];
      return `${piped}/embed/${videoId}?autoplay=${ap}`;
    }
    case 'nocookie':
      return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${ap}&rel=0&modestbranding=1`;
    case 'invidious':
    default: {
      const base = instance.replace(/\/$/, '');
      return `${base}/embed/${videoId}?autoplay=${ap}&local=true`;
    }
  }
}

function loadSettings() {
  try {
    const stored = localStorage.getItem('ytadfree_settings');
    return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s) {
  settings = s;
  localStorage.setItem('ytadfree_settings', JSON.stringify(s));
}

// ── DOM Refs ──────────────────────────────────────────────────────────────────

const searchForm = document.getElementById('searchForm');
const videoInput = document.getElementById('videoInput');
const errorMsg = document.getElementById('errorMsg');
const searchSection = document.querySelector('.search-section');
const playerSection = document.getElementById('playerSection');
const videoFrame = document.getElementById('videoFrame');
const playerPlaceholder = document.getElementById('playerPlaceholder');
const backBtn = document.getElementById('backBtn');
const backendSelect = document.getElementById('backendSelect');
const currentVideoIdEl = document.getElementById('currentVideoId');
const openOriginal = document.getElementById('openOriginal');
const openInvidious = document.getElementById('openInvidious');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeModal = document.getElementById('closeModal');
const saveSettingsBtn = document.getElementById('saveSettings');
const defaultBackendSel = document.getElementById('defaultBackend');
const invidiousInstanceInput = document.getElementById('invidiousInstance');
const autoplayToggle = document.getElementById('autoplayToggle');

// ── Core Logic ────────────────────────────────────────────────────────────────

function showPlayer(videoId) {
  currentVideoId = videoId;
  const backend = backendSelect.value;

  // Update meta links
  currentVideoIdEl.textContent = videoId;
  openOriginal.href = `https://www.youtube.com/watch?v=${videoId}`;
  const invBase = (settings.invidiousInstance || INVIDIOUS_INSTANCES[0]).replace(/\/$/, '');
  openInvidious.href = `${invBase}/watch?v=${videoId}`;

  // Show loading state
  playerPlaceholder.classList.remove('hidden');
  videoFrame.src = '';

  // Switch sections
  searchSection.hidden = true;
  playerSection.hidden = false;

  // Load embed
  const url = buildEmbedUrl(videoId, backend, settings.autoplay);
  videoFrame.src = url;

  videoFrame.onload = () => {
    playerPlaceholder.classList.add('hidden');
  };

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showSearch() {
  playerSection.hidden = true;
  searchSection.hidden = false;
  videoFrame.src = '';
  currentVideoId = null;
}

function setError(msg) {
  errorMsg.textContent = msg;
}

function clearError() {
  errorMsg.textContent = '';
}

// ── Event Listeners ───────────────────────────────────────────────────────────

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  clearError();
  const id = parseVideoId(videoInput.value);
  if (!id) {
    setError('Could not find a valid YouTube video ID. Paste a full URL or an 11-character video ID.');
    return;
  }
  showPlayer(id);
});

videoInput.addEventListener('input', () => {
  if (errorMsg.textContent) clearError();
});

backBtn.addEventListener('click', showSearch);

backendSelect.addEventListener('change', () => {
  if (currentVideoId) showPlayer(currentVideoId);
});

document.querySelectorAll('.example-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.id;
    videoInput.value = id;
    clearError();
    showPlayer(id);
  });
});

// Settings modal
settingsBtn.addEventListener('click', openSettings);
closeModal.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettings();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !settingsModal.hidden) closeSettings();
});

saveSettingsBtn.addEventListener('click', () => {
  const newSettings = {
    backend: defaultBackendSel.value,
    invidiousInstance: invidiousInstanceInput.value.trim() || INVIDIOUS_INSTANCES[0],
    autoplay: autoplayToggle.checked,
  };
  saveSettings(newSettings);
  backendSelect.value = newSettings.backend;
  closeSettings();

  // Reload current video with new settings
  if (currentVideoId) showPlayer(currentVideoId);
});

function openSettings() {
  defaultBackendSel.value = settings.backend;
  invidiousInstanceInput.value = settings.invidiousInstance;
  autoplayToggle.checked = settings.autoplay;
  settingsModal.hidden = false;
  settingsModal.focus?.();
}

function closeSettings() {
  settingsModal.hidden = true;
}

// ── Init ──────────────────────────────────────────────────────────────────────

(function init() {
  // Apply saved backend to player select
  backendSelect.value = settings.backend;

  // Check URL params for deep-linking: ?v=VIDEO_ID
  const params = new URLSearchParams(window.location.search);
  const vParam = params.get('v');
  if (vParam) {
    const id = parseVideoId(vParam);
    if (id) showPlayer(id);
  }
})();
