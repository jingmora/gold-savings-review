import test from "node:test";
import assert from "node:assert/strict";

import { STORAGE_KEY } from "../web/config.js";
import { createAppShellApi } from "../web/app-shell.js";

class FakeClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }

  add(...tokens) {
    tokens.forEach((token) => this.values.add(token));
  }

  remove(...tokens) {
    tokens.forEach((token) => this.values.delete(token));
  }

  toggle(token, force) {
    if (typeof force === "boolean") {
      if (force) {
        this.values.add(token);
        return true;
      }
      this.values.delete(token);
      return false;
    }

    if (this.values.has(token)) {
      this.values.delete(token);
      return false;
    }

    this.values.add(token);
    return true;
  }

  contains(token) {
    return this.values.has(token);
  }
}

function createStorageMock() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function createShellFixture() {
  const localStorage = createStorageMock();
  const originalLocalStorage = globalThis.localStorage;
  const originalDocument = globalThis.document;
  globalThis.localStorage = localStorage;
  globalThis.document = {
    body: {
      classList: new FakeClassList(),
    },
  };

  const elements = {
    historyDrawer: {
      classList: new FakeClassList(["is-hidden"]),
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
    },
    openHistory: {
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
    },
    ocrStatus: {
      textContent: "",
      classList: new FakeClassList(["is-hidden"]),
    },
    runtimeBridgeStatus: {
      textContent: "",
      classList: new FakeClassList(["is-hidden"]),
    },
  };

  const detailViewState = {
    sort: "time-desc",
    mode: "flat",
    onlyAnomalies: false,
  };
  const imageState = {
    items: [],
  };
  const marketState = {
    status: "idle",
    error: "",
    quote: {
      baseCnyPerGram: 800,
      baseUsdPerOz: 2500,
      exchangeRate: 7.2,
      updatedAt: "2026-03-30T08:00:00.000Z",
      providerUpdatedAt: "2026-03-30T08:00:00.000Z",
      polledAt: "2026-03-30T08:00:00.000Z",
    },
    buySpread: 0,
    sellSpread: 0,
  };
  const state = {
    currentBatchId: null,
    currentBatchName: "",
  };
  const workspaceState = {
    baseRows: [],
    batches: [],
    dirty: false,
  };

  let updateCount = 0;
  const api = createAppShellApi({
    detailViewState,
    elements,
    imageState,
    marketState,
    state,
    update() {
      updateCount += 1;
    },
    workspaceState,
    getDisplayRows() {
      return [{ time: "2026-03-20 10:00", direction: "buy", weight: "1", price: "700" }];
    },
  });

  function cleanup() {
    globalThis.localStorage = originalLocalStorage;
    globalThis.document = originalDocument;
  }

  return {
    api,
    cleanup,
    detailViewState,
    elements,
    imageState,
    localStorage,
    marketState,
    state,
    updateCount: () => updateCount,
    workspaceState,
  };
}

test("app shell persists and restores page preferences", () => {
  const fixture = createShellFixture();
  const {
    api,
    cleanup,
    detailViewState,
    localStorage,
    marketState,
  } = fixture;

  try {
    detailViewState.sort = "price-asc";
    detailViewState.mode = "by-image";
    detailViewState.onlyAnomalies = true;
    marketState.buySpread = 3.5;
    marketState.sellSpread = -1.2;

    api.saveState();

    detailViewState.sort = "time-desc";
    detailViewState.mode = "flat";
    detailViewState.onlyAnomalies = false;
    marketState.buySpread = 0;
    marketState.sellSpread = 0;

    api.loadState();

    assert.equal(localStorage.getItem(STORAGE_KEY) !== null, true);
    assert.equal(detailViewState.sort, "price-asc");
    assert.equal(detailViewState.mode, "by-image");
    assert.equal(detailViewState.onlyAnomalies, true);
    assert.equal(marketState.buySpread, 3.5);
    assert.equal(marketState.sellSpread, -1.2);
  } finally {
    cleanup();
  }
});

test("app shell updates drawer and status UI state", () => {
  const fixture = createShellFixture();
  const { api, cleanup, elements } = fixture;

  try {
    api.setHistoryDrawerOpen(true);
    assert.equal(elements.historyDrawer.classList.contains("is-hidden"), false);
    assert.equal(elements.openHistory.attributes["aria-expanded"], "true");
    assert.equal(globalThis.document.body.classList.contains("history-open"), true);

    api.setOcrStatus("识别进行中", "processing");
    assert.equal(elements.ocrStatus.textContent, "识别进行中");
    assert.equal(elements.ocrStatus.classList.contains("processing"), true);
    assert.equal(elements.ocrStatus.classList.contains("is-hidden"), false);

    api.setRuntimeBridgeStatus({ connected: false, reason: "expired" });
    assert.match(elements.runtimeBridgeStatus.textContent, /本地服务会话已过期/);
    assert.equal(elements.runtimeBridgeStatus.classList.contains("is-hidden"), false);
  } finally {
    cleanup();
  }
});

test("app shell rebuilds live quote with spreads and triggers update", () => {
  const fixture = createShellFixture();
  const { api, cleanup, marketState, updateCount } = fixture;

  try {
    api.setLivePriceSpreads({ buySpread: "2.5", sellSpread: "-1.5" });

    assert.equal(marketState.buySpread, 2.5);
    assert.equal(marketState.sellSpread, -1.5);
    assert.equal(marketState.quote.buyPriceCnyPerGram, 802.5);
    assert.equal(marketState.quote.sellPriceCnyPerGram, 798.5);
    assert.equal(updateCount(), 1);
  } finally {
    cleanup();
  }
});
