export default defineContentScript({
  matches: ['*://www.threads.net/*', '*://www.threads.com/*'],
  runAt: 'document_idle',

  async main(ctx) {
    const STORAGE_KEY = 'threads-spoiler-enabled';
    const INDICATOR_KEY = 'threads-spoiler-indicator';
    const SPOILER_COUNT_KEY = 'threads-spoiler-count';
    let spoilerCount = 0;
    const markedPosts = new Set<string>();

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

    /**
     * Find the post container by walking up from a spoiler button.
     * The post container is the div with padding and position:relative
     * that contains a post link (a[href*="/post/"]).
     */
    function findPostContainer(el: HTMLElement): HTMLElement | null {
      let current = el.parentElement;
      for (let i = 0; i < 12 && current; i++) {
        const cs = getComputedStyle(current);
        if (
          cs.position === 'relative' &&
          cs.padding !== '0px' &&
          current.querySelector('a[href*="/post/"]')
        ) {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    }

    /**
     * Get a unique ID for a post from its container.
     */
    function getPostId(container: HTMLElement): string | null {
      const link = container.querySelector<HTMLAnchorElement>('a[href*="/post/"]');
      return link?.getAttribute('href') || null;
    }

    /**
     * Add a subtle post-level indicator: thin left border + small label.
     * Only one per post, placed unobtrusively at the bottom.
     */
    async function addPostIndicator(container: HTMLElement) {
      if (!(await isIndicatorEnabled())) return;
      if (container.dataset.tsrIndicator === 'true') return;

      container.dataset.tsrIndicator = 'true';
      container.classList.add('tsr-post-spoiler');
    }

    function removePostIndicator(container: HTMLElement) {
      container.classList.remove('tsr-post-spoiler');
      delete container.dataset.tsrIndicator;
    }

    function revealSpoiler(spoilerButton: HTMLElement) {
      const innerDiv = spoilerButton.querySelector<HTMLElement>(':scope > div');
      if (!innerDiv) return;

      innerDiv.style.setProperty('opacity', '1', 'important');
      spoilerButton.style.setProperty('background-color', 'transparent', 'important');
      spoilerButton.style.setProperty('cursor', 'default', 'important');
      spoilerButton.dataset.spoilerRevealed = 'true';

      // Add post-level indicator (one per post)
      const postContainer = findPostContainer(spoilerButton);
      if (postContainer) {
        const postId = getPostId(postContainer);
        if (postId && !markedPosts.has(postId)) {
          markedPosts.add(postId);
          addPostIndicator(postContainer);
        }
      }

      spoilerCount++;
      updateCount();
    }

    function revealAllSpoilers() {
      const candidates = document.querySelectorAll<HTMLElement>(
        'div[role="button"]:not([data-spoiler-revealed="true"])'
      );
      for (const btn of candidates) {
        if (isSpoilerButton(btn)) {
          revealSpoiler(btn);
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
        } else {
          el.style.removeProperty('filter');
          el.style.removeProperty('backdrop-filter');
        }
        delete el.dataset.spoilerRevealed;
      }

      // Remove all post indicators
      const indicators = document.querySelectorAll<HTMLElement>('[data-tsr-indicator="true"]');
      for (const el of indicators) {
        removePostIndicator(el);
      }
      markedPosts.clear();
      spoilerCount = 0;
      updateCount();
    }

    function toggleIndicators(show: boolean) {
      const posts = document.querySelectorAll<HTMLElement>('[data-tsr-indicator="true"]');
      for (const el of posts) {
        if (show) {
          el.classList.add('tsr-post-spoiler');
        } else {
          el.classList.remove('tsr-post-spoiler');
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
        div[role="button"]:has(> div.xt0psk2) {
          background-color: transparent !important;
        }

        /* Post-level spoiler indicator: subtle left accent bar */
        .tsr-post-spoiler {
          border-left: 3px solid rgba(124, 58, 237, 0.5) !important;
        }

        /* Small "eye" indicator near the post actions */
        .tsr-post-spoiler::after {
          content: '';
          display: block;
          width: 14px;
          height: 14px;
          margin: 2px 0 0 0;
          opacity: 0.35;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M8 3.5C4.5 3.5 1.5 8 1.5 8s3 4.5 6.5 4.5S14.5 8 14.5 8s-3-4.5-6.5-4.5z' stroke='%237C3AED' stroke-width='1.2' fill='none'/%3E%3Ccircle cx='8' cy='8' r='2' stroke='%237C3AED' stroke-width='1.2' fill='none'/%3E%3C/svg%3E");
          background-size: contain;
          background-repeat: no-repeat;
          pointer-events: none;
          animation: tsr-fade-in 0.4s ease;
        }

        @keyframes tsr-fade-in {
          from { opacity: 0; }
          to { opacity: 0.35; }
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
          revealAllSpoilers();
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
      revealAllSpoilers();
    }

    const observer = new MutationObserver(async () => {
      if (await isEnabled()) {
        revealAllSpoilers();
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
