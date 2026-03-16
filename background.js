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
    // Setup Alarms
    browserAPI.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'cime-poll') {
        this.checkAllStreamers();
      }
    });

    // Handle Messages from Popup
    browserAPI.runtime.onMessage.addListener((message) => {
      if (message.type === 'UPDATE_ALARM') {
        this.startPolling();
      } else if (message.type === 'TEST_NOTIFY') {
        this.showTestNotification();
      }
    });

    // Handle Notification Button Clicks
    browserAPI.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
      if (notificationId.startsWith('cime_') && buttonIndex === 0) {
        const parts = notificationId.split('_');
        const slug = parts[1];
        this.openLiveTab(slug);
      }
    });

    // Handle Notification Body Clicks
    browserAPI.notifications.onClicked.addListener((notificationId) => {
      if (notificationId.startsWith('cime_')) {
        const parts = notificationId.split('_');
        const slug = parts[1];
        this.openLiveTab(slug);
      }
    });

    // Start Polling
    this.startPolling();
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
      const response = await fetch(CONFIG.CHANNEL_API_URL(streamer.slug));
      if (!response.ok) throw new Error('API request failed');
      const json = await response.json();
      
      const isLive = json.data?.isLive || false;
      const liveId = json.data?.id; // Using channel id as a proxy if live id not available directly

      const { [CONFIG.STORAGE_KEYS.HISTORY]: history = {} } = 
        await browserAPI.storage.local.get(CONFIG.STORAGE_KEYS.HISTORY);
      
      const prevStatus = history[streamer.slug] || { isLive: false };

      // Transition: Offline -> Online
      if (isLive && !prevStatus.isLive) {
        await this.handleLiveStarted(streamer, json.data);
      } 
      // Mode: ALWAYS check (if tab is open)
      else if (isLive && streamer.mode === CONFIG.MODES.ALWAYS) {
        await this.checkAndReopenTab(streamer);
      }

      // Update History
      history[streamer.slug] = { isLive, liveId, lastUpdated: Date.now() };
      await browserAPI.storage.local.set({ [CONFIG.STORAGE_KEYS.HISTORY]: history });

    } catch (error) {
      console.error(`Error checking ${streamer.slug}:`, error);
    }
  }

  async handleLiveStarted(streamer, data) {
    const mode = streamer.mode || await this.getGlobalMode();
    
    // Always show notification when a new live starts
    this.showNotification(streamer, data);

    // Additionally handle tab opening for ONCE and ALWAYS modes
    if (mode !== CONFIG.MODES.NOTIFY) {
      this.openLiveTab(streamer.slug);
    }
  }

  async checkAndReopenTab(streamer) {
    const tabs = await browserAPI.tabs.query({ url: `${CONFIG.LIVE_PAGE_URL(streamer.slug)}*` });
    if (tabs.length === 0) {
      this.openLiveTab(streamer.slug);
    }
  }

  async openLiveTab(slug) {
    const url = CONFIG.LIVE_PAGE_URL(slug);
    // Check if tab already exists
    const tabs = await browserAPI.tabs.query({ url: `${url}*` });
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

      // Null ID for auto-generation
      browserAPI.notifications.create(null, options, (id) => {
        if (browserAPI.runtime.lastError) {
          console.error('Notification Error:', browserAPI.runtime.lastError.message);
          // Try without icon as ultimate fallback
          delete options.iconUrl;
          browserAPI.notifications.create(null, options);
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
