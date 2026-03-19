export default defineContentScript({
  matches: ['*://www.threads.net/*', '*://www.threads.com/*'],
  runAt: 'document_idle',

  async main(ctx) {
    const STORAGE_KEY = 'threads-spoiler-enabled';
    const INDICATOR_KEY = 'threads-spoiler-indicator';
    const SPOILER_COUNT_KEY = 'threads-spoiler-count';
    let spoilerCount = 0;

    async function isEnabled(): Promise<boolean> {
      const result = await browser.storage.local.get(STORAGE_KEY);
      return result[STORAGE_KEY] !== false;
    }

    async function isIndicatorEnabled(): Promise<boolean> {
      const result = await browser.storage.local.get(INDICATOR_KEY);
      return result[INDICATOR_KEY] !== false;
    }

    function updateCount() {
      browser.storage.local.set({ [SPOILER_COUNT_KEY]: spoilerCount });
    }

    function applyHighlight(el: HTMLElement) {
      el.classList.add('tsr-spoiler-highlight');
      el.style.setProperty('background-color', 'rgba(250, 204, 21, 0.18)', 'important');
      el.style.setProperty('border-bottom', '1.5px solid rgba(250, 204, 21, 0.5)', 'important');
      el.style.setProperty('border-radius', '2px', 'important');
      el.style.setProperty('padding', '1px 3px', 'important');
    }

    function removeHighlight(el: HTMLElement) {
      el.classList.remove('tsr-spoiler-highlight');
      el.style.removeProperty('border-bottom');
      el.style.removeProperty('border-radius');
      el.style.removeProperty('padding');
    }

    function isSpoilerButton(el: HTMLElement): boolean {
      if (el.tagName !== 'DIV' || el.getAttribute('role') !== 'button') return false;
      if (el.dataset.spoilerRevealed === 'true') return false;

      const innerDiv = el.querySelector<HTMLElement>(':scope > div');
      if (!innerDiv) return false;

      if (innerDiv.classList.contains('xt0psk2')) return true;

      const innerOpacity = getComputedStyle(innerDiv).opacity;
      if (innerOpacity !== '0') return false;

      const bg = getComputedStyle(el).backgroundColor;
      const match = bg.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
      if (!match) return false;

      const [, r, g, b] = match.map(Number);
      return Math.abs(r - g) < 10 && Math.abs(g - b) < 10;
    }

    async function revealSpoiler(spoilerButton: HTMLElement) {
      const innerDiv = spoilerButton.querySelector<HTMLElement>(':scope > div');
      if (!innerDiv) return;

      innerDiv.style.setProperty('opacity', '1', 'important');
      spoilerButton.style.setProperty('cursor', 'default', 'important');
      spoilerButton.dataset.spoilerRevealed = 'true';

      // Either highlight the spoiler text or make it transparent
      if (await isIndicatorEnabled()) {
        applyHighlight(spoilerButton);
      } else {
        spoilerButton.style.setProperty('background-color', 'transparent', 'important');
      }

      spoilerCount++;
      updateCount();
    }

    async function revealAllSpoilers() {
      const candidates = document.querySelectorAll<HTMLElement>(
        'div[role="button"]:not([data-spoiler-revealed="true"])'
      );
      for (const btn of candidates) {
        if (isSpoilerButton(btn)) {
          await revealSpoiler(btn);
        }
      }
      revealBlurredMedia();
    }

    function revealBlurredMedia() {
      const mediaElements = document.querySelectorAll<HTMLElement>(
        'img:not([data-spoiler-revealed]), video:not([data-spoiler-revealed])'
      );
      for (const el of mediaElements) {
        const cs = getComputedStyle(el);
        if (cs.filter.includes('blur')) {
          el.style.setProperty('filter', 'none', 'important');
          el.dataset.spoilerRevealed = 'true';
          spoilerCount++;
        }
        const parent = el.parentElement;
        if (parent && getComputedStyle(parent).filter.includes('blur')) {
          parent.style.setProperty('filter', 'none', 'important');
          parent.dataset.spoilerRevealed = 'true';
          spoilerCount++;
        }
      }

      const blurContainers = document.querySelectorAll<HTMLElement>(
        '[style*="blur"]:not([data-spoiler-revealed])'
      );
      for (const el of blurContainers) {
        const cs = getComputedStyle(el);
        if (cs.filter.includes('blur') || cs.backdropFilter.includes('blur')) {
          el.style.setProperty('filter', 'none', 'important');
          el.style.setProperty('backdrop-filter', 'none', 'important');
          el.dataset.spoilerRevealed = 'true';
          spoilerCount++;
        }
      }
      updateCount();
    }

    function hideAllSpoilers() {
      const revealed = document.querySelectorAll<HTMLElement>('[data-spoiler-revealed="true"]');
      for (const el of revealed) {
        if (el.getAttribute('role') === 'button') {
          const innerDiv = el.querySelector<HTMLElement>(':scope > div');
          if (innerDiv) innerDiv.style.removeProperty('opacity');
          el.style.removeProperty('background-color');
          el.style.removeProperty('cursor');
          removeHighlight(el);
        } else {
          el.style.removeProperty('filter');
          el.style.removeProperty('backdrop-filter');
        }
        delete el.dataset.spoilerRevealed;
      }
      spoilerCount = 0;
      updateCount();
    }

    function toggleIndicators(show: boolean) {
      const spoilers = document.querySelectorAll<HTMLElement>(
        'div[role="button"][data-spoiler-revealed="true"]'
      );
      for (const el of spoilers) {
        if (show) {
          applyHighlight(el);
        } else {
          removeHighlight(el);
          el.style.setProperty('background-color', 'transparent', 'important');
        }
      }
    }

    let styleEl: HTMLStyleElement | null = null;

    function injectRevealCSS() {
      if (styleEl) return;
      styleEl = document.createElement('style');
      styleEl.id = 'threads-spoiler-revealer-css';
      styleEl.textContent = `
        /* Reveal spoiler text */
        div[role="button"] > div.xt0psk2 {
          opacity: 1 !important;
        }

        /* Hover effect: intensify highlight on revealed spoilers */
        div[role="button"].tsr-spoiler-highlight:hover {
          background-color: rgba(250, 204, 21, 0.35) !important;
        }
      `;
      document.head.appendChild(styleEl);
    }

    function removeRevealCSS() {
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
    }

    // Listen for toggle messages
    browser.storage.onChanged.addListener(async (changes) => {
      if (changes[STORAGE_KEY]) {
        const enabled = changes[STORAGE_KEY].newValue !== false;
        if (enabled) {
          injectRevealCSS();
          await revealAllSpoilers();
        } else {
          removeRevealCSS();
          hideAllSpoilers();
        }
      }
      if (changes[INDICATOR_KEY]) {
        const show = changes[INDICATOR_KEY].newValue !== false;
        toggleIndicators(show);
      }
    });

    // Initial setup
    const enabled = await isEnabled();
    if (enabled) {
      injectRevealCSS();
      await revealAllSpoilers();
    }

    const observer = new MutationObserver(async () => {
      if (await isEnabled()) {
        await revealAllSpoilers();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    ctx.onInvalidated(() => {
      observer.disconnect();
      removeRevealCSS();
    });

    ctx.addEventListener(window, 'wxt:locationchange', async () => {
      if (await isEnabled()) {
        setTimeout(revealAllSpoilers, 500);
      }
    });
  },
});
