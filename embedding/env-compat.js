// lore environment compatibility
// Provides one safe surface for userscript globals, synchronous key/value storage, and persistence diagnostics.
(function () {
  'use strict';
  const hostWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  if (hostWindow.__LoreEnv && hostWindow.__LoreEnv.__loaded) return;

  const pageStorage = (() => {
    try { return hostWindow.localStorage || window.localStorage || null; } catch (_) { return null; }
  })();
  const hasSyncGmStorage = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  const hasSyncGmDelete = typeof GM_deleteValue === 'function';

  function gmKey(key) {
    return 'lore:' + String(key || '');
  }

  const kv = {
    mode: hasSyncGmStorage ? 'gm' : 'localStorage',
    getItem(key) {
      try {
        if (hasSyncGmStorage) {
          const value = GM_getValue(gmKey(key), null);
          if (value != null) return String(value);
          const legacy = pageStorage ? pageStorage.getItem(key) : null;
          if (legacy != null) {
            try { GM_setValue(gmKey(key), String(legacy)); } catch (_) {}
            return String(legacy);
          }
          return null;
        }
      } catch (_) {}
      try { return pageStorage ? pageStorage.getItem(key) : null; } catch (_) { return null; }
    },
    setItem(key, value) {
      const text = String(value);
      let saved = false;
      try {
        if (hasSyncGmStorage) {
          GM_setValue(gmKey(key), text);
          saved = true;
        }
      } catch (_) {}
      try {
        if (pageStorage) {
          pageStorage.setItem(key, text);
          saved = true;
        }
      } catch (_) {}
      return saved;
    },
    removeItem(key) {
      let removed = false;
      try {
        if (hasSyncGmStorage && hasSyncGmDelete) {
          GM_deleteValue(gmKey(key));
          removed = true;
        }
      } catch (_) {}
      try {
        if (pageStorage) {
          pageStorage.removeItem(key);
          removed = true;
        }
      } catch (_) {}
      return removed;
    }
  };

  const diagnostics = {
    storageMode: kv.mode,
    localStorageAvailable: !!pageStorage,
    gmStorageAvailable: hasSyncGmStorage,
    persisted: null,
    persistRequested: false,
    persistError: ''
  };

  async function requestPersistentStorage() {
    try {
      const storage = navigator && navigator.storage;
      if (!storage || typeof storage.persisted !== 'function') return diagnostics;
      diagnostics.persisted = await storage.persisted();
      if (!diagnostics.persisted && typeof storage.persist === 'function') {
        diagnostics.persistRequested = true;
        diagnostics.persisted = await storage.persist();
      }
    } catch (e) {
      diagnostics.persistError = e && e.message ? e.message : String(e);
    }
    return diagnostics;
  }

  hostWindow.__LoreEnv = {
    __loaded: true,
    window: hostWindow,
    kv,
    diagnostics,
    requestPersistentStorage
  };

  requestPersistentStorage();
  console.log('[LoreEnv] loaded', diagnostics.storageMode);
})();
