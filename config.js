/**
 * config.js
 * Project configuration and constants
 */
export const CONFIG = {
  PLATFORMS: {
    CIME: 'CIME',
    CHZZK: 'CHZZK'
  },
  API_BASE_URL: 'https://ci.me/api',
  LIVE_PAGE_URL: (slug, platform = 'CIME') => {
    if (platform === 'CHZZK') return `https://chzzk.naver.com/live/${slug}`;
    return `https://ci.me/@${slug}/live`;
  },
  CHANNEL_API_URL: (slug, platform = 'CIME') => {
    if (platform === 'CHZZK') return `https://api.chzzk.naver.com/service/v2/channels/${slug}/live-detail`;
    return `https://ci.me/api/app/channels/${slug}`;
  },
  DEFAULT_POLLING_INTERVAL: 0.5,
  MIN_INTERVAL: 0.25,
  MODES: {
    ONCE: 'ONCE',
    ALWAYS: 'ALWAYS',
    NOTIFY: 'NOTIFY'
  },
  STORAGE_KEYS: {
    STREAMERS: 'cime_streamers',
    HISTORY: 'cime_history',
    GLOBAL_MODE: 'cime_global_mode',
    INTERVAL: 'cime_interval'
  }
};
