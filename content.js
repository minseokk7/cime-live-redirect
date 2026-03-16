/**
 * content.js
 * Injects UI elements into ci.me pages.
 */

(function() {
  const browserAPI = globalThis.browser || globalThis.chrome;

  function injectAddButton() {
    // Check if already injected
    if (document.getElementById('cime-add-btn')) return;

    // Detect if we are on a channel page: https://ci.me/@slug
    const path = window.location.pathname;
    const match = path.match(/^\/@([^/]+)/);
    if (!match) return;

    const slug = match[1];

    // Find the right place to inject (Follow button area)
    const followBtn = document.querySelector('.FollowButtonView') || 
                      document.querySelector('[aria-label="팔로우"]') ||
                      document.querySelector('button[class*="follow_button"]');
    
    const container = followBtn ? followBtn.parentElement : 
                      document.querySelector('div[class*="ChannelHeader_info_"]') || 
                      document.querySelector('div[class*="Info_info_"]');
    
    if (!container) {
      // Try again shortly if header not found yet
      setTimeout(injectAddButton, 1000);
      return;
    }

    const btn = document.createElement('button');
    btn.id = 'cime-add-btn';
    btn.innerText = '방송 자동 이동 추가';
    btn.style.cssText = `
      margin-left: 10px;
      padding: 6px 12px;
      background: #7355ff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
      transition: background 0.2s;
    `;
    btn.onmouseover = () => btn.style.background = '#5836ff';
    btn.onmouseout = () => btn.style.background = '#7355ff';

    btn.onclick = async () => {
      const name = document.querySelector('h1')?.innerText || slug;
      await addStreamer(slug, name);
      btn.innerText = '✅ 추가됨';
      btn.style.background = '#28a745';
      btn.disabled = true;
    };

    container.appendChild(btn);
  }

  async function addStreamer(slug, name) {
    const key = 'cime_streamers';
    const { [key]: streamers = [] } = await browserAPI.storage.local.get(key);
    
    if (streamers.some(s => s.slug === slug)) return;

    streamers.push({ 
      slug, 
      name, 
      mode: 'ONCE', // Default mode
      addedAt: Date.now() 
    });

    await browserAPI.storage.local.set({ [key]: streamers });
    
    // Notify background to re-check or just let it poll
    console.log(`Added ${slug} to monitoring list.`);
  }

  // Initial injection
  injectAddButton();

  // Watch for SPA navigation
  let lastPath = window.location.pathname;
  const observer = new MutationObserver(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      injectAddButton();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
