/**
 * background.js
 * Core logic for polling ci.me API and handling redirections/notifications.
 */
import { CONFIG } from './config.js';

const browserAPI = globalThis.browser || globalThis.chrome;

class CimeLiveChecker {
  constructor() {
    this.init();
  }

  async init() {
    console.log('CimeLiveChecker initialized');
    // 알람 리스너 등록 - 주기적 폴링
    browserAPI.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'cime-poll') {
        this.checkAllStreamers();
      }
    });

    // 팝업에서 전달된 메시지 처리
    browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'UPDATE_ALARM') {
        this.startPolling();
        if (sendResponse) sendResponse({ success: true });
      } else if (message.type === 'TEST_NOTIFY') {
        this.showTestNotification();
        if (sendResponse) sendResponse({ success: true });
      }
      return true;
    });

    // 알림 버튼 클릭 처리
    browserAPI.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
      if (notificationId.startsWith('cime_') && buttonIndex === 0) {
        const parts = notificationId.split('_');
        const slug = parts[1];
        this.openLiveTab(slug);
      }
    });

    // 알림 본문 클릭 처리
    browserAPI.notifications.onClicked.addListener((notificationId) => {
      if (notificationId.startsWith('cime_')) {
        const parts = notificationId.split('_');
        const slug = parts[1];
        this.openLiveTab(slug);
      }
    });

    // 브라우저 시작 시 즉시 스트리머 상태 체크 (ALWAYS 모드 지원)
    browserAPI.runtime.onStartup.addListener(() => {
      console.log('[onStartup] 브라우저 시작 감지 - 즉시 스트리머 상태 체크');
      this.checkAllStreamers();
    });

    // 확장프로그램 설치/업데이트 시에도 즉시 체크
    browserAPI.runtime.onInstalled.addListener(() => {
      console.log('[onInstalled] 확장프로그램 설치/업데이트 - 폴링 시작 및 즉시 체크');
      this.startPolling();
      this.checkAllStreamers();
    });

    // 폴링 시작
    this.startPolling();

    // Service Worker 초기화 시 즉시 한 번 체크 (alarm 대기 없이)
    this.checkAllStreamers();
  }

  async startPolling() {
    const { [CONFIG.STORAGE_KEYS.INTERVAL]: interval = CONFIG.DEFAULT_POLLING_INTERVAL } = 
      await browserAPI.storage.local.get(CONFIG.STORAGE_KEYS.INTERVAL);
    
    browserAPI.alarms.create('cime-poll', { periodInMinutes: interval });
  }

  async checkAllStreamers() {
    const { [CONFIG.STORAGE_KEYS.STREAMERS]: streamers = [] } = 
      await browserAPI.storage.local.get(CONFIG.STORAGE_KEYS.STREAMERS);
    
    if (streamers.length === 0) return;

    for (const streamer of streamers) {
      await this.checkStreamerStatus(streamer);
    }
  }

  async checkStreamerStatus(streamer) {
    try {
      const platform = streamer.platform || CONFIG.PLATFORMS.CIME;
      const response = await fetch(CONFIG.CHANNEL_API_URL(streamer.slug, platform));
      if (!response.ok) throw new Error('API request failed');
      const json = await response.json();
      
      let isLive = false;
      let liveId = null;

      if (platform === CONFIG.PLATFORMS.CHZZK) {
        isLive = json.content?.status === 'OPEN';
        liveId = json.content?.liveId;
      } else {
        // ci.me logic
        isLive = json.data?.isLive || false;
        liveId = json.data?.id;
      }

      const { [CONFIG.STORAGE_KEYS.HISTORY]: history = {} } = 
        await browserAPI.storage.local.get(CONFIG.STORAGE_KEYS.HISTORY);
      
      const prevStatus = history[streamer.slug] || { isLive: false };

      // Transition: Offline -> Online
      if (isLive && !prevStatus.isLive) {
        await this.handleLiveStarted(streamer, json.content || json.data);
      } 
      // Mode: ALWAYS check (if tab is open)
      else if (isLive && streamer.mode === CONFIG.MODES.ALWAYS) {
        await this.checkAndReopenTab(streamer);
      }

      // Update History
      history[streamer.slug] = { isLive, liveId, lastUpdated: Date.now() };
      await browserAPI.storage.local.set({ [CONFIG.STORAGE_KEYS.HISTORY]: history });

    } catch (error) {
      console.error(`Error checking ${streamer.slug} (${streamer.platform}):`, error);
    }
  }

  async handleLiveStarted(streamer, data) {
    const mode = streamer.mode || await this.getGlobalMode();
    
    // Always show notification when a new live starts
    this.showNotification(streamer, data);

    // Additionally handle tab opening for ONCE and ALWAYS modes
    if (mode !== CONFIG.MODES.NOTIFY) {
      this.openLiveTab(streamer.slug, streamer.platform);
    }
  }

  async checkAndReopenTab(streamer) {
    const url = CONFIG.LIVE_PAGE_URL(streamer.slug, streamer.platform);
    const tabs = await browserAPI.tabs.query({ url: `${url}*` });
    if (tabs.length === 0) {
      this.openLiveTab(streamer.slug, streamer.platform);
    }
  }

  async openLiveTab(slug, platform = CONFIG.PLATFORMS.CIME) {
    const url = CONFIG.LIVE_PAGE_URL(slug, platform);
    // Check if tab already exists
    const tabs = await browserAPI.tabs.query({ url: `${url.split('?')[0]}*` });
    if (tabs.length > 0) {
      browserAPI.tabs.update(tabs[0].id, { active: true });
    } else {
      browserAPI.tabs.create({ url });
    }
  }

  showNotification(streamer, data, isTest = false) {
    try {
      const options = {
        type: 'basic',
        iconUrl: browserAPI.runtime.getURL('icons/icon128.png'),
        title: isTest ? '씨미 알림 테스트' : '씨미 방송 시작!',
        message: isTest ? '알림이 정상적으로 동작합니다.' : `${streamer.name || streamer.slug}님이 방송을 시작했습니다.`
      };

      console.log('Creating notification:', options);

      // Use empty string for auto-generated ID in Firefox
      browserAPI.notifications.create('', options, (id) => {
        if (browserAPI.runtime.lastError) {
          console.error('Notification Error:', browserAPI.runtime.lastError.message);
          // Try without icon as ultimate fallback
          const fallbackOptions = { ...options };
          delete fallbackOptions.iconUrl;
          browserAPI.notifications.create('', fallbackOptions);
        } else {
          console.log('Notification created:', id);
        }
      });
    } catch (e) {
      console.error('Notification exception:', e);
    }
  }

  async getGlobalMode() {
    const { [CONFIG.STORAGE_KEYS.GLOBAL_MODE]: mode = CONFIG.MODES.ONCE } = 
      await browserAPI.storage.local.get(CONFIG.STORAGE_KEYS.GLOBAL_MODE);
    return mode;
  }

  showTestNotification() {
    this.showNotification({ slug: 'test', name: '테스트' }, null, true);
  }
}

// Instantiate
new CimeLiveChecker();
