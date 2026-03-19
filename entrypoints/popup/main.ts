import './style.css';

const STORAGE_KEY = 'threads-spoiler-enabled';
const INDICATOR_KEY = 'threads-spoiler-indicator';
const SPOILER_COUNT_KEY = 'threads-spoiler-count';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="container">
    <div class="header">
      <div class="logo-row">
        <div class="logo">
          <svg width="28" height="28" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="64" cy="64" r="56" fill="url(#bg)" />
            <path d="M64 44c-16 0-32 12-32 20s16 20 32 20 32-12 32-20-16-20-32-20z" fill="none" stroke="white" stroke-width="5" stroke-linecap="round"/>
            <circle cx="64" cy="64" r="10" fill="white"/>
            <circle cx="64" cy="64" r="5" fill="url(#iris)"/>
            <path d="M44 40l-8-8M84 40l8-8M44 88l-8 8M84 88l8 8" stroke="white" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
            <defs>
              <linearGradient id="bg" x1="0" y1="0" x2="128" y2="128">
                <stop offset="0%" stop-color="#7C3AED"/>
                <stop offset="100%" stop-color="#4F46E5"/>
              </linearGradient>
              <linearGradient id="iris" x1="59" y1="59" x2="69" y2="69">
                <stop offset="0%" stop-color="#7C3AED"/>
                <stop offset="100%" stop-color="#4F46E5"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div class="title-group">
          <h1>Threads Spoiler Revealer</h1>
          <p class="subtitle">See what's hidden</p>
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="control-section">
      <div class="toggle-row">
        <div class="toggle-info">
          <span class="toggle-label">Auto-reveal</span>
          <span class="toggle-desc">Reveal spoilers instantly</span>
        </div>
        <label class="switch">
          <input type="checkbox" id="toggle" checked />
          <span class="slider"></span>
        </label>
      </div>

      <div class="toggle-row">
        <div class="toggle-info">
          <span class="toggle-label">Highlight spoilers</span>
          <span class="toggle-desc">Tint revealed words so you spot the punchline</span>
        </div>
        <label class="switch">
          <input type="checkbox" id="indicator-toggle" checked />
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <div class="divider"></div>

    <div class="stats-section">
      <div class="stat-card">
        <div class="stat-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3C4 3 1 8 1 8s3 5 7 5 7-5 7-5-3-5-7-5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
            <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
          </svg>
        </div>
        <div class="stat-content">
          <span class="stat-value" id="count">0</span>
          <span class="stat-label">spoilers revealed</span>
        </div>
      </div>
    </div>

    <div class="status-bar" id="status-bar">
      <span class="status-dot"></span>
      <span class="status-text" id="status">Active</span>
    </div>
  </div>
`;

const toggle = document.querySelector<HTMLInputElement>('#toggle')!;
const indicatorToggle = document.querySelector<HTMLInputElement>('#indicator-toggle')!;
const statusText = document.querySelector<HTMLSpanElement>('#status')!;
const statusBar = document.querySelector<HTMLDivElement>('#status-bar')!;
const countEl = document.querySelector<HTMLSpanElement>('#count')!;

// Load saved state
browser.storage.local
  .get([STORAGE_KEY, INDICATOR_KEY, SPOILER_COUNT_KEY])
  .then((result) => {
    const enabled = result[STORAGE_KEY] !== false;
    const indicatorEnabled = result[INDICATOR_KEY] !== false;
    toggle.checked = enabled;
    indicatorToggle.checked = indicatorEnabled;
    updateStatus(enabled);
    countEl.textContent = String(result[SPOILER_COUNT_KEY] || 0);
  });

// Listen for live count updates
browser.storage.onChanged.addListener((changes) => {
  if (changes[SPOILER_COUNT_KEY]) {
    countEl.textContent = String(changes[SPOILER_COUNT_KEY].newValue || 0);
  }
});

toggle.addEventListener('change', async () => {
  const enabled = toggle.checked;
  await browser.storage.local.set({ [STORAGE_KEY]: enabled });
  updateStatus(enabled);
});

indicatorToggle.addEventListener('change', async () => {
  await browser.storage.local.set({ [INDICATOR_KEY]: indicatorToggle.checked });
});

function updateStatus(enabled: boolean) {
  statusText.textContent = enabled ? 'Active on Threads' : 'Paused';
  statusBar.classList.toggle('paused', !enabled);
}
