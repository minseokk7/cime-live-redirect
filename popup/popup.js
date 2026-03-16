/**
 * popup.js
 * Logic for the extension popup UI.
 */

const browserAPI = globalThis.browser || globalThis.chrome;

document.addEventListener('DOMContentLoaded', async () => {
  const streamerList = document.getElementById('streamer-list');
  const streamerCount = document.getElementById('streamer-count');
  const intervalInput = document.getElementById('interval');
  const intervalVal = document.getElementById('interval-val');
  const globalModeSelect = document.getElementById('global-mode');
  const testNotifyBtn = document.getElementById('test-notify');
  const clearHistoryBtn = document.getElementById('clear-history');

  // Load Settings
  const { 
    cime_streamers: streamers = [],
    cime_interval: interval = 0.5,
    cime_global_mode: globalMode = 'ONCE'
  } = await browserAPI.storage.local.get(['cime_streamers', 'cime_interval', 'cime_global_mode']);

  // Set Initial UI State
  intervalInput.value = interval;
  updateIntervalLabel(interval);
  globalModeSelect.value = globalMode;
  renderStreamers(streamers);

  // Interval Change
  intervalInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    updateIntervalLabel(val);
  });

  intervalInput.addEventListener('change', async (e) => {
    const val = parseFloat(e.target.value);
    await browserAPI.storage.local.set({ cime_interval: val });
    // Tell background to update alarm
    browserAPI.runtime.sendMessage({ type: 'UPDATE_ALARM', interval: val });
  });

  // Global Mode Change
  globalModeSelect.addEventListener('change', async (e) => {
    await browserAPI.storage.local.set({ cime_global_mode: e.target.value });
  });

  // Manual Add Streamer
  const manualAddBtn = document.getElementById('manual-add-btn');
  const manualSlugInput = document.getElementById('manual-slug');

  async function handleManualAdd() {
    const slug = manualSlugInput.value.trim().replace(/^@/, '');
    if (!slug) return;

    const { cime_streamers: currentStreamers = [] } = await browserAPI.storage.local.get('cime_streamers');
    if (currentStreamers.some(s => s.slug === slug)) {
      alert('이미 등록된 스트리머입니다.');
      return;
    }

    const newStreamer = {
      slug,
      name: slug, // Default name to slug for manual entry
      mode: globalModeSelect.value,
      addedAt: Date.now()
    };

    const newList = [...currentStreamers, newStreamer];
    await browserAPI.storage.local.set({ cime_streamers: newList });
    manualSlugInput.value = '';
    renderStreamers(newList);
  }

  manualAddBtn.addEventListener('click', handleManualAdd);
  manualSlugInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleManualAdd();
  });

  // Test Notification
  testNotifyBtn.addEventListener('click', () => {
    console.log('Sending TEST_NOTIFY message to background');
    browserAPI.runtime.sendMessage({ type: 'TEST_NOTIFY' });
  });

  // Clear History
  clearHistoryBtn.addEventListener('click', async () => {
    if (confirm('모든 감지 기록을 초기화하시겠습니까? (다시 방송이 켜지면 탭이 열립니다)')) {
      await browserAPI.storage.local.set({ cime_history: {} });
      alert('초기화되었습니다.');
    }
  });

  function updateIntervalLabel(val) {
    if (val < 1) {
      intervalVal.innerText = `${Math.round(val * 60)}초`;
    } else {
      intervalVal.innerText = `${val}분`;
    }
  }

  function renderStreamers(list) {
    streamerCount.innerText = list.length;
    if (list.length === 0) {
      streamerList.innerHTML = '<div class="empty-state">등록된 스트리머가 없습니다.<br>ci.me 방송 페이지에서 버튼을 눌러 추가하세요.</div>';
      return;
    }

    streamerList.innerHTML = '';
    list.forEach((s, index) => {
      const item = document.createElement('div');
      item.className = 'streamer-item';
      item.innerHTML = `
        <div class="streamer-info">
          <div class="streamer-name">${s.name}</div>
          <div class="streamer-slug">@${s.slug}</div>
        </div>
        <div class="streamer-controls">
          <select class="item-mode" data-index="${index}">
            <option value="ONCE" ${s.mode === 'ONCE' ? 'selected' : ''}>1회</option>
            <option value="ALWAYS" ${s.mode === 'ALWAYS' ? 'selected' : ''}>항상</option>
            <option value="NOTIFY" ${s.mode === 'NOTIFY' ? 'selected' : ''}>알림</option>
          </select>
          <button class="btn-remove" data-index="${index}" title="삭제">×</button>
        </div>
      `;
      streamerList.appendChild(item);
    });

    // Add list event listeners
    document.querySelectorAll('.item-mode').forEach(el => {
      el.addEventListener('change', async (e) => {
        const idx = e.target.dataset.index;
        const newList = [...list];
        newList[idx].mode = e.target.value;
        await browserAPI.storage.local.set({ cime_streamers: newList });
      });
    });

    document.querySelectorAll('.btn-remove').forEach(el => {
      el.addEventListener('click', async (e) => {
        const idx = e.target.dataset.index;
        const newList = list.filter((_, i) => i !== parseInt(idx));
        await browserAPI.storage.local.set({ cime_streamers: newList });
        renderStreamers(newList);
      });
    });
  }
});
