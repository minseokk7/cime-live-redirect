/**
 * background.js
 * Core logic for polling ci.me API and handling redirections/notifications.
 */
import { CONFIG } from './config.js';

const browserAPI = globalThis.browser || globalThis.chrome;

class CimeLiveChecker {
  constructor() {
    // 동시 실행 방지 플래그
    this._isChecking = false;
    // 브라우저 시작 후 첫 체크인지 여부
    this._isFirstCheck = true;
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

    // 확장프로그램 설치/업데이트 시 폴링 재설정
    browserAPI.runtime.onInstalled.addListener(() => {
      console.log('[onInstalled] 확장프로그램 설치/업데이트 - 폴링 시작');
      this.startPolling();
    });

    // 폴링 시작
    this.startPolling();

    // Service Worker 초기화 시 즉시 한 번 체크 (alarm 대기 없이)
    // onStartup과 중복 실행되더라도 _isChecking 락으로 보호됨
    this.checkAllStreamers();
  }

  async startPolling() {
    const { [CONFIG.STORAGE_KEYS.INTERVAL]: interval = CONFIG.DEFAULT_POLLING_INTERVAL } = 
      await browserAPI.storage.local.get(CONFIG.STORAGE_KEYS.INTERVAL);
    
    browserAPI.alarms.create('cime-poll', { periodInMinutes: interval });
  }

  async checkAllStreamers() {
    // 동시 실행 방지 - 이미 체크 중이면 건너뜀
    if (this._isChecking) {
      console.log('[checkAll] 이미 체크 진행 중 - 중복 실행 방지');
      return;
    }

    this._isChecking = true;
    try {
      const { [CONFIG.STORAGE_KEYS.STREAMERS]: streamers = [] } = 
        await browserAPI.storage.local.get(CONFIG.STORAGE_KEYS.STREAMERS);
      
      if (streamers.length === 0) return;

      for (const streamer of streamers) {
        // 첫 체크 여부를 함께 전달
        await this.checkStreamerStatus(streamer, this._isFirstCheck);
      }
      
      // 모든 스트리머 체크 후 첫 체크 플래그 해제
      this._isFirstCheck = false;
    } catch (error) {
      console.error('[checkAll] 스트리머 체크 중 오류:', error);
    } finally {
      this._isChecking = false;
    }
  }

  async checkStreamerStatus(streamer, isFirstCheck = false) {
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

      // 상황 1: 방송이 새로 시작됨 (Off -> On)
      if (isLive && !prevStatus.isLive) {
        await this.handleLiveStarted(streamer, json.content || json.data);
      } 
      // 상황 2: 브라우저가 새로 켜졌을 때 이미 방송 중 + ALWAYS 모드
      else if (isLive && isFirstCheck && streamer.mode === CONFIG.MODES.ALWAYS) {
        console.log(`[ALWAYS] 브라우저 재시작 후 방송 중인 채널 발견 (@${streamer.slug}) - 탭 열기`);
        this.openLiveTab(streamer.slug, streamer.platform);
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

  async openLiveTab(slug, platform = CONFIG.PLATFORMS.CIME) {
    const url = CONFIG.LIVE_PAGE_URL(slug, platform);
    // 탭이 이미 있는지 확인 (중복 방지)
    const tabs = await browserAPI.tabs.query({ url: `${url.split('?')[0]}*` });
    if (tabs.length > 0) {
      // 이미 있으면 활성화만 시키거나 그대로 둠 (여기서는 활성화)
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
