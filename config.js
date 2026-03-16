/**
 * config.js
 * Project configuration and constants
 */
export const CONFIG = {
  API_BASE_URL: 'https://ci.me/api',
  LIVE_PAGE_URL: (slug) => `https://ci.me/@${slug}/live`,
  CHANNEL_API_URL: (slug) => `https://ci.me/api/app/channels/${slug}`,
  DEFAULT_POLLING_INTERVAL: 0.5, // 30 seconds (Chrome alarms use minutes) - actually minimum is 1 min for non-unpacked extensions, but let's try.
  MIN_INTERVAL: 0.25, // 15 seconds
  MODES: {
    ONCE: 'ONCE',         // Open once per broadcast
    ALWAYS: 'ALWAYS',     // Always open (if tab closed)
    NOTIFY: 'NOTIFY'      // Only show notification
  },
  STORAGE_KEYS: {
    STREAMERS: 'cime_streamers',     // List of monitored streamers [{slug, name, mode}]
    HISTORY: 'cime_history',         // History of detected live status {slug: {liveId, lastStatus}}
    GLOBAL_MODE: 'cime_global_mode', // Default mode (ONCE, ALWAYS, NOTIFY)
    INTERVAL: 'cime_interval'        // Polling interval
  }
};
