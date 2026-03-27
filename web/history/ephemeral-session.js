import { DB_NAME } from "../config.js";

const ACTIVE_TABS_KEY = "gold-savings-review-active-tabs";
const CLEAR_PENDING_KEY = "gold-savings-review-history-clear-pending";
const CLEAR_NOTICE_KEY = "gold-savings-review-history-clear-notice";
const TAB_ID_KEY = "gold-savings-review-tab-id";
const TAB_HEARTBEAT_MS = 10000;
const TAB_STALE_MS = 30000;
const LEGACY_DB_NAMES = ["gold-batch-calculator-db"];
const LEGACY_LOCAL_KEYS = [
  "gold-batch-calculator-state",
  "gold-batch-calculator-active-tabs",
  "gold-batch-calculator-history-clear-pending",
  "gold-batch-calculator-history-clear-notice",
  "gold-batch-calculator-tab-id",
];

function randomId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function removeLocalKey(key) {
  window.localStorage.removeItem(key);
}

function getTabId() {
  let tabId = window.sessionStorage.getItem(TAB_ID_KEY);
  if (!tabId) {
    tabId = randomId();
    window.sessionStorage.setItem(TAB_ID_KEY, tabId);
  }
  return tabId;
}

function pruneTabs(registry) {
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(registry || {}).filter(([, timestamp]) => now - Number(timestamp || 0) < TAB_STALE_MS)
  );
}

function readActiveTabs() {
  return pruneTabs(readJson(ACTIVE_TABS_KEY, {}));
}

function writeActiveTabs(registry) {
  const nextRegistry = pruneTabs(registry);
  if (!Object.keys(nextRegistry).length) {
    removeLocalKey(ACTIVE_TABS_KEY);
    return;
  }
  writeJson(ACTIVE_TABS_KEY, nextRegistry);
}

function deleteDatabaseByName(name) {
  if (!window.indexedDB) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const request = window.indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
  });
}

function deleteBatchDatabase() {
  return deleteDatabaseByName(DB_NAME);
}

export async function cleanupLegacyBrowserStorage() {
  const removed = {
    databases: [],
    localKeys: [],
  };

  for (const key of LEGACY_LOCAL_KEYS) {
    if (window.localStorage.getItem(key) === null && window.sessionStorage.getItem(key) === null) {
      continue;
    }
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
    removed.localKeys.push(key);
  }

  for (const dbName of LEGACY_DB_NAMES) {
    const deleted = await deleteDatabaseByName(dbName);
    if (deleted) {
      removed.databases.push(dbName);
    }
  }

  return removed;
}

export async function prepareEphemeralHistorySession() {
  const tabId = getTabId();
  const pending = readJson(CLEAR_PENDING_KEY, null);
  const activeTabs = readActiveTabs();
  let clearedOnLoad = false;

  if (pending?.tabId === tabId) {
    removeLocalKey(CLEAR_PENDING_KEY);
  } else if (pending && !Object.keys(activeTabs).length) {
    clearedOnLoad = await deleteBatchDatabase();
    removeLocalKey(CLEAR_PENDING_KEY);
    if (clearedOnLoad) {
      writeJson(CLEAR_NOTICE_KEY, { clearedAt: new Date().toISOString() });
    }
  }

  const notice = readJson(CLEAR_NOTICE_KEY, null);
  if (notice) {
    removeLocalKey(CLEAR_NOTICE_KEY);
  }

  return {
    clearedOnLoad,
    notice,
    tabId,
  };
}

export function attachEphemeralHistoryLifecycle({ hasDataToProtect, onExitCleanupScheduled } = {}) {
  const tabId = getTabId();
  let heartbeatTimer = 0;
  let isClosed = false;

  const touchTab = () => {
    const activeTabs = readActiveTabs();
    activeTabs[tabId] = Date.now();
    writeActiveTabs(activeTabs);
  };

  const unregisterTab = () => {
    const activeTabs = readActiveTabs();
    delete activeTabs[tabId];
    writeActiveTabs(activeTabs);
    return activeTabs;
  };

  const scheduleCleanupIfNeeded = () => {
    if (!hasDataToProtect?.()) {
      removeLocalKey(CLEAR_PENDING_KEY);
      return;
    }

    const activeTabs = unregisterTab();
    if (Object.keys(activeTabs).length) {
      return;
    }

    writeJson(CLEAR_PENDING_KEY, {
      tabId,
      scheduledAt: new Date().toISOString(),
    });
    onExitCleanupScheduled?.();
  };

  const beforeUnload = (event) => {
    if (!hasDataToProtect?.()) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  };

  const pageHide = () => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    if (heartbeatTimer) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = 0;
    }
    window.removeEventListener("beforeunload", beforeUnload);
    window.removeEventListener("pagehide", pageHide);
    scheduleCleanupIfNeeded();
  };

  touchTab();
  heartbeatTimer = window.setInterval(touchTab, TAB_HEARTBEAT_MS);
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("pagehide", pageHide);

  return () => {
    pageHide();
  };
}
