/**
 * content.js
 * Injects UI elements into ci.me pages.
 */

(function() {
  const browserAPI = globalThis.browser || globalThis.chrome;
  const BTN_ID = 'cime-add-btn';

  let isInjecting = false;
  async function injectAddButton() {
    if (isInjecting) return;

    // Detect Platform
    const host = window.location.hostname;
    let platform = 'CIME';
    let slug = null;

    const currentPath = window.location.pathname;
    if (host.includes('chzzk.naver.com')) {
      platform = 'CHZZK';
      // Chzzk URL formats: /@slug, /live/uid, /video/uid
      const match = currentPath.match(/^\/(?:@|live\/|video\/)([^/?#]+)/);
      if (match) {
        slug = match[1];
      }
    } else {
      platform = 'CIME';
      const match = currentPath.match(/^\/@([^/?#]+)/);
      if (match) {
        slug = match[1];
      }
    }

    if (!slug) {
      // Not a channel/live page, remove button if exists
      const existingBtn = document.getElementById(BTN_ID);
      if (existingBtn) existingBtn.remove();
      return;
    }

    // Find the right place to inject
    let container = null;

    if (platform === 'CHZZK') {
      // Chzzk Button Inject logic - use more generic but robust selectors
      const followBtn = document.querySelector('[class*="follow_button"]') || 
                        document.querySelector('[class*="p_button--follow"]') ||
                        document.querySelector('[aria-label="팔로우"]') ||
                        document.querySelector('[aria-label*="팔로우"]') ||
                        Array.from(document.querySelectorAll('button')).find(b => b.innerText?.includes('팔로우'));
      
      const subscribeBtn = document.querySelector('[class*="subscribe_button"]') || 
                           document.querySelector('[aria-label="구독"]') ||
                           Array.from(document.querySelectorAll('button')).find(b => b.innerText?.includes('구독'));

      const targetBase = followBtn || subscribeBtn;
      
      container = targetBase ? targetBase.parentElement : 
                  document.querySelector('[class*="channel_header_info"]') ||
                  document.querySelector('[class*="live_information_area"]') ||
                  document.querySelector('[class*="video_information_area"]') ||
                  document.querySelector('[class*="HeaderView_buttons_"]');
    } else {
      // ci.me Button Inject logic
      const followBtn = document.querySelector('.FollowButtonView') || 
                        document.querySelector('[aria-label="팔로우"]') ||
                        document.querySelector('[aria-label*="팔로우"]') ||
                        document.querySelector('button[class*="follow_button"]');
      
      // Fallback to subscribe button area if follow button not found
      const subscribeBtn = document.querySelector('[aria-label="구독"]') ||
                           document.querySelector('button[class*="subscribe_button"]');

      const targetBase = followBtn || subscribeBtn;
      
      container = targetBase ? targetBase.parentElement : 
                        document.querySelector('div[class*="ChannelHeader_info_"]') || 
                        document.querySelector('div[class*="Info_info_"]') ||
                        document.querySelector('div[class*="HeaderView_buttons_"]');
    }
    
    if (!container) return;

    let btn = document.getElementById(BTN_ID);
    if (btn && (btn.dataset.slug !== slug || btn.dataset.platform !== platform)) {
      btn.remove();
      btn = null;
    }

    if (btn) return;

    // Start injection process
    isInjecting = true;

    try {
      // Check if streamer is already added (Async gap)
      const key = 'cime_streamers';
      const { [key]: streamers = [] } = await browserAPI.storage.local.get(key);
      
      // Re-verify after await to prevent race conditions
      if (document.getElementById(BTN_ID) || window.location.pathname !== currentPath) {
        isInjecting = false;
        return;
      }

      const isAdded = streamers.some(s => s.slug === slug && s.platform === platform);

      btn = document.createElement('button');
      btn.id = BTN_ID;
      btn.dataset.slug = slug;
      btn.dataset.platform = platform;
      btn.innerText = isAdded ? '✅ 추가됨' : (platform === 'CHZZK' ? '치지직 자동 이동 추가' : '방송 자동 이동 추가');
      btn.disabled = isAdded;
    
      // Common style
      btn.style.cssText = `
        margin-left: 10px;
        padding: 6px 12px;
        background: ${isAdded ? '#28a745' : (platform === 'CHZZK' ? '#00ffa3' : '#7355ff')};
        color: ${platform === 'CHZZK' && !isAdded ? 'black' : 'white'};
        border: none;
        border-radius: 4px;
        cursor: ${isAdded ? 'default' : 'pointer'};
        font-size: 14px;
        font-weight: bold;
        transition: background 0.2s;
        z-index: 9999;
      `;

      if (!isAdded) {
        btn.onmouseover = () => btn.style.background = platform === 'CHZZK' ? '#00e692' : '#5836ff';
        btn.onmouseout = () => btn.style.background = platform === 'CHZZK' ? '#00ffa3' : '#7355ff';
        btn.onclick = async () => {
          const name = platform === 'CHZZK' ? 
                       document.querySelector('[class*="channel_name"]')?.innerText || slug :
                       document.querySelector('h1')?.innerText || slug;
          await addStreamer(slug, name, platform);
          btn.innerText = '✅ 추가됨';
          btn.style.background = '#28a745';
          btn.style.color = 'white';
          btn.style.cursor = 'default';
          btn.disabled = true;
        };
      }

      container.appendChild(btn);
    } catch (e) {
      console.error('Failed to inject button:', e);
    } finally {
      isInjecting = false;
    }
  }

  async function addStreamer(slug, name, platform = 'CIME') {
    const key = 'cime_streamers';
    const { [key]: streamers = [] } = await browserAPI.storage.local.get(key);
    
    if (streamers.some(s => s.slug === slug && s.platform === platform)) return;

    streamers.push({ 
      slug, 
      name, 
      platform,
      mode: 'ONCE', // Default mode
      addedAt: Date.now() 
    });

    await browserAPI.storage.local.set({ [key]: streamers });
  }

  // Initial injection
  injectAddButton();

  // Watch for DOM changes (for both SPA navigation and dynamic header rendering)
  let lastPath = window.location.pathname;
  let debounceTimer = null;

  const observer = new MutationObserver(() => {
    const currentPath = window.location.pathname;
    const host = window.location.hostname;
    const btn = document.getElementById(BTN_ID);
    
    // Unified detection logic
    let isChannelPage = false;
    let currentSlug = null;

    if (host.includes('chzzk.naver.com')) {
      const match = currentPath.match(/^\/(?:@|live\/|video\/)([^/?#]+)/);
      if (match) {
        isChannelPage = true;
        currentSlug = match[1];
      }
    } else {
      const match = currentPath.match(/^\/@([^/?#]+)/);
      if (match) {
        isChannelPage = true;
        currentSlug = match[1];
      }
    }

    const needsInjection = (isChannelPage && !btn) || (btn && btn.dataset.slug !== currentSlug);
    const pathChanged = currentPath !== lastPath;

    if (pathChanged || needsInjection) {
      lastPath = currentPath;
      
      // Use debounce to prevent multiple calls in a single event loop batch
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(injectAddButton, 100);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Backup poller (every 2 seconds) to ensure button exists
  setInterval(() => {
    const currentPath = window.location.pathname;
    const host = window.location.hostname;
    
    let isChannelPage = false;
    if (host.includes('chzzk.naver.com')) {
      isChannelPage = /^\/(?:@|live\/|video\/)([^/?#]+)/.test(currentPath);
    } else {
      isChannelPage = /^\/@([^/?#]+)/.test(currentPath);
    }
    
    if (isChannelPage) {
      const btn = document.getElementById(BTN_ID);
      if (!btn && !isInjecting) {
        injectAddButton();
      }
    }
  }, 2000);
})();
