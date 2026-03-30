import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { setDockVisibility } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";

const SNAPSHOT_EVENT = "desktop://batch-directory-snapshot";
const DEFAULT_REFRESH_INTERVAL_MS = 3_000;
const STORAGE_KEYS = {
  buySpread: "desktop-watch-panel.buy-spread",
  sellSpread: "desktop-watch-panel.sell-spread",
  compact: "desktop-watch-panel.compact",
};
const GOLD_API_BASE_URL = "https://api.gold-api.com/price/XAU";

const elements = {
  refreshButton: document.getElementById("refresh-button"),
  compactToggle: document.getElementById("compact-toggle"),
  sourceStatus: document.getElementById("source-status"),
  sourcePath: document.getElementById("source-path"),
  marketStatus: document.getElementById("market-status"),
  liveSellPrice: document.getElementById("live-sell-price"),
  liveSellPriceUsd: document.getElementById("live-sell-price-usd"),
  floatingProfit: document.getElementById("floating-profit"),
  holdingReturnRate: document.getElementById("holding-return-rate"),
  realizedProfit: document.getElementById("realized-profit"),
  totalReturnRate: document.getElementById("total-return-rate"),
  currentWeight: document.getElementById("current-weight"),
  currentCost: document.getElementById("current-cost"),
  batchSummary: document.getElementById("batch-summary"),
  rowSummary: document.getElementById("row-summary"),
  lastBatchUpdatedAt: document.getElementById("last-batch-updated-at"),
  lastQuoteUpdatedAt: document.getElementById("last-quote-updated-at"),
  issueCount: document.getElementById("issue-count"),
  issueList: document.getElementById("issue-list"),
  buySpreadInput: document.getElementById("buy-spread-input"),
  sellSpreadInput: document.getElementById("sell-spread-input"),
};

const state = {
  source: {
    snapshot: null,
    resolvedRows: [],
    merged: createEmptyMergedResult(),
    issues: [],
    stale: false,
  },
  market: {
    status: "idle",
    error: "",
    quote: null,
    baseQuote: null,
    refreshTimerId: null,
    refreshPromise: null,
  },
  settings: {
    buySpread: readStoredNumber(STORAGE_KEYS.buySpread),
    sellSpread: readStoredNumber(STORAGE_KEYS.sellSpread),
    compact: localStorage.getItem(STORAGE_KEYS.compact) === "1",
  },
};

function createEmptyMergedResult() {
  return {
    rows: [],
    validFileCount: 0,
    invalidFileCount: 0,
    batchCount: 0,
    rowCount: 0,
    latestBatchUpdatedAt: "",
  };
}

function readStoredNumber(key) {
  return Number.parseFloat(localStorage.getItem(key) || "") || 0;
}

function toNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trimTrailingZeros(value) {
  return String(value).replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "").replace(/\.$/u, "");
}

function formatCurrency(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function formatUnitPrice(value) {
  return `¥${Number(value || 0).toFixed(2)}/g`;
}

function formatWeight(value) {
  return `${Number(value || 0).toFixed(3)} g`;
}

function formatSignedCurrency(value) {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  return `${prefix}¥${Math.abs(numeric).toFixed(2)}`;
}

function formatSignedPercent(value, decimals = 2) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  const numeric = Number(value || 0) * 100;
  const prefix = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  return `${prefix}${Math.abs(numeric).toFixed(decimals)}%`;
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function formatUsdPerOunce(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "--";
  }

  return `USD ${value.toFixed(2)}/oz`;
}

function normalizeDirection(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "sell" || normalized === "卖出" || normalized === "委托卖出") {
    return "sell";
  }
  return "buy";
}

function sanitizeNumberText(value) {
  return String(value ?? "").replace(/,/g, "").replace(/[^0-9.]/g, "");
}

function parseNumericValue(value) {
  const parsed = Number.parseFloat(sanitizeNumberText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatExtractedNumber(value, decimals = 2) {
  return Number(value).toFixed(decimals).replace(/\.?0+$/, "");
}

function normalizeTimeValue(value) {
  const match = String(value ?? "").match(
    /(20\d{2})[-/.年]\s*(\d{1,2})[-/.月]\s*(\d{1,2})(?:[日号]?\s*(\d{1,2}:\d{2}))?/
  );
  if (!match) {
    return "";
  }

  const [, year, month, day, time = ""] = match;
  const normalizedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return time ? `${normalizedDate} ${time}` : normalizedDate;
}

function createStructuredRow({ time = "", direction = "buy", weight, price }) {
  const normalizedWeight = parseNumericValue(weight);
  const normalizedPrice = parseNumericValue(price);

  if (normalizedWeight <= 0 || normalizedPrice <= 0) {
    return null;
  }

  return {
    time: normalizeTimeValue(time),
    direction: normalizeDirection(direction),
    weight: formatExtractedNumber(normalizedWeight, 4),
    price: formatExtractedNumber(normalizedPrice, 2),
  };
}

function normalizeBatchRows(rows) {
  return (rows || [])
    .map((row) =>
      createStructuredRow({
        time: row?.time || "",
        direction: row?.direction || "buy",
        weight: row?.weight,
        price: row?.price,
      })
    )
    .filter(Boolean);
}

function parseImportedBatchPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.batches)) {
    return payload.batches;
  }

  throw new Error("JSON 文件格式不正确");
}

function calculatePortfolioMetrics(rows, { liveSellPrice = 0 } = {}) {
  let currentWeight = 0;
  let currentCost = 0;
  let cumulativeBuyAmount = 0;
  let realizedProfit = 0;

  const sortedRows = [...(rows || [])].sort((left, right) => {
    const leftTimestamp = Date.parse(left?.time || "");
    const rightTimestamp = Date.parse(right?.time || "");
    const leftValid = Number.isFinite(leftTimestamp);
    const rightValid = Number.isFinite(rightTimestamp);

    if (leftValid && rightValid && leftTimestamp !== rightTimestamp) {
      return leftTimestamp - rightTimestamp;
    }
    if (leftValid !== rightValid) {
      return leftValid ? -1 : 1;
    }
    return 0;
  });

  sortedRows.forEach((row) => {
    const weight = toNumber(row?.weight);
    const price = toNumber(row?.price);
    if (!weight || !price) {
      return;
    }

    const amount = weight * price;
    if (normalizeDirection(row?.direction) === "sell") {
      if (currentWeight <= 0) {
        return;
      }

      const matchedWeight = Math.min(weight, currentWeight);
      const averageCost = currentWeight > 0 ? currentCost / currentWeight : 0;
      const settledCost = averageCost * matchedWeight;
      realizedProfit += matchedWeight * price - settledCost;
      currentWeight -= matchedWeight;
      currentCost -= settledCost;

      if (currentWeight <= 1e-8) {
        currentWeight = 0;
        currentCost = 0;
      }
      return;
    }

    cumulativeBuyAmount += amount;
    currentWeight += weight;
    currentCost += amount;
  });

  const normalizedLiveSellPrice = toNumber(liveSellPrice);
  const hasLiveSellPrice = normalizedLiveSellPrice > 0;
  const floatingProfit =
    currentWeight > 0
      ? hasLiveSellPrice
        ? currentWeight * normalizedLiveSellPrice - currentCost
        : null
      : 0;
  const holdingReturnRate =
    currentCost > 0 ? (floatingProfit === null ? null : floatingProfit / currentCost) : 0;
  const totalProfit = floatingProfit === null ? null : realizedProfit + floatingProfit;
  const totalReturnRate =
    totalProfit === null ? null : cumulativeBuyAmount > 0 ? totalProfit / cumulativeBuyAmount : 0;

  return {
    currentWeight,
    currentCost,
    realizedProfit,
    floatingProfit,
    holdingReturnRate,
    totalReturnRate,
  };
}

function calculateTradeTotals(rows) {
  return (rows || []).reduce(
    (totals, row) => {
      const weight = toNumber(row?.weight);
      const price = toNumber(row?.price);
      const amount = weight * price;
      const direction = normalizeDirection(row?.direction);

      totals.count += 1;
      if (direction === "sell") {
        totals.sellWeight += weight;
        totals.sellAmount += amount;
      } else {
        totals.buyWeight += weight;
        totals.buyAmount += amount;
      }

      totals.buyAvgPrice = totals.buyWeight > 0 ? totals.buyAmount / totals.buyWeight : 0;
      totals.netWeight = totals.buyWeight - totals.sellWeight;

      return totals;
    },
    {
      count: 0,
      buyWeight: 0,
      sellWeight: 0,
      buyAmount: 0,
      sellAmount: 0,
      buyAvgPrice: 0,
      netWeight: 0,
    }
  );
}

function mergeBatchRecordFiles(files) {
  const rows = [];
  const invalidFiles = [];
  let validFileCount = 0;
  let batchCount = 0;
  let latestBatchUpdatedAt = "";

  (files || []).forEach((file) => {
    if (typeof file?.content !== "string") {
      invalidFiles.push({
        path: file?.path || "",
        error: file?.error || "文件内容不可用",
      });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(file.content);
    } catch (error) {
      invalidFiles.push({
        path: file.path || "",
        error: `JSON 解析失败：${error instanceof Error ? error.message : "文件内容不可解析"}`,
      });
      return;
    }

    let batches;
    try {
      batches = parseImportedBatchPayload(payload);
    } catch (error) {
      invalidFiles.push({
        path: file.path || "",
        error: error instanceof Error ? error.message : "JSON 文件格式不正确",
      });
      return;
    }

    validFileCount += 1;
    batchCount += batches.length;

    batches.forEach((batch) => {
      rows.push(...normalizeBatchRows(batch?.rows || []));
      const updatedAt = batch?.updatedAt || batch?.createdAt || payload?.exportedAt || "";
      if (!latestBatchUpdatedAt || Date.parse(updatedAt) > Date.parse(latestBatchUpdatedAt || "")) {
        latestBatchUpdatedAt = updatedAt;
      }
    });
  });

  return {
    rows,
    invalidFiles,
    validFileCount,
    invalidFileCount: invalidFiles.length,
    batchCount,
    rowCount: rows.length,
    latestBatchUpdatedAt,
  };
}

async function fetchQuote(currency) {
  const response = await fetch(`${GOLD_API_BASE_URL}/${currency}`);
  if (!response.ok) {
    throw new Error(`gold-api ${currency} 请求失败：${response.status}`);
  }
  return response.json();
}

function convertOuncePriceToGramPrice(pricePerOunce) {
  return toNumber(pricePerOunce) / 31.1034768;
}

function convertGramPriceToOuncePrice(pricePerGram) {
  return toNumber(pricePerGram) * 31.1034768;
}

function buildLiveQuote({
  baseCnyPerGram,
  baseUsdPerOz,
  exchangeRate,
  updatedAt,
  providerUpdatedAt,
  polledAt,
}) {
  const buyPriceCnyPerGram = toNumber(baseCnyPerGram) + state.settings.buySpread;
  const sellPriceCnyPerGram = toNumber(baseCnyPerGram) + state.settings.sellSpread;
  const normalizedExchangeRate = toNumber(exchangeRate);
  const resolvedPolledAt = polledAt || updatedAt || "";
  const resolvedProviderUpdatedAt = providerUpdatedAt || updatedAt || "";

  return {
    buyPriceCnyPerGram,
    sellPriceCnyPerGram,
    buyPriceUsdPerOz:
      normalizedExchangeRate > 0
        ? convertGramPriceToOuncePrice(buyPriceCnyPerGram) / normalizedExchangeRate
        : toNumber(baseUsdPerOz),
    sellPriceUsdPerOz:
      normalizedExchangeRate > 0
        ? convertGramPriceToOuncePrice(sellPriceCnyPerGram) / normalizedExchangeRate
        : toNumber(baseUsdPerOz),
    baseCnyPerGram: toNumber(baseCnyPerGram),
    baseUsdPerOz: toNumber(baseUsdPerOz),
    exchangeRate: normalizedExchangeRate,
    updatedAt: resolvedPolledAt,
    providerUpdatedAt: resolvedProviderUpdatedAt,
    polledAt: resolvedPolledAt,
  };
}

function setSignedMetric(node, value, formatter) {
  node.classList.remove("is-positive", "is-negative");
  if (!Number.isFinite(value)) {
    node.textContent = "--";
    return;
  }

  node.textContent = formatter(value);
  if (value > 0) {
    node.classList.add("is-positive");
  } else if (value < 0) {
    node.classList.add("is-negative");
  }
}

function applyDirectorySnapshot(snapshot) {
  const merged = mergeBatchRecordFiles(snapshot?.files || []);
  const readErrors = (snapshot?.readErrors || []).map((entry) => ({
    path: entry?.path || "",
    error: entry?.error || "文件读取失败",
  }));
  const issues = [...readErrors, ...merged.invalidFiles];
  const hasFreshRows = merged.rows.length > 0;

  state.source.snapshot = snapshot;
  state.source.issues = issues;
  state.source.merged = merged;

  if (hasFreshRows || !state.source.resolvedRows.length) {
    state.source.resolvedRows = merged.rows;
    state.source.stale = false;
  } else if (issues.length) {
    state.source.stale = true;
  } else {
    state.source.resolvedRows = [];
    state.source.stale = false;
  }

  render();
}

function rebuildLiveQuoteWithSpreads() {
  if (!state.market.baseQuote) {
    return;
  }

  state.market.quote = buildLiveQuote(state.market.baseQuote);
}

async function refreshLivePrice() {
  if (state.market.refreshPromise) {
    return state.market.refreshPromise;
  }

  state.market.status = state.market.quote ? "refreshing" : "loading";
  state.market.error = "";
  render();

  state.market.refreshPromise = Promise.all([fetchQuote("CNY"), fetchQuote("USD")])
    .then(([cnyQuote, usdQuote]) => {
      const polledAt = new Date().toISOString();
      state.market.baseQuote = {
        baseCnyPerGram: convertOuncePriceToGramPrice(cnyQuote.price),
        baseUsdPerOz: toNumber(usdQuote.price),
        exchangeRate: toNumber(cnyQuote.exchangeRate),
        updatedAt: polledAt,
        providerUpdatedAt: cnyQuote.updatedAt || usdQuote.updatedAt || "",
        polledAt,
      };
      rebuildLiveQuoteWithSpreads();
      state.market.status = "ready";
      state.market.error = "";
    })
    .catch((error) => {
      state.market.status = "error";
      state.market.error = error instanceof Error ? error.message : "行情加载失败";
    })
    .finally(() => {
      state.market.refreshPromise = null;
      render();
    });

  return state.market.refreshPromise;
}

function startLivePricePolling() {
  if (state.market.refreshTimerId) {
    clearInterval(state.market.refreshTimerId);
  }

  void refreshLivePrice();
  state.market.refreshTimerId = window.setInterval(() => {
    void refreshLivePrice();
  }, DEFAULT_REFRESH_INTERVAL_MS);
}

function renderSourceStatus() {
  const snapshot = state.source.snapshot;
  const merged = state.source.merged;

  elements.sourcePath.textContent = snapshot?.dataDir || "--";

  if (!snapshot) {
    elements.sourceStatus.textContent = "正在连接本地批次目录…";
    return;
  }

  if (state.source.stale) {
    elements.sourceStatus.textContent = `目录中存在异常文件，当前沿用上次有效结果 · ${merged.validFileCount} 个有效文件`;
    return;
  }

  if (!merged.validFileCount && !state.source.issues.length) {
    elements.sourceStatus.textContent = "已监听目录，等待首批批次 JSON";
    return;
  }

  if (state.source.issues.length) {
    elements.sourceStatus.textContent = `已读取 ${merged.validFileCount} 个有效文件，另有 ${state.source.issues.length} 个异常项`;
    return;
  }

  elements.sourceStatus.textContent = `已读取 ${merged.validFileCount} 个文件 · ${merged.batchCount} 个批次 · ${merged.rowCount} 条成交`;
}

function renderMarketStatus() {
  if (state.market.status === "error") {
    elements.marketStatus.textContent = state.market.error || "实时行情暂不可用";
    return;
  }

  if (!state.market.quote) {
    elements.marketStatus.textContent = state.market.status === "loading" ? "行情加载中…" : "暂无实时行情";
    return;
  }

  const updatedAt = state.market.quote.polledAt ? formatDateTime(state.market.quote.polledAt) : "--";
  const statusParts = [`本地刷新 ${updatedAt}`];
  elements.marketStatus.textContent =
    state.market.status === "refreshing"
      ? `行情更新中 · ${statusParts.join(" · ")}`
      : statusParts.join(" · ");
}

function renderIssues() {
  elements.issueList.innerHTML = "";
  elements.issueCount.textContent = String(state.source.issues.length);

  if (!state.source.issues.length) {
    const item = document.createElement("li");
    item.textContent = "当前没有异常文件，目录监听正常。";
    elements.issueList.appendChild(item);
    return;
  }

  state.source.issues.forEach((issue) => {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = issue.path.split("/").pop() || issue.path || "未知文件";
    const detail = document.createElement("span");
    detail.textContent = issue.error;
    item.appendChild(title);
    item.appendChild(detail);
    elements.issueList.appendChild(item);
  });
}

function render() {
  document.body.classList.toggle("is-compact", state.settings.compact);

  elements.buySpreadInput.value = trimTrailingZeros(state.settings.buySpread.toFixed(2));
  elements.sellSpreadInput.value = trimTrailingZeros(state.settings.sellSpread.toFixed(2));
  elements.compactToggle.textContent = state.settings.compact ? "展开面板" : "紧凑模式";

  renderSourceStatus();
  renderMarketStatus();
  renderIssues();

  const rows = state.source.resolvedRows;
  const totals = calculateTradeTotals(rows);
  const portfolio = calculatePortfolioMetrics(rows, {
    liveSellPrice: state.market.quote?.sellPriceCnyPerGram ?? 0,
  });

  elements.liveSellPrice.textContent = state.market.quote
    ? formatUnitPrice(state.market.quote.sellPriceCnyPerGram)
    : "--";
  elements.liveSellPriceUsd.textContent = state.market.quote
    ? formatUsdPerOunce(state.market.quote.sellPriceUsdPerOz)
    : "--";
  setSignedMetric(elements.floatingProfit, portfolio.floatingProfit, formatSignedCurrency);
  setSignedMetric(elements.holdingReturnRate, portfolio.holdingReturnRate, formatSignedPercent);
  setSignedMetric(elements.realizedProfit, portfolio.realizedProfit, formatSignedCurrency);
  setSignedMetric(elements.totalReturnRate, portfolio.totalReturnRate, formatSignedPercent);
  elements.currentWeight.textContent = formatWeight(portfolio.currentWeight);
  elements.currentCost.textContent = formatCurrency(portfolio.currentCost);
  elements.batchSummary.textContent = `${state.source.merged.batchCount} 个批次`;
  elements.rowSummary.textContent = `${totals.count} 条记录 · 买入均价 ${formatUnitPrice(totals.buyAvgPrice)}`;
  elements.lastBatchUpdatedAt.textContent = formatDateTime(state.source.merged.latestBatchUpdatedAt);
  elements.lastQuoteUpdatedAt.textContent = state.market.quote
    ? state.market.quote.providerUpdatedAt
      ? `本地 ${formatDateTime(state.market.quote.polledAt)} · 源 ${formatDateTime(
          state.market.quote.providerUpdatedAt
        )}`
      : `本地 ${formatDateTime(state.market.quote.polledAt)}`
    : "--";
}

async function initializeWindowBehavior() {
  const appWindow = getCurrentWindow();

  await appWindow.onFocusChanged(({ payload }) => {
    if (payload === false) {
      void appWindow.hide();
    }
  });

  await appWindow.onCloseRequested((event) => {
    event.preventDefault();
    void appWindow.hide();
  });
}

async function initializeDesktopBridge() {
  await listen(SNAPSHOT_EVENT, ({ payload }) => {
    applyDirectorySnapshot(payload);
  });

  const snapshot = await invoke("get_batch_directory_snapshot");
  applyDirectorySnapshot(snapshot);
}

function bindEvents() {
  elements.refreshButton.addEventListener("click", () => {
    void Promise.all([invoke("refresh_batch_directory_snapshot"), refreshLivePrice()]);
  });

  elements.compactToggle.addEventListener("click", () => {
    state.settings.compact = !state.settings.compact;
    localStorage.setItem(STORAGE_KEYS.compact, state.settings.compact ? "1" : "0");
    render();
  });

  elements.buySpreadInput.addEventListener("input", () => {
    state.settings.buySpread = Number.parseFloat(elements.buySpreadInput.value) || 0;
    localStorage.setItem(STORAGE_KEYS.buySpread, String(state.settings.buySpread));
    rebuildLiveQuoteWithSpreads();
    render();
  });

  elements.sellSpreadInput.addEventListener("input", () => {
    state.settings.sellSpread = Number.parseFloat(elements.sellSpreadInput.value) || 0;
    localStorage.setItem(STORAGE_KEYS.sellSpread, String(state.settings.sellSpread));
    rebuildLiveQuoteWithSpreads();
    render();
  });
}

async function main() {
  bindEvents();
  render();

  try {
    await setDockVisibility(false);
  } catch {
    // 非 macOS 平台或当前运行时不支持时忽略。
  }

  await initializeWindowBehavior();
  await initializeDesktopBridge();
  startLivePricePolling();
}

void main();
