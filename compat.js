/**
 * compat.js
 * Chrome/Firefox Extension API Compatibility Layer
 */
const browserAPI = globalThis.browser || globalThis.chrome;

// Export for module usage (if needed) or just expose to global scope
globalThis.cimeAPI = browserAPI;
