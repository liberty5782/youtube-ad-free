'use strict';

// ── Config ────────────────────────────────────────────────────────────────────

// Last-resort list, used only if the live instance directory can't be fetched.
// Public instances come and go, so these may be dead; discovery below is the main path.
const FALLBACK_INSTANCES = [
  'https://inv.nadeko.net',
  'https://yt.cdaut.de',
  'https://invidious.privacydev.net',
];
const INSTANCE_DIRECTORY = 'https://api.invidious.io/instances.json?sort_by=health';
const PROBE_TIMEOUT_MS = 5000;
const LEGACY_BAD_INSTANCE = 'https://invidious.io'; // project website, not an instance

const PIPED_INSTANCES = [
  'https://piped.kavin.rocks',
  'https://piped.privacydev.net',
];

const DEFAULTS = {
  backend: 'invidious',
  invidiousInstance: '', // empty = auto-discover a working public instance
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

function buildEmbedUrl(videoId, backend, autoplay, instance) {
  const ap = autoplay ? 1 : 0;

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
    const merged = stored ? { ...DEFAULTS, ...JSON.parse(stored) } : { ...DEFAULTS };
    if (merged.invidiousInstance === LEGACY_BAD_INSTANCE) merged.invidiousInstance = '';
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s) {
  settings = s;
  localStorage.setItem('ytadfree_settings', JSON.stringify(s));
}

// ── Instance discovery ────────────────────────────────────────────────────────

async function fetchWithTimeout(url, ms = PROBE_TIMEOUT_MS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function getCandidateInstances() {
  const custom = settings.invidiousInstance ? [settings.invidiousInstance.replace(/\/$/, '')] : [];
  let discovered = [];
  try {
    const cached = JSON.parse(localStorage.getItem('ytadfree_instances') || 'null');
    if (cached && Date.now() - cached.at < 3600_000) {
      discovered = cached.list;
    } else {
      const res = await fetchWithTimeout(INSTANCE_DIRECTORY, 8000);
      const data = await res.json();
      discovered = data
        .map(([, info]) => info)
        .filter((i) => i.type === 'https' && i.api === true && i.uri)
        .map((i) => i.uri.replace(/\/$/, ''));
      localStorage.setItem('ytadfree_instances', JSON.stringify({ at: Date.now(), list: discovered }));
    }
  } catch { /* directory unreachable: fall through to fallback list */ }
  return [...new Set([...custom, ...discovered.slice(0, 8), ...FALLBACK_INSTANCES])];
}

// Resolve with the first instance whose API answers for this video.
function probeInstance(base, videoId) {
  return fetchWithTimeout(`${base}/api/v1/videos/${videoId}?fields=videoId`).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return base;
  });
}

async function findWorkingInstance(videoId) {
  const candidates = await getCandidateInstances();
  const batch = candidates.slice(0, 6);
  try {
    return await Promise.any(batch.map((b) => probeInstance(b, videoId)));
  } catch {
    return null;
  }
}

// ── DOM Refs ──────────────────────────────────────────────────────────────────

const installBtn = document.getElementById('installBtn');
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

async function showPlayer(videoId) {
  currentVideoId = videoId;
  let backend = backendSelect.value;
  const token = Symbol();
  showPlayer.token = token; // ignore stale async results if the user navigates away

  currentVideoIdEl.textContent = videoId;
  openOriginal.href = `https://www.youtube.com/watch?v=${videoId}`;
  openInvidious.hidden = backend !== 'invidious';

  playerPlaceholder.classList.remove('hidden');
  setPlaceholder('Finding a working server…', true);
  videoFrame.src = '';
  searchSection.hidden = true;
  playerSection.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  let instance = null;
  if (backend === 'invidious') {
    instance = await findWorkingInstance(videoId);
    if (showPlayer.token !== token) return;
    if (instance) {
      openInvidious.href = `${instance}/watch?v=${videoId}`;
    } else {
      // No Invidious instance answered: fall back so the user still gets a video.
      backend = 'nocookie';
      openInvidious.hidden = true;
      setNotice('No ad-free server responded, so this is playing through YouTube and may show ads. Try again later or set your own instance in Settings.');
    }
  } else {
    setNotice('');
  }
  if (backend === 'invidious') setNotice('');

  videoFrame.onload = () => playerPlaceholder.classList.add('hidden');
  videoFrame.src = buildEmbedUrl(videoId, backend, settings.autoplay, instance);
}

function setPlaceholder(text, spinner) {
  playerPlaceholder.querySelector('p').textContent = text;
  playerPlaceholder.querySelector('.loading-spinner').style.display = spinner ? '' : 'none';
}

function setNotice(text) {
  let el = document.getElementById('playerNotice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'playerNotice';
    el.className = 'player-notice';
    document.querySelector('.player-wrapper').after(el);
  }
  el.textContent = text;
  el.hidden = !text;
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
    invidiousInstance: invidiousInstanceInput.value.trim(),
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
}

function closeSettings() {
  settingsModal.hidden = true;
}

// ── PWA Install Prompt ────────────────────────────────────────────────────────

let _installPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _installPrompt = e;
  installBtn.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!_installPrompt) return;
  _installPrompt.prompt();
  const { outcome } = await _installPrompt.userChoice;
  if (outcome === 'accepted') {
    installBtn.hidden = true;
    _installPrompt = null;
  }
});

window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
  _installPrompt = null;
});

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
