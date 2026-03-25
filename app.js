const STORAGE_KEY = "gold-batch-calculator-state";
const DB_NAME = "gold-batch-calculator-db";
const DB_VERSION = 1;
const BATCH_STORE = "batches";
const LOCAL_OCR_SERVICE_URL = "http://127.0.0.1:8765";
const LOCAL_OCR_SERVICE_TIMEOUT_MS = 20000;

const STATUS_LABELS = {
  queued: "待识别",
  processing: "识别中",
  done: "完成",
  error: "复查",
};

const DIRECTION_LABELS = {
  buy: "委托买入",
  sell: "委托卖出",
};

const state = {
  currentBatchId: null,
  currentBatchName: "未命名批次",
  currentBatchCreatedAt: "",
  currentBatchUpdatedAt: "",
};

const imageState = {
  items: [],
  processing: false,
};

const workspaceState = {
  baseRows: [],
  batches: [],
  db: null,
  dirty: false,
};

const chartState = {
  instances: {},
};

const ocrEngineState = {
  checked: false,
  available: false,
  mode: "",
};

const detailViewState = {
  sort: "time-desc",
  mode: "flat",
  onlyAnomalies: false,
  editingKey: null,
  editingField: null,
};

const elements = {
  imageInput: document.getElementById("image-input"),
  imageDropzone: document.getElementById("image-dropzone"),
  recognizeImage: document.getElementById("recognize-image"),
  clearImage: document.getElementById("clear-image"),
  openHistory: document.getElementById("open-history"),
  historyDrawer: document.getElementById("history-drawer"),
  importBatchFile: document.getElementById("import-batch-file"),
  exportBatches: document.getElementById("export-batches"),
  importBatches: document.getElementById("import-batches"),
  imagePreview: document.getElementById("image-preview"),
  queueTotalImages: document.getElementById("queue-total-images"),
  queueDoneImages: document.getElementById("queue-done-images"),
  queueExtractedRows: document.getElementById("queue-extracted-rows"),
  ocrStatus: document.getElementById("ocr-status"),
  lightbox: document.getElementById("image-lightbox"),
  lightboxImage: document.getElementById("lightbox-image"),
  workspaceTitle: document.getElementById("workspace-title"),
  workspaceRecordCopy: document.getElementById("workspace-record-copy"),
  batchMetaCopy: document.getElementById("batch-meta-copy"),
  workspaceSaveBatch: document.getElementById("workspace-save-batch"),
  workspaceSaveAsBatch: document.getElementById("workspace-save-as-batch"),
  newBatch: document.getElementById("new-batch"),
  saveBatch: document.getElementById("save-batch"),
  batchLibrary: document.getElementById("batch-library"),
  detailOnlyAnomalies: document.getElementById("detail-only-anomalies"),
  detailSortTime: document.getElementById("detail-sort-time"),
  detailSortWeight: document.getElementById("detail-sort-weight"),
  detailSortPrice: document.getElementById("detail-sort-price"),
  detailSortIndicatorTime: document.getElementById("detail-sort-indicator-time"),
  detailSortIndicatorWeight: document.getElementById("detail-sort-indicator-weight"),
  detailSortIndicatorPrice: document.getElementById("detail-sort-indicator-price"),
  detailViewFlat: document.getElementById("detail-view-flat"),
  detailViewByImage: document.getElementById("detail-view-by-image"),
  parsedAmountHead: document.getElementById("parsed-amount-head"),
  parsedSheetBody: document.getElementById("parsed-sheet-body"),
  parsedSheetFoot: document.getElementById("parsed-sheet-foot"),
  summaryBuyAvg: document.getElementById("summary-buy-avg"),
  summarySellAvg: document.getElementById("summary-sell-avg"),
  summaryBuyWeight: document.getElementById("summary-buy-weight"),
  summarySellWeight: document.getElementById("summary-sell-weight"),
  summaryBuyAmount: document.getElementById("summary-buy-amount"),
  summarySellAmount: document.getElementById("summary-sell-amount"),
  reviewSheetBody: document.getElementById("review-sheet-body"),
  reviewSheetFoot: document.getElementById("review-sheet-foot"),
  chartAmount: document.getElementById("chart-amount"),
  chartAverage: document.getElementById("chart-average"),
  chartWeight: document.getElementById("chart-weight"),
  chartDistribution: document.getElementById("chart-distribution"),
};

function toNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function formatWeight(value) {
  return `${Number(value || 0).toFixed(3)} g`;
}

function formatUnitPrice(value) {
  return `¥${Number(value || 0).toFixed(2)}/g`;
}

function formatSignedWeight(value) {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  return `${prefix}${Math.abs(numeric).toFixed(3)} g`;
}

function formatSignedCurrency(value) {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  return `${prefix}¥${Math.abs(numeric).toFixed(2)}`;
}

function trimTrailingZeros(value) {
  return String(value).replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "").replace(/\.$/u, "");
}

function formatSignedPlain(value, decimals = 2) {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  return `${prefix}${Math.abs(numeric).toFixed(decimals)}`;
}

function formatSignedPlainCompact(value, decimals = 2) {
  return trimTrailingZeros(formatSignedPlain(value, decimals));
}

function formatPlainCompact(value, decimals = 2) {
  return trimTrailingZeros(Number(value || 0).toFixed(decimals));
}

function formatAbsolutePlainCompact(value, decimals = 2) {
  return trimTrailingZeros(Math.abs(Number(value || 0)).toFixed(decimals));
}

function getSignedWeightValue(row) {
  const weight = toNumber(row.weight);
  return normalizeDirection(row.direction) === "sell" ? -weight : weight;
}

function getSignedAmountValue(row) {
  const weight = toNumber(row.weight);
  const price = toNumber(row.price);
  const amount = weight * price;
  return normalizeDirection(row.direction) === "sell" ? amount : -amount;
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDay(value) {
  if (!value) {
    return "未识别时间";
  }

  return String(value).slice(0, 10);
}

function sanitizeFileName(value) {
  return String(value || "交易复盘")
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim();
}

function cloneRows(rows) {
  return (rows || []).map((row) => ({
    time: row.time || "",
    direction: normalizeDirection(row.direction),
    weight: String(row.weight || ""),
    price: String(row.price || ""),
  }));
}

function createRowKey(row) {
  return [row.time || "", row.direction || "buy", row.weight || "", row.price || ""].join("|");
}

function createBatchId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `batch-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function defaultBatchName() {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `${date} 统计批次`;
}

function defaultDuplicateBatchName(sourceName = "") {
  const normalized = String(sourceName || "").trim();
  return normalized ? `${normalized} 副本` : defaultBatchName();
}

function normalizeLegacyBatchName(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})\s+(买入|卖出)批次$/);
  if (!match) {
    return value;
  }

  return `${match[1]} 统计批次`;
}

function getSuggestedBatchName() {
  const value = String(state.currentBatchName || "").trim();
  const nextName = value || defaultBatchName();
  state.currentBatchName = nextName;
  return nextName;
}

function promptBatchName(initialValue = getSuggestedBatchName()) {
  const nextName = window.prompt("输入批次名称", initialValue);
  if (nextName === null) {
    return null;
  }

  const trimmed = nextName.trim();
  if (!trimmed) {
    setOcrStatus("批次名称不能为空", "error");
    return "";
  }

  state.currentBatchName = trimmed;
  saveState();
  return trimmed;
}

function getSaveBatchButtonLabel() {
  if (state.currentBatchId) {
    return "更新当前批次";
  }

  return "保存为批次";
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      currentBatchName: state.currentBatchName,
      detailSort: detailViewState.sort,
      detailViewMode: detailViewState.mode,
      detailOnlyAnomalies: detailViewState.onlyAnomalies,
    })
  );
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state.currentBatchName = defaultBatchName();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.currentBatchId = null;
    state.currentBatchName = normalizeLegacyBatchName(parsed.currentBatchName) || defaultBatchName();
    detailViewState.sort = parsed.detailSort || "time-desc";
    detailViewState.mode = parsed.detailViewMode || "flat";
    detailViewState.onlyAnomalies = Boolean(parsed.detailOnlyAnomalies);
  } catch {
    state.currentBatchId = null;
    state.currentBatchName = defaultBatchName();
    detailViewState.sort = "time-desc";
    detailViewState.mode = "flat";
    detailViewState.onlyAnomalies = false;
  }
}

function markWorkspaceDirty() {
  workspaceState.dirty = true;
}

function isHistoryDrawerOpen() {
  return !elements.historyDrawer.classList.contains("is-hidden");
}

function setHistoryDrawerOpen(isOpen) {
  elements.historyDrawer.classList.toggle("is-hidden", !isOpen);
  elements.historyDrawer.setAttribute("aria-hidden", String(!isOpen));
  elements.openHistory?.setAttribute("aria-expanded", String(isOpen));
  document.body.classList.toggle("history-open", isOpen);
}

function normalizeDigits(text) {
  return text
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 65248))
    .replace(/[，、；｜]/g, ",")
    .replace(/[。．·・]/g, ".")
    .replace(/[：]/g, ":")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")");
}

// 调试工具：显示OCR识别的原始文本
function debugShowOcrText() {
  const rows = getDisplayRows();
  const imageStateText = imageState.items.map(item => 
    `[${item.status}] ${item.file?.name || 'unknown'}: ${item.error || 'OK'}`
  ).join('\n');
  
  const debugInfo = `
=== OCR 调试信息 ===
当前工作区: ${state.currentBatchName}
截图队列: ${imageState.items.length} 张
识别结果: ${rows.length} 笔交易

截图状态:
${imageStateText}

当前交易数据 (前10笔):
${rows.slice(0, 10).map(row => 
  `  ${row.time || '无时间'} ${row.direction === 'sell' ? '卖出' : '买入'} ${row.weight}g @ ¥${row.price}`
).join('\n')}

=== 调试提示 ===
1. 打开浏览器开发者工具 (F12) 查看 console 输出
2. 识别失败时会有详细的警告信息
3. 可以检查网络面板确认OCR组件加载情况
  `;
  
  alert(debugInfo);
  console.log(debugInfo);
}

function sanitizeNumberText(value) {
  // 移除千位分隔符逗号，保留小数点
  return String(value ?? "").replace(/,/g, "").replace(/[^0-9.]/g, "");
}

function parseNumericValue(value) {
  const parsed = Number.parseFloat(sanitizeNumberText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatExtractedNumber(value, decimals = 2) {
  return Number(value).toFixed(decimals).replace(/\.?0+$/, "");
}

function roundNumericValue(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(Number(value || 0) * factor) / factor;
}

function reconcileTradeValues({ weight = 0, price = 0, amount = 0 }) {
  let nextWeight = toNumber(weight);
  let nextPrice = toNumber(price);
  const nextAmount = toNumber(amount);

  if (nextAmount > 0 && nextWeight > 0) {
    const reconstructedPrice = roundNumericValue(nextAmount / nextWeight, 2);
    const currentAmountGap = nextPrice > 0 ? Math.abs(nextAmount - nextWeight * nextPrice) : Number.POSITIVE_INFINITY;
    const reconstructedAmountGap = Math.abs(nextAmount - nextWeight * reconstructedPrice);

    // Correct common OCR off-by-0.01 price errors when amount and weight are otherwise consistent.
    if (!nextPrice || (Math.abs(nextPrice - reconstructedPrice) <= 0.02 && reconstructedAmountGap + 0.005 < currentAmountGap)) {
      nextPrice = reconstructedPrice;
    }
  }

  if (nextAmount > 0 && nextPrice > 0) {
    const reconstructedWeight = roundNumericValue(nextAmount / nextPrice, 4);
    const currentAmountGap = nextWeight > 0 ? Math.abs(nextAmount - nextWeight * nextPrice) : Number.POSITIVE_INFINITY;
    const reconstructedAmountGap = Math.abs(nextAmount - reconstructedWeight * nextPrice);

    if (!nextWeight || (Math.abs(nextWeight - reconstructedWeight) <= 0.0002 && reconstructedAmountGap + 0.005 < currentAmountGap)) {
      nextWeight = reconstructedWeight;
    }
  }

  return {
    weight: nextWeight,
    price: nextPrice,
  };
}

function normalizeExtractedPriceValue(value) {
  const numeric = roundNumericValue(value, 2);
  const nearestInteger = Math.round(numeric);

  // Bank trade price OCR frequently misreads trailing ".00" as ".99" or ".01".
  if (Math.abs(numeric - nearestInteger) <= 0.011) {
    return nearestInteger;
  }

  return numeric;
}

function normalizeDirection(value) {
  return value === "sell" ? "sell" : "buy";
}

function getDirectionLabel(value) {
  return DIRECTION_LABELS[normalizeDirection(value)];
}

function extractDirectionFromText(text) {
  const normalized = normalizeOcrText(text);
  if (/委托卖出/.test(normalized)) {
    return "sell";
  }
  if (/委托买入/.test(normalized)) {
    return "buy";
  }
  return "";
}

function setOcrStatus(message, type = "default") {
  elements.ocrStatus.textContent = message;
  elements.ocrStatus.classList.remove("processing", "error");
  elements.ocrStatus.classList.toggle(
    "is-hidden",
    !message || (type === "default" && message === "等待导入截图")
  );
  if (type === "processing") {
    elements.ocrStatus.classList.add("processing");
  }
  if (type === "error") {
    elements.ocrStatus.classList.add("error");
  }
}

function normalizeOcrText(text) {
  return normalizeDigits(text)
    .replace(/\r/g, "\n")
    .replace(/[¥￥Y]/g, "¥")
    .replace(/委托买人/g, "委托买入")
    .replace(/委托卖山/g, "委托卖出")
    .replace(/过期失校/g, "过期失效")
    .replace(/过期失笑/g, "过期失效")
    .replace(/已失校/g, "已失效")
    .replace(/克教/g, "克数")
    .replace(/克效/g, "克数")
    .replace(/成父价/g, "成交价")
    .replace(/戌交价/g, "成交价")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n");
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

function extractTimeFromText(text) {
  return normalizeTimeValue(normalizeOcrText(text));
}

function findNearestTime(lines, index) {
  for (let offset = -2; offset <= 2; offset += 1) {
    const target = lines[index + offset];
    if (!target) {
      continue;
    }

    const time = extractTimeFromText(target);
    if (time) {
      return time;
    }
  }

  return "";
}

function findNearestDirection(lines, index) {
  for (let offset = -2; offset <= 2; offset += 1) {
    const target = lines[index + offset];
    if (!target) {
      continue;
    }

    const direction = extractDirectionFromText(target);
    if (direction) {
      return direction;
    }
  }

  return "buy";
}

function createStructuredRow({ time = "", direction = "buy", weight, price }) {
  const normalizedWeight = toNumber(weight);
  const normalizedPrice = normalizeExtractedPriceValue(price);

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

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    release() {
      window.clearTimeout(timer);
    },
  };
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = LOCAL_OCR_SERVICE_TIMEOUT_MS) {
  const timeout = createTimeoutSignal(timeoutMs);

  try {
    const response = await window.fetch(url, {
      ...options,
      signal: timeout.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `请求失败（${response.status}）`);
    }
    return payload;
  } finally {
    timeout.release();
  }
}

async function detectOcrEngine(force = false) {
  if (ocrEngineState.checked && !force) {
    return ocrEngineState;
  }

  try {
    const payload = await fetchJsonWithTimeout(`${LOCAL_OCR_SERVICE_URL}/health`, {}, 1500);
    ocrEngineState.checked = true;
    ocrEngineState.available = Boolean(payload?.ok);
    ocrEngineState.mode = payload?.engine || "python";
    return ocrEngineState;
  } catch {
    ocrEngineState.checked = true;
    ocrEngineState.available = false;
    ocrEngineState.mode = "";
    return ocrEngineState;
  }
}

function adaptStructuredTradeRecord(record) {
  if (!record || record.record_type !== "gold_trade") {
    return null;
  }

  const fields = record.fields || {};
  const tradeAction = fields.trade_action === "sell" ? "sell" : "buy";
  const weight = toNumber(fields.weight_g);
  const price = toNumber(fields.deal_price_cny);

  if (weight <= 0 || price <= 0) {
    return null;
  }

  return {
    time: normalizeTimeValue(fields.trade_date),
    direction: tradeAction,
    weight: formatExtractedNumber(weight, 4),
    price: formatExtractedNumber(price, 2),
  };
}

function adaptStructuredTradeRecords(records) {
  return (records || []).map(adaptStructuredTradeRecord).filter(Boolean);
}

function countSkippedReviewRecords(reviewRecords) {
  return (reviewRecords || []).filter((record) => {
    const category = String(record?.category || "").trim().toLowerCase();
    return category === "skipped" || record?.reason === "excluded_entry";
  }).length;
}

function parseExplicitCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function createStructuredResultFromTradeRecords(records, reviewRecords = [], rawText = "", counts = null) {
  const rows = adaptStructuredTradeRecords(records);
  const explicitSkippedCount = parseExplicitCount(counts?.skipped_entries);
  return {
    rows,
    text: serializeStructuredRows(rows),
    extractedCount: rows.length,
    skippedCount: explicitSkippedCount ?? countSkippedReviewRecords(reviewRecords),
    parser: "paddleocr-python-service",
    rawText,
    records: records || [],
    counts: counts || null,
    reviewRecords,
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("截图读取失败，请重新导入后重试"));
    reader.readAsDataURL(file);
  });
}

function deriveStructuredResultFromOcrPayload(payload) {
  const boxes = payload?.ocr_result?.boxes;
  const source = Array.isArray(boxes) && boxes.length
    ? {
        rawText: payload?.raw_text || "",
        words: boxes.map((box) => ({
          text: box?.text || "",
          bbox: box?.bbox || {},
          confidence: box?.confidence || 0,
        })),
      }
    : payload?.raw_text || "";

  const derived = deriveStructuredTextFromOcr(source);
  return {
    ...derived,
    records: payload?.records || [],
    reviewRecords: payload?.review_records || [],
    counts: payload?.counts || null,
    rawText: payload?.raw_text || "",
  };
}

function choosePreferredStructuredResult(primaryResult, fallbackResult) {
  const primaryRows = primaryResult?.rows?.length || 0;
  const fallbackRows = fallbackResult?.rows?.length || 0;
  return fallbackRows > primaryRows ? fallbackResult : primaryResult;
}

async function requestLocalOcrBinary(file, index) {
  return fetchJsonWithTimeout(`${LOCAL_OCR_SERVICE_URL}/recognize`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-Image-Name": encodeURIComponent(file.name || `image-${index + 1}.png`),
    },
    body: file,
  });
}

async function requestLocalOcrLegacyJson(file) {
  const imageDataUrl = await readFileAsDataUrl(file);
  return fetchJsonWithTimeout(`${LOCAL_OCR_SERVICE_URL}/recognize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_name: file.name,
      image_data_url: imageDataUrl,
    }),
  });
}

async function recognizeWithLocalOcrService(file, index, total) {
  setOcrStatus(`正在调用本地 OCR 服务识别第 ${index + 1}/${total} 张`, "processing");
  let payload;
  try {
    payload = await requestLocalOcrBinary(file, index);
  } catch (binaryError) {
    try {
      payload = await requestLocalOcrLegacyJson(file);
    } catch {
      throw binaryError;
    }
  }

  const serviceStructuredResult = createStructuredResultFromTradeRecords(
    payload?.records || [],
    payload?.review_records || [],
    payload?.raw_text || "",
    payload?.counts || null
  );
  const fallbackStructuredResult = deriveStructuredResultFromOcrPayload(payload);
  const structuredResult = choosePreferredStructuredResult(serviceStructuredResult, fallbackStructuredResult);

  return {
    rawText: payload?.raw_text || "",
    structuredResult,
  };
}

function serializeStructuredRow(row) {
  const pieces = [];
  if (row.time) {
    pieces.push(row.time);
  }
  pieces.push(row.direction || "buy", row.weight, row.price);
  return pieces.join(", ");
}

function serializeStructuredRows(rows) {
  return rows.map(serializeStructuredRow).join("\n");
}

function extractRowsFromTradeBlocks(text) {
  const normalized = normalizeOcrText(text);
  
  // 更灵活的正则表达式，支持更多数字格式
  const blockRegex = /(委托买入|委托卖出)[\s\S]{0,120}?([¥￥]?\s*[\d,]*(?:\.\d{1,4})?|已撤单|进行中|过期失效|已失效|未成交)[\s\S]{0,160}?克[数教效]?[:：]?\s*([\d,]*(?:\.\d{1,4})?)\s*克?[\s\S]{0,160}?成交价[:：]?\s*[¥￥]?\s*([\d,]*(?:\.\d{1,4})?)/g;
  
  const rows = [];
  let totalBlocks = 0;
  let match;

  while ((match = blockRegex.exec(normalized)) !== null) {
    totalBlocks += 1;

    const statusOrAmount = match[2];
    const weightText = match[3];
    const priceText = match[4];
    
    // 调试输出
    console.debug('Trade block match:', { 
      direction: match[1], 
      statusOrAmount, 
      weightText, 
      priceText 
    });
    
    const weight = parseNumericValue(weightText);
    const price = parseNumericValue(priceText);
    const amount = parseNumericValue(statusOrAmount);
    const isCanceled = isCanceledLine(statusOrAmount);

    if (isCanceled || weight <= 0) {
      console.debug('Skipped: canceled or invalid weight', { isCanceled, weight });
      continue;
    }

    const reconciled = reconcileTradeValues({ weight, price, amount });
    let finalPrice = reconciled.price;
    let finalWeight = reconciled.weight;

    if (finalPrice <= 0 || finalWeight <= 0) {
      console.debug('Skipped: invalid reconciled values', { finalPrice, finalWeight });
      continue;
    }

    const row = createStructuredRow({
      time: extractTimeFromText(match[0]),
      direction: extractDirectionFromText(match[1]),
      weight: finalWeight,
      price: finalPrice,
    });
    if (row) {
      console.debug('Created row:', row);
      rows.push(row);
    } else {
      console.debug('Failed to create structured row');
    }
  }

  console.debug('Trade blocks extracted:', rows.length, 'skipped:', Math.max(totalBlocks - rows.length, 0));
  return {
    rows,
    skippedCount: Math.max(totalBlocks - rows.length, 0),
  };
}

function dedupeStructuredRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = createRowKey(row);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function extractRowsFromEntryBlocks(text) {
  const normalized = normalizeOcrText(text);
  const entries = normalized
    .split(/(?=委托买入|委托卖出)/)
    .map((entry) => entry.trim())
    .filter((entry) => /(委托买入|委托卖出)/.test(entry));

  const rows = [];
  let skippedCount = 0;
  let currentTime = "";
  let currentDirection = "buy";

  entries.forEach((entry) => {
    const entryTime = extractTimeFromText(entry);
    if (entryTime) {
      currentTime = entryTime;
    }
    const entryDirection = extractDirectionFromText(entry);
    if (entryDirection) {
      currentDirection = entryDirection;
    }

    const weight = extractWeightFromLine(entry);
    const price = extractPriceFromLine(entry);
    const amountText = entry.replace(/(成交价|委托价)\s*[:：]?\s*[¥￥]?\s*[\d,]+\.\d{2}/g, " ");
    const amount = extractAmountFromLine(amountText);

    const reconciled = reconcileTradeValues({ weight, price, amount });
    const finalWeight = reconciled.weight;
    const finalPrice = reconciled.price;

    const row = createStructuredRow({
      time: entryTime || currentTime,
      direction: entryDirection || currentDirection,
      weight: finalWeight,
      price: finalPrice,
    });

    if (row) {
      rows.push(row);
    } else {
      skippedCount += 1;
    }
  });

  return {
    rows: dedupeStructuredRows(rows),
    skippedCount,
  };
}

function isDateLine(line) {
  return /20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}/.test(line);
}

function isTailNumberLine(line) {
  return /尾号/.test(line);
}

function isCanceledLine(line) {
  return /已撤单|撤单|进行中|过期失效|已失效|未成交|已过期|过期/.test(line);
}

function isPriceLine(line) {
  return /成交价|委托价/.test(line);
}

function isDealPriceLine(line) {
  return /成交价/.test(line);
}

function extractAmountFromLine(line) {
  if (isDateLine(line) || isTailNumberLine(line) || isPriceLine(line)) {
    return 0;
  }

  const match = line.match(/[¥￥]?\s*([\d,]+\.\d{2})/);
  if (!match) {
    return 0;
  }

  const value = parseNumericValue(match[1]);
  return value >= 50 ? value : 0;
}

function extractWeightFromLine(line) {
  // 更全面的克重匹配：支持"克数:1.234", "1.234克", ".123克", "123克", "克:1.234"等格式
  const match = line.match(/(?:克[数教效]?[:：]?\s*|[:：]\s*)?([\d,]*\.\d+|\d+)\s*克?/i);
  if (!match) {
    return 0;
  }

  const value = parseNumericValue(match[1]);
  // 放宽克重范围：0.001克到10000克，覆盖小数克重和较大克重
  return value > 0 && value <= 10000 ? value : 0;
}

function extractPriceFromLine(line) {
  if (!isDealPriceLine(line)) {
    return 0;
  }

  const match = line.match(/[¥￥]?\s*([\d,]+\.\d{2})/);
  if (!match) {
    return 0;
  }

  const value = parseNumericValue(match[1]);
  return value > 0 && value <= 10000 ? value : 0;
}

function extractRowsFromSequentialLines(text) {
  const normalized = normalizeOcrText(text);
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = [];
  let skippedCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const amount = extractAmountFromLine(line);
    const linePrice = extractPriceFromLine(line);
    const canceled = isCanceledLine(line);

    if (!amount && !linePrice && !canceled) {
      continue;
    }

    let weight = 0;
    let price = linePrice;

    for (let offset = -2; offset <= 8; offset += 1) {
      if (offset === 0 || index + offset < 0 || index + offset >= lines.length) {
        continue;
      }

      const nextLine = lines[index + offset];
      if (offset > 0 && (extractAmountFromLine(nextLine) || isCanceledLine(nextLine))) {
        break;
      }

      if (!weight) {
        weight = extractWeightFromLine(nextLine);
      }

      if (!price) {
        price = extractPriceFromLine(nextLine);
      }
    }

    if (canceled) {
      skippedCount += 1;
      continue;
    }

    const reconciled = reconcileTradeValues({ weight, price, amount });
    weight = reconciled.weight;
    price = reconciled.price;

    if (!weight || !price) {
      skippedCount += 1;
      continue;
    }

    const row = createStructuredRow({
      time: findNearestTime(lines, index),
      direction: findNearestDirection(lines, index),
      weight,
      price,
    });
    if (row) {
      rows.push(row);
    }
  }

  return {
    rows: dedupeStructuredRows(rows),
    skippedCount,
  };
}

function buildStructuredRow(line, numbers) {
  if (isCanceledLine(line) || !isDealPriceLine(line)) {
    return null;
  }

  let weight = 0;
  let price = 0;
  
  // 分析行的上下文来判断数字类型
  const hasWeightKeyword = /克[数教效]?[:：]|[:：]\s*克|克$/.test(line);
  const hasPriceKeyword = /成交价|委托价|¥|￥/.test(line);
  const hasAmountKeyword = /[¥￥]\s*\d+\.\d{2}/.test(line) && !hasPriceKeyword;

  // 首先尝试使用专门的提取函数
  weight = extractWeightFromLine(line);
  price = extractPriceFromLine(line);
  
  // 如果没有通过关键词提取到，使用启发式规则
  if (!weight && !price) {
    const candidates = [];
    
    for (const value of numbers) {
      const numeric = Number.parseFloat(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        continue;
      }
      
      // 根据数值范围和上下文判断类型
      if (hasWeightKeyword || (!hasPriceKeyword && numeric < 1000 && numeric.toString().includes('.'))) {
        // 小数克重通常小于1000且有小数点
        if (!weight && numeric > 0.001 && numeric < 1000) {
          weight = numeric;
        }
      } else if (hasPriceKeyword || (!hasWeightKeyword && numeric >= 100 && numeric <= 10000)) {
        // 价格通常在100-10000之间
        if (!price) {
          price = numeric;
        }
      } else {
        // 无法判断，保存为候选
        candidates.push(numeric);
      }
    }
    
    // 处理候选数字：如果只有一个数字，根据上下文猜测
    if (candidates.length === 1) {
      const numeric = candidates[0];
      if (!weight && !price) {
        // 根据常见范围猜测
        if (numeric < 1000 && numeric.toString().includes('.')) {
          weight = numeric;
        } else if (numeric >= 100 && numeric <= 10000) {
          price = numeric;
        }
      }
    } else if (candidates.length === 2) {
      // 两个数字：较小的可能是克重，较大的可能是价格
      const [smaller, larger] = candidates.sort((a, b) => a - b);
      if (smaller < 1000 && larger >= 100 && larger <= 10000) {
        weight = smaller;
        price = larger;
      }
    }
  }

  // 如果仍然缺少一个值，尝试从另一个推导
  if (weight && !price) {
    // 尝试从金额反推价格（如果有金额信息）
    const amount = extractAmountFromLine(line);
    if (amount > 0) {
      price = roundNumericValue(amount / weight, 2);
    }
  } else if (price && !weight) {
    const amount = extractAmountFromLine(line);
    if (amount > 0) {
      weight = roundNumericValue(amount / price, 4);
    }
  }

  return createStructuredRow({
    time: extractTimeFromText(line),
    direction: extractDirectionFromText(line) || "buy",
    weight,
    price,
  });
}

function extractRowsFromSmartPattern(text) {
  const normalized = normalizeOcrText(text);
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const rows = [];
  let skippedCount = 0;
  
  // 状态变量：跟踪当前交易块的信息
  let currentTime = "";
  let currentDirection = "";
  let pendingWeight = 0;
  let pendingPrice = 0;
  let pendingAmount = 0;
  
  // 智能模式匹配：寻找交易数据的三要素（克重、单价、金额）
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 提取时间
    const time = extractTimeFromText(line);
    if (time) {
      currentTime = time;
    }
    
    // 提取方向
    const direction = extractDirectionFromText(line);
    if (direction) {
      currentDirection = direction;
    }
    
    // 检查是否是已撤销或无效交易
    if (isCanceledLine(line)) {
      skippedCount++;
      continue;
    }
    
    // 尝试从当前行提取交易三要素
    const weight = extractWeightFromLine(line);
    const price = extractPriceFromLine(line);
    const amount = extractAmountFromLine(line);
    
    // 如果有明确的成交价行，尝试构建完整交易记录
    if (isDealPriceLine(line)) {
      // 向前后搜索缺失的信息
      let foundWeight = weight;
      let foundPrice = price;
      
      if (!foundWeight) {
        // 向前搜索克重（通常克重在成交价前面）
        for (let offset = 1; offset <= 3 && i - offset >= 0; offset++) {
          const prevLine = lines[i - offset];
          const prevWeight = extractWeightFromLine(prevLine);
          if (prevWeight > 0) {
            foundWeight = prevWeight;
            break;
          }
        }
      }
      
      if (!foundPrice) {
        // 向后搜索单价（可能在后续行）
        for (let offset = 1; offset <= 3 && i + offset < lines.length; offset++) {
          const nextLine = lines[i + offset];
          const nextPrice = extractPriceFromLine(nextLine);
          if (nextPrice > 0 && !isCanceledLine(nextLine)) {
            foundPrice = nextPrice;
            break;
          }
        }
      }
      
      // 尝试使用金额反推缺失的值
      if (amount > 0 && foundWeight > 0 && !foundPrice) {
        foundPrice = roundNumericValue(amount / foundWeight, 2);
      } else if (amount > 0 && foundPrice > 0 && !foundWeight) {
        foundWeight = roundNumericValue(amount / foundPrice, 4);
      }
      
      // 如果找到了克重和单价，创建交易记录
      if (foundWeight > 0 && foundPrice > 0) {
        const reconciled = reconcileTradeValues({
          weight: foundWeight,
          price: foundPrice,
          amount
        });
        
        const row = createStructuredRow({
          time: currentTime || time || findNearestTime(lines, i),
          direction: currentDirection || direction || findNearestDirection(lines, i) || "buy",
          weight: reconciled.weight,
          price: reconciled.price,
        });
        
        if (row) {
          rows.push(row);
          // 重置状态
          pendingWeight = 0;
          pendingPrice = 0;
          pendingAmount = 0;
        } else {
          skippedCount++;
        }
      } else {
        // 保存部分信息以待后续行补全
        if (weight > 0) pendingWeight = weight;
        if (price > 0) pendingPrice = price;
        if (amount > 0) pendingAmount = amount;
      }
    } else if (weight > 0 || price > 0 || amount > 0) {
      // 保存部分信息
      if (weight > 0) pendingWeight = weight;
      if (price > 0) pendingPrice = price;
      if (amount > 0) pendingAmount = amount;
      
      // 如果凑齐了三要素，尝试创建记录
      if (pendingWeight > 0 && pendingPrice > 0 && pendingAmount > 0) {
        const reconciled = reconcileTradeValues({
          weight: pendingWeight,
          price: pendingPrice,
          amount: pendingAmount
        });
        
        const row = createStructuredRow({
          time: currentTime || findNearestTime(lines, i),
          direction: currentDirection || findNearestDirection(lines, i) || "buy",
          weight: reconciled.weight,
          price: reconciled.price,
        });
        
        if (row) {
          rows.push(row);
          // 重置状态
          pendingWeight = 0;
          pendingPrice = 0;
          pendingAmount = 0;
        }
      }
    }
  }
  
  // 处理最后未完成的交易
  if (pendingWeight > 0 && pendingPrice > 0) {
    const reconciled = reconcileTradeValues({
      weight: pendingWeight,
      price: pendingPrice,
      amount: pendingAmount
    });
    
    const row = createStructuredRow({
      time: currentTime,
      direction: currentDirection || "buy",
      weight: reconciled.weight,
      price: reconciled.price,
    });
    
    if (row) {
      rows.push(row);
    } else {
      skippedCount++;
    }
  }
  
  return {
    rows: dedupeStructuredRows(rows),
    skippedCount,
  };
}

function extractRowsFromUniversalPattern(text) {
  const normalized = normalizeOcrText(text);
  console.debug('OCR text for universal pattern:', normalized);
  
  const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
  const rows = [];
  let skippedCount = 0;
  
  // 状态跟踪
  let currentTime = '';
  let currentDirection = '';
  
  // 缓存可能的交易数据块
  const potentialTransactions = [];
  
  // 第一步：扫描所有行，提取关键信息
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 提取时间
    const time = extractTimeFromText(line);
    if (time) {
      currentTime = time;
    }
    
    // 提取方向
    const direction = extractDirectionFromText(line);
    if (direction) {
      currentDirection = direction;
    }
    
    // 跳过无效行
    if (isCanceledLine(line) || isDateLine(line) || isTailNumberLine(line)) {
      continue;
    }
    
    // 检查是否包含交易相关关键词
    const hasTradeKeywords = /(委托买入|委托卖出|成交价|委托价|克数|克:)/.test(line);
    const hasNumbers = /\d/.test(line);
    
    if (hasTradeKeywords && hasNumbers) {
      // 提取所有可能的数字
      const numbers = line.match(/[\d,]+(?:\.\d+)?/g) || [];
      const numericValues = numbers.map(n => parseNumericValue(n)).filter(n => n > 0);
      
      // 尝试识别数字类型
      let weight = 0;
      let price = 0;
      let amount = 0;
      
      // 基于关键词判断
      if (/克[数教效]?[:：]|[:：]\s*克|克$/.test(line)) {
        // 克重相关行
        for (const num of numericValues) {
          if (!weight && num > 0.001 && num < 10000) {
            weight = num;
          }
        }
      } else if (/成交价|委托价|¥|￥/.test(line)) {
        // 价格相关行
        for (const num of numericValues) {
          if (!price && num >= 100 && num <= 10000) {
            price = num;
          }
        }
      } else if (/[¥￥]\s*[\d,]+/.test(line)) {
        // 金额相关行
        for (const num of numericValues) {
          if (!amount && num >= 10) {
            amount = num;
          }
        }
      }
      
      // 如果没有通过关键词识别，尝试启发式规则
      if (numericValues.length === 1) {
        const num = numericValues[0];
        if (!weight && !price && !amount) {
          if (num < 10000 && num.toString().includes('.')) {
            weight = num;
          } else if (num >= 100 && num <= 10000) {
            price = num;
          } else if (num >= 10) {
            amount = num;
          }
        }
      } else if (numericValues.length === 2) {
        const [smaller, larger] = numericValues.sort((a, b) => a - b);
        if (smaller < 10000 && larger >= 100 && larger <= 10000) {
          weight = smaller;
          price = larger;
        }
      } else if (numericValues.length === 3) {
        // 可能是克重、价格、金额三者都有
        const sorted = [...numericValues].sort((a, b) => a - b);
        // 最小的是克重，中间是价格，最大的是金额
        weight = sorted[0];
        price = sorted[1];
        amount = sorted[2];
      }
      
      potentialTransactions.push({
        lineIndex: i,
        lineText: line,
        time: time || currentTime,
        direction: direction || currentDirection,
        weight,
        price,
        amount
      });
    }
  }
  
  // 第二步：处理提取到的交易数据
  for (const transaction of potentialTransactions) {
    const { weight, price, amount, time, direction } = transaction;
    
    // 如果缺少必要信息，尝试从上下文补充
    let finalWeight = weight;
    let finalPrice = price;
    
    if (weight > 0 && price === 0 && amount > 0) {
      // 有克重和金额，计算价格
      finalPrice = roundNumericValue(amount / weight, 2);
    } else if (price > 0 && weight === 0 && amount > 0) {
      // 有价格和金额，计算克重
      finalWeight = roundNumericValue(amount / price, 4);
    }
    
    // 尝试协调数据
    const reconciled = reconcileTradeValues({
      weight: finalWeight,
      price: finalPrice,
      amount
    });
    
    // 如果协调后仍然有效，创建记录
    if (reconciled.weight > 0 && reconciled.price > 0) {
      const row = createStructuredRow({
        time: time || '',
        direction: direction || 'buy',
        weight: reconciled.weight,
        price: reconciled.price,
      });
      
      if (row) {
        rows.push(row);
      } else {
        skippedCount++;
      }
    } else {
      skippedCount++;
    }
  }
  
  console.debug('Universal pattern extracted:', rows.length, 'rows, skipped:', skippedCount);
  return {
    rows: dedupeStructuredRows(rows),
    skippedCount,
  };
}

function deriveStructuredTextFromOcr(rawText) {
  if (window.GoldOcrCore?.deriveStructuredTextFromOcr) {
    return window.GoldOcrCore.deriveStructuredTextFromOcr(rawText);
  }

  return {
    rows: [],
    text: "",
    extractedCount: 0,
    skippedCount: 0,
    parser: "",
    candidates: [],
  };
}

function shouldUseSegmentedOcr(imageSource) {
  if (!imageSource?.width || !imageSource?.height) {
    return false;
  }

  return imageSource.height >= 2200 && imageSource.height / imageSource.width >= 1.8;
}

function createOcrSlices(imageSource) {
  const preferredHeight = Math.max(1100, Math.min(1600, Math.round(imageSource.width * 1.55)));
  const overlap = Math.max(120, Math.round(preferredHeight * 0.12));
  const slices = [];
  let top = 0;

  while (top < imageSource.height) {
    const height = Math.min(preferredHeight, imageSource.height - top);
    slices.push({ top, height });
    if (top + height >= imageSource.height) {
      break;
    }
    top += preferredHeight - overlap;
  }

  return slices;
}

const OCR_CANVAS_SCALE = 1.65;

function buildOcrCanvas(imageSource, slice = null, scale = OCR_CANVAS_SCALE) {
  const sourceX = 0;
  const sourceY = slice?.top || 0;
  const sourceWidth = imageSource.width;
  const sourceHeight = slice?.height || imageSource.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.imageSmoothingEnabled = true;
  context.drawImage(
    imageSource,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const gray = red * 0.299 + green * 0.587 + blue * 0.114;
    const contrasted = gray > 214 ? 255 : Math.max(0, Math.min(255, (gray - 128) * 1.18 + 128));
    data[index] = contrasted;
    data[index + 1] = contrasted;
    data[index + 2] = contrasted;
  }
  context.putImageData(imageData, 0, 0);

  return canvas;
}

function scaleOcrBBox(bbox, coordScale = 1, offsetX = 0, offsetY = 0) {
  return {
    x0: toNumber(bbox?.x0) * coordScale + offsetX,
    y0: toNumber(bbox?.y0) * coordScale + offsetY,
    x1: toNumber(bbox?.x1) * coordScale + offsetX,
    y1: toNumber(bbox?.y1) * coordScale + offsetY,
  };
}

function normalizeOcrWord(word, options = {}) {
  const text = String(word?.text || "").trim();
  if (!text) {
    return null;
  }

  return {
    text,
    confidence: Number(word?.confidence) || 0,
    bbox: scaleOcrBBox(word?.bbox, options.coordScale, options.offsetX, options.offsetY),
  };
}

function normalizeOcrLine(line, options = {}) {
  const words = (line?.words || []).map((word) => normalizeOcrWord(word, options)).filter(Boolean);
  const text = String(line?.text || words.map((word) => word.text).join(" ")).trim();
  if (!text) {
    return null;
  }

  return {
    text,
    confidence: Number(line?.confidence) || 0,
    bbox: scaleOcrBBox(line?.bbox, options.coordScale, options.offsetX, options.offsetY),
    words,
  };
}

function createStructuredRecognitionPayload(data, options = {}) {
  const lines = (data?.lines || []).map((line) => normalizeOcrLine(line, options)).filter(Boolean);
  const lineWords = lines.flatMap((line) => line.words || []);
  const standaloneWords = (data?.words || []).map((word) => normalizeOcrWord(word, options)).filter(Boolean);
  const words = lineWords.length ? lineWords : standaloneWords;

  return {
    rawText: data?.text ? String(data.text).trim() : lines.map((line) => line.text).join("\n"),
    confidence: Number(data?.confidence) || 0,
    lines,
    words,
  };
}

function mergeRowsWithOverlap(baseRows, nextRows) {
  if (!baseRows.length) {
    return [...nextRows];
  }
  if (!nextRows.length) {
    return [...baseRows];
  }

  const maxOverlap = Math.min(4, baseRows.length, nextRows.length);
  let overlapSize = 0;

  for (let size = maxOverlap; size > 0; size -= 1) {
    const baseSlice = baseRows.slice(-size).map(createRowKey);
    const nextSlice = nextRows.slice(0, size).map(createRowKey);
    if (baseSlice.every((key, index) => key === nextSlice[index])) {
      overlapSize = size;
      break;
    }
  }

  return [...baseRows, ...nextRows.slice(overlapSize)];
}

async function loadImageElement(file) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;

    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("图片加载失败"));
      });
    }

    return {
      source: image,
      release() {
        URL.revokeObjectURL(objectUrl);
      },
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function loadImageSource(file) {
  if (window.createImageBitmap) {
    try {
      const bitmap = await window.createImageBitmap(file);
      return {
        source: bitmap,
        release() {
          bitmap.close?.();
        },
      };
    } catch {
      // Fall back to HTMLImageElement below.
    }
  }

  try {
    return await loadImageElement(file);
  } catch {
    return null;
  }
}

async function runTesseractRecognition(source, logger, options = {}) {
  const result = await window.Tesseract.recognize(source, "eng+chi_sim", { logger });
  return createStructuredRecognitionPayload(result?.data, options);
}

async function recognizeSegmentedImage(file, index, total, imageSource) {
  const slices = createOcrSlices(imageSource);
  const merged = {
    rows: [],
    skippedCount: 0,
  };
  const rawTextParts = [];

  for (let sliceIndex = 0; sliceIndex < slices.length; sliceIndex += 1) {
    const slice = slices[sliceIndex];
    const canvas = buildOcrCanvas(imageSource, slice);
    if (!canvas) {
      continue;
    }

    const recognition = await runTesseractRecognition(canvas, (message) => {
      if (message.status === "recognizing text") {
        const progress = `${Math.round((message.progress || 0) * 100)}%`;
        setOcrStatus(`正在识别第 ${index + 1}/${total} 张，第 ${sliceIndex + 1}/${slices.length} 段 ${progress}`, "processing");
      }
    }, {
      coordScale: 1 / OCR_CANVAS_SCALE,
      offsetY: slice.top,
    });

    rawTextParts.push(recognition.rawText);
    const structuredResult = deriveStructuredTextFromOcr(recognition);
    merged.rows = mergeRowsWithOverlap(merged.rows, structuredResult.rows || []);
    merged.skippedCount += structuredResult.skippedCount || 0;
  }

  return {
    rawText: rawTextParts.filter(Boolean).join("\n"),
    structuredResult: {
      rows: merged.rows,
      text: serializeStructuredRows(merged.rows),
      extractedCount: merged.rows.length,
      skippedCount: merged.skippedCount,
    },
  };
}

async function recognizeImageContent(file, index, total) {
  const engineState = await detectOcrEngine(true);
  if (engineState.available) {
    try {
      return await recognizeWithLocalOcrService(file, index, total);
    } catch (error) {
      console.warn("Local OCR service failed, falling back to browser OCR.", error);
      ocrEngineState.available = false;
    }
  }

  const imageAsset = await loadImageSource(file);
  const imageSource = imageAsset?.source || null;

  try {
    if (!imageSource) {
      throw new Error("截图读取失败，请重新导入后重试");
    }

    if (shouldUseSegmentedOcr(imageSource)) {
      const segmentedResult = await recognizeSegmentedImage(file, index, total, imageSource);
      if (segmentedResult.structuredResult.rows.length) {
        return segmentedResult;
      }
    }

    const fullCanvas = buildOcrCanvas(imageSource);
    const recognition = await runTesseractRecognition(fullCanvas || imageSource, (message) => {
      if (message.status === "recognizing text") {
        const progress = `${Math.round((message.progress || 0) * 100)}%`;
        setOcrStatus(`正在识别第 ${index + 1}/${total} 张，进度 ${progress}`, "processing");
      }
    }, {
      coordScale: fullCanvas ? 1 / OCR_CANVAS_SCALE : 1,
    });

    const structuredResult = deriveStructuredTextFromOcr(recognition);
    if (structuredResult.extractedCount === 0 && recognition.rawText.trim().length > 0) {
      console.warn("OCR extracted text but failed to structure it.");
    }

    return {
      rawText: recognition.rawText,
      structuredResult,
    };
  } finally {
    imageAsset?.release?.();
  }
}

function calculateTotals(rows) {
  return rows.reduce(
    (totals, row) => {
      const weight = toNumber(row.weight);
      const price = toNumber(row.price);
      const amount = weight * price;
      const direction = normalizeDirection(row.direction);

      totals.count += 1;
      totals.turnoverAmount += amount;

      if (direction === "sell") {
        totals.sellCount += 1;
        totals.sellWeight += weight;
        totals.sellAmount += amount;
      } else {
        totals.buyCount += 1;
        totals.buyWeight += weight;
        totals.buyAmount += amount;
      }

      totals.netWeight = totals.buyWeight - totals.sellWeight;
      totals.netAmount = totals.sellAmount - totals.buyAmount;
      totals.buyAvgPrice = totals.buyWeight > 0 ? totals.buyAmount / totals.buyWeight : 0;
      totals.sellAvgPrice = totals.sellWeight > 0 ? totals.sellAmount / totals.sellWeight : 0;
      return totals;
    },
    {
      count: 0,
      buyCount: 0,
      sellCount: 0,
      buyWeight: 0,
      sellWeight: 0,
      netWeight: 0,
      buyAmount: 0,
      sellAmount: 0,
      netAmount: 0,
      turnoverAmount: 0,
      buyAvgPrice: 0,
      sellAvgPrice: 0,
    }
  );
}

function buildDailySummaryFromRows(rows) {
  const groups = [];
  const groupMap = new Map();

  rows.forEach((row) => {
    const label = formatDay(row.time);
    if (!groupMap.has(label)) {
      const group = { label, rows: [] };
      groupMap.set(label, group);
      groups.push(group);
    }

    groupMap.get(label).rows.push(row);
  });

  return groups
    .map((group) => {
      const totals = calculateTotals(group.rows);
      return {
        label: group.label,
        count: group.rows.length,
        buyWeight: totals.buyWeight,
        sellWeight: totals.sellWeight,
        netWeight: totals.netWeight,
        buyAmount: totals.buyAmount,
        sellAmount: totals.sellAmount,
        netAmount: totals.netAmount,
        buyAvgPrice: totals.buyAvgPrice,
        sellAvgPrice: totals.sellAvgPrice,
      };
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.label);
      const rightTime = Date.parse(right.label);
      const leftValid = Number.isFinite(leftTime);
      const rightValid = Number.isFinite(rightTime);

      if (!leftValid && !rightValid) {
        return left.label.localeCompare(right.label, "zh-CN");
      }
      if (!leftValid) {
        return 1;
      }
      if (!rightValid) {
        return -1;
      }
      return leftTime - rightTime;
    });
}

function chooseBucketSize(min, max) {
  const range = max - min;
  if (range <= 60) {
    return 10;
  }
  if (range <= 150) {
    return 20;
  }
  if (range <= 300) {
    return 50;
  }
  return 100;
}

function buildPriceDistribution(rows) {
  if (!rows.length) {
    return [];
  }

  const prices = rows.map((row) => toNumber(row.price)).filter((value) => value > 0);
  if (!prices.length) {
    return [];
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const bucketSize = chooseBucketSize(minPrice, maxPrice);
  const buckets = new Map();

  rows.forEach((row) => {
    const price = toNumber(row.price);
    const weight = toNumber(row.weight);
    const bucketStart = Math.floor(price / bucketSize) * bucketSize;
    const label = `${bucketStart}-${bucketStart + bucketSize - 1}`;
    const currentBucket = buckets.get(label) || { buyWeight: 0, sellWeight: 0 };
    if (normalizeDirection(row.direction) === "sell") {
      currentBucket.sellWeight += weight;
    } else {
      currentBucket.buyWeight += weight;
    }
    buckets.set(label, currentBucket);
  });

  return Array.from(buckets.entries())
    .map(([label, bucket]) => ({
      label,
      buyWeight: bucket.buyWeight,
      sellWeight: bucket.sellWeight,
      netWeight: bucket.buyWeight - bucket.sellWeight,
      start: Number(label.split("-")[0]),
    }))
    .sort((left, right) => left.start - right.start);
}

function buildBatchSummary(rows) {
  const totals = calculateTotals(rows);
  return {
    count: totals.count,
    buyWeight: totals.buyWeight,
    sellWeight: totals.sellWeight,
    netWeight: totals.netWeight,
    buyAmount: totals.buyAmount,
    sellAmount: totals.sellAmount,
    netAmount: totals.netAmount,
  };
}

function createImageKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function revokeImagePreview(item) {
  if (item.previewUrl) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

function clearQueueItems() {
  imageState.items.forEach(revokeImagePreview);
  imageState.items = [];
  elements.imageInput.value = "";
  closeImageLightbox();
}

function addImageFiles(fileList) {
  const files = Array.from(fileList || []).filter((file) => file?.type?.startsWith("image/"));
  if (!files.length) {
    setOcrStatus("请导入有效截图或直接粘贴截图", "error");
    return;
  }

  const existingKeys = new Set(imageState.items.map((item) => item.key));
  let addedCount = 0;

  files.forEach((file) => {
    const key = createImageKey(file);
    if (existingKeys.has(key)) {
      return;
    }

    imageState.items.push({
      key,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "queued",
      rawText: "",
      rows: [],
      extractedCount: 0,
      skippedCount: 0,
      error: "",
    });
    existingKeys.add(key);
    addedCount += 1;
  });

  if (!addedCount) {
    update();
    setOcrStatus(`队列里已有 ${imageState.items.length} 张截图，未重复加入`);
    return;
  }

  markWorkspaceDirty();
  update();
  setOcrStatus(`已加入 ${addedCount} 张截图，当前共 ${imageState.items.length} 张`);
}

function rebuildTextFromQueue() {
  return imageState.items.flatMap((item) => item.rows || []);
}

function computeQueueStats() {
  return imageState.items.reduce(
    (stats, item) => {
      stats.total += 1;
      if (item.status === "done") {
        stats.done += 1;
      }
      if (item.status === "processing") {
        stats.processing += 1;
      }
      if (item.status === "error") {
        stats.error += 1;
      }
      stats.extracted += item.extractedCount || 0;
      stats.skipped += item.skippedCount || 0;
      return stats;
    },
    { total: 0, done: 0, processing: 0, error: 0, extracted: 0, skipped: 0 }
  );
}

function getDisplayRows() {
  return [...workspaceState.baseRows, ...rebuildTextFromQueue()];
}

function getDisplaySourceLabel() {
  const queueStats = computeQueueStats();
  const batchLabel = state.currentBatchName || "当前统计批次";
  if ((state.currentBatchId || workspaceState.baseRows.length) && queueStats.total) {
    return `${batchLabel} + ${queueStats.total} 张新截图`;
  }
  if (state.currentBatchId || workspaceState.baseRows.length) {
    return batchLabel;
  }
  if (queueStats.total) {
    return `${queueStats.total} 张截图`;
  }
  return "识别结果";
}

function getTimeReviewRows() {
  return buildDailySummaryFromRows(getDisplayRows());
}

function getTimeValue(value) {
  const timestamp = new Date(value || "").getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sortRowEntries(entries, sortValue = "time-desc") {
  return [...(entries || [])]
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      let comparison = 0;

      if (sortValue === "time-desc" || sortValue === "time-asc") {
        const leftTime = getTimeValue(left.entry.row?.time);
        const rightTime = getTimeValue(right.entry.row?.time);
        if (leftTime === null && rightTime === null) {
          comparison = 0;
        } else if (leftTime === null) {
          comparison = 1;
        } else if (rightTime === null) {
          comparison = -1;
        } else {
          comparison = leftTime - rightTime;
        }
        if (sortValue === "time-desc") {
          comparison *= -1;
        }
      }

      if (sortValue === "weight-desc" || sortValue === "weight-asc") {
        comparison = Number(left.entry.row?.weight || 0) - Number(right.entry.row?.weight || 0);
        if (sortValue === "weight-desc") {
          comparison *= -1;
        }
      }

      if (sortValue === "price-desc" || sortValue === "price-asc") {
        comparison = Number(left.entry.row?.price || 0) - Number(right.entry.row?.price || 0);
        if (sortValue === "price-desc") {
          comparison *= -1;
        }
      }

      return comparison || left.index - right.index;
    })
    .map((entry) => entry.entry);
}

function buildDuplicateCountMap(rows, getRowKey) {
  const counts = new Map();

  (rows || []).forEach((row) => {
    const key = getRowKey(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return counts;
}

function getRowAnomalies(row, { duplicateCount = 0 } = {}) {
  const issues = [];
  const weight = Number(row?.weight || 0);
  const price = Number(row?.price || 0);

  if (!row?.time || getTimeValue(row.time) === null) {
    issues.push("时间缺失");
  }

  if (!Number.isFinite(weight) || weight <= 0) {
    issues.push("克重无效");
  } else if (weight > 100) {
    issues.push("克重异常");
  }

  if (!Number.isFinite(price) || price <= 0) {
    issues.push("单价无效");
  } else if (price < 100 || price > 10000) {
    issues.push("单价异常");
  }

  if (duplicateCount > 1) {
    issues.push("疑似重复");
  }

  return issues;
}

function getSortField(sortValue = detailViewState.sort) {
  return String(sortValue).split("-")[0];
}

function getSortDirection(sortValue = detailViewState.sort) {
  return String(sortValue).split("-")[1] || "desc";
}

function toggleDetailSort(field) {
  if (getSortField() === field) {
    detailViewState.sort = `${field}-${getSortDirection() === "asc" ? "desc" : "asc"}`;
  } else {
    detailViewState.sort = `${field}-${field === "time" ? "desc" : "asc"}`;
  }
}

function renderDetailSortIndicators() {
  const activeField = getSortField();
  const activeDirection = getSortDirection();
  const indicatorMap = {
    time: elements.detailSortIndicatorTime,
    weight: elements.detailSortIndicatorWeight,
    price: elements.detailSortIndicatorPrice,
  };
  const buttonMap = {
    time: elements.detailSortTime,
    weight: elements.detailSortWeight,
    price: elements.detailSortPrice,
  };

  Object.entries(indicatorMap).forEach(([field, element]) => {
    const isActive = field === activeField;
    const direction = isActive ? activeDirection : "asc";
    element.textContent = direction === "asc" ? "▲" : "▼";
    element.classList.toggle("active", isActive);
    buttonMap[field]?.classList.toggle("active", isActive);
    buttonMap[field]?.setAttribute(
      "aria-label",
      `${field === "time" ? "成交时间" : field === "weight" ? "克重" : "单价"}，当前${direction === "asc" ? "升序" : "降序"}`
    );
  });
}

function createDetailRowEntry(row, meta, duplicateCounts) {
  const issues = getRowAnomalies(row, {
    duplicateCount: duplicateCounts.get(createRowKey(row)) || 0,
  });

  return {
    entryKey: `${meta.sourceType}:${meta.itemKey || "base"}:${meta.rowIndex}`,
    row,
    issues,
    isAnomalous: Boolean(issues.length),
    ...meta,
  };
}

function getDetailRowEntries() {
  const duplicateCounts = buildDuplicateCountMap(getDisplayRows(), createRowKey);
  const baseEntries = workspaceState.baseRows.map((row, rowIndex) =>
    createDetailRowEntry(row, { sourceType: "base", rowIndex }, duplicateCounts)
  );
  const imageGroups = imageState.items.map((item, imageIndex) => ({
    item,
    imageIndex,
    entries: (item.rows || []).map((row, rowIndex) =>
      createDetailRowEntry(row, { sourceType: "image", rowIndex, itemKey: item.key, imageIndex }, duplicateCounts)
    ),
  }));

  return {
    baseEntries,
    imageGroups,
    flatEntries: [...baseEntries, ...imageGroups.flatMap((group) => group.entries)],
  };
}

function getVisibleDetailEntries(entries) {
  const filteredEntries = detailViewState.onlyAnomalies
    ? (entries || []).filter((entry) => entry.isAnomalous)
    : entries || [];
  return sortRowEntries(filteredEntries, detailViewState.sort);
}

function getItemIssueMessage(item) {
  if (item.status === "error") {
    return item.error || "结果需复查";
  }
  if (item.status === "done" && !(item.rows || []).length) {
    return "未提取到成交明细";
  }
  return "";
}

function appendParsedEmptyRow(message, colSpan = 7) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = colSpan;
  td.className = "empty-cell";
  td.textContent = message;
  tr.appendChild(td);
  elements.parsedSheetBody.appendChild(tr);
}

function appendParsedGroupRow(label, options = {}) {
  const tr = document.createElement("tr");
  tr.className = "group-row";
  const td = document.createElement("td");
  td.colSpan = 7;

  const header = document.createElement("div");
  header.className = "parsed-group-head";

  const title = document.createElement("div");
  title.className = "parsed-group-title";
  title.textContent = label;
  header.appendChild(title);

  if (options.previewKey) {
    const actions = document.createElement("div");
    actions.className = "parsed-group-actions";

    if (options.previewUrl) {
      const thumbButton = document.createElement("button");
      thumbButton.type = "button";
      thumbButton.className = "parsed-group-thumb";
      thumbButton.dataset.action = "preview";
      thumbButton.dataset.key = options.previewKey;
      thumbButton.setAttribute("aria-label", `${label} 预览原图`);

      const thumbImage = document.createElement("img");
      thumbImage.src = options.previewUrl;
      thumbImage.alt = `${label} 缩略图`;
      thumbButton.appendChild(thumbImage);
      actions.appendChild(thumbButton);
    }

    header.appendChild(actions);
  }

  td.appendChild(header);
  tr.appendChild(td);
  elements.parsedSheetBody.appendChild(tr);
}

function appendParsedSubtotalRow(label, rows) {
  const totals = calculateTotals(rows);
  const tr = document.createElement("tr");
  tr.className = "subtotal-row";

  [
    label,
    `${totals.count} 笔`,
    "",
    formatAbsolutePlainCompact(totals.netWeight, 4),
    "",
    formatAbsolutePlainCompact(totals.netAmount, 2),
    "",
  ].forEach((value) => {
    const td = document.createElement("td");
    td.textContent = value;
    tr.appendChild(td);
  });

  elements.parsedSheetBody.appendChild(tr);
}

function toDateInputValue(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function normalizeDecimalDraft(value) {
  let normalized = normalizeDigits(String(value || "")).replace(/[^\d.]/g, "");
  const firstDotIndex = normalized.indexOf(".");
  if (firstDotIndex >= 0) {
    normalized =
      normalized.slice(0, firstDotIndex + 1) +
      normalized
        .slice(firstDotIndex + 1)
        .replace(/\./g, "");
  }

  if (!normalized) {
    return "";
  }

  if (normalized.startsWith(".")) {
    normalized = `0${normalized}`;
  }

  return normalized;
}

function isValidDecimalDraft(value, { maxIntegers = 4, maxDecimals = 4 } = {}) {
  if (value === "") {
    return true;
  }

  const pattern = new RegExp(`^\\d{1,${maxIntegers}}(?:\\.\\d{0,${maxDecimals}})?$`);
  return pattern.test(value);
}

function sanitizeDecimalInput(value, options = {}, fallback = "") {
  const normalized = normalizeDecimalDraft(value);
  return isValidDecimalDraft(normalized, options) ? normalized : fallback;
}

function createMetaDataset(target, entry) {
  target.dataset.sourceType = entry.sourceType;
  target.dataset.rowIndex = String(entry.rowIndex);
  if (entry.itemKey) {
    target.dataset.itemKey = entry.itemKey;
  }
}

function createEditableCellButton(entry, field, text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "detail-cell-button";
  button.dataset.action = "edit-row";
  button.dataset.editField = field;
  button.title = "点击修改";
  createMetaDataset(button, entry);
  button.textContent = text;
  return button;
}

function createStaticCellText(text) {
  const span = document.createElement("span");
  span.className = "detail-cell-text";
  span.textContent = text;
  return span;
}

function appendDetailActionButtons(container, entry, actions) {
  const wrap = document.createElement("div");
  wrap.className = "row-action-buttons";

  actions.forEach(({ action, label, className = "secondary small", disabled = false }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.action = action;
    createMetaDataset(button, entry);
    button.disabled = disabled;
    button.textContent = label;
    wrap.appendChild(button);
  });

  container.appendChild(wrap);
}

function isEditingEntryField(entry, field) {
  return detailViewState.editingKey === entry.entryKey && detailViewState.editingField === field;
}

function canEditDetailEntry(entry) {
  return detailViewState.mode === "by-image" && entry.sourceType === "image";
}

function createInlineEditControl(entry, field) {
  if (field === "time") {
    const input = document.createElement("input");
    input.type = "date";
    input.className = "detail-inline-input";
    input.value = toDateInputValue(entry.row.time);
    input.dataset.field = field;
    createMetaDataset(input, entry);
    return input;
  }

  if (field === "direction") {
    const select = document.createElement("select");
    select.className = "detail-inline-select";
    select.dataset.field = field;
    createMetaDataset(select, entry);

    [
      ["buy", "委托买入"],
      ["sell", "委托卖出"],
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = entry.row.direction === value;
      select.appendChild(option);
    });

    return select;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.className = "detail-inline-input";
  input.dataset.field = field;
  createMetaDataset(input, entry);

  if (field === "weight") {
    input.value = sanitizeDecimalInput(entry.row.weight, { maxIntegers: 3, maxDecimals: 4 });
    input.placeholder = "0.0000";
    input.dataset.sanitize = "weight";
    input.dataset.lastValue = input.value;
  }

  if (field === "price") {
    input.value = sanitizeDecimalInput(entry.row.price, { maxIntegers: 5, maxDecimals: 2 });
    input.placeholder = "0.00";
    input.dataset.sanitize = "price";
    input.dataset.lastValue = input.value;
  }

  return input;
}

function appendEditableCell(cell, entry, field, text) {
  if (isEditingEntryField(entry, field)) {
    cell.classList.add("is-inline-editing");
    cell.appendChild(createInlineEditControl(entry, field));
    return;
  }

  if (canEditDetailEntry(entry)) {
    cell.appendChild(createEditableCellButton(entry, field, text));
    return;
  }

  cell.appendChild(createStaticCellText(text));
}

function appendParsedDataRow(entry, index) {
  const price = toNumber(entry.row.price);
  const signedWeight = getSignedWeightValue(entry.row);
  const signedAmount = getSignedAmountValue(entry.row);
  const isEditingRow = detailViewState.editingKey === entry.entryKey;
  const tr = document.createElement("tr");
  if (entry.isAnomalous) {
    tr.classList.add("is-anomaly");
    tr.title = entry.issues.join(" · ");
  }
  if (isEditingRow) {
    tr.classList.add("detail-edit-row");
  }

  const indexTd = document.createElement("td");
  indexTd.textContent = String(index);
  tr.appendChild(indexTd);

  const timeTd = document.createElement("td");
  appendEditableCell(timeTd, entry, "time", entry.row.time || "未识别");
  tr.appendChild(timeTd);

  const directionTd = document.createElement("td");
  appendEditableCell(directionTd, entry, "direction", getDirectionLabel(entry.row.direction));
  tr.appendChild(directionTd);

  const weightTd = document.createElement("td");
  appendEditableCell(weightTd, entry, "weight", formatAbsolutePlainCompact(signedWeight, 4));
  tr.appendChild(weightTd);

  const priceTd = document.createElement("td");
  appendEditableCell(priceTd, entry, "price", formatPlainCompact(price, 2));
  tr.appendChild(priceTd);

  const amountTd = document.createElement("td");
  amountTd.textContent = formatAbsolutePlainCompact(signedAmount, 2);
  tr.appendChild(amountTd);

  const actionTd = document.createElement("td");
  actionTd.className = "detail-actions-cell";

  if (entry.issues.length && !isEditingRow) {
    const issueWrap = document.createElement("div");
    issueWrap.className = "row-issue-list";
    entry.issues.forEach((issue) => {
      const badge = document.createElement("span");
      badge.className = "row-issue-badge";
      badge.textContent = issue;
      issueWrap.appendChild(badge);
    });
    actionTd.appendChild(issueWrap);
  }

  if (!isEditingRow && canEditDetailEntry(entry)) {
    appendDetailActionButtons(actionTd, entry, [
      { action: "delete-row", label: "删除", className: "secondary danger small", disabled: imageState.processing },
    ]);
  }
  tr.appendChild(actionTd);
  elements.parsedSheetBody.appendChild(tr);
}

function findImageItemByKey(key) {
  return imageState.items.find((item) => item.key === key) || null;
}

function getRowStoreByMeta(meta) {
  if (meta.sourceType === "base") {
    return workspaceState.baseRows;
  }

  if (meta.sourceType === "image") {
    return findImageItemByKey(meta.itemKey)?.rows || null;
  }

  return null;
}

function getRowByMeta(meta) {
  const store = getRowStoreByMeta(meta);
  if (!store) {
    return null;
  }

  return store[Number(meta.rowIndex)] || null;
}

function syncImageItemMetrics(item) {
  if (!item) {
    return;
  }

  item.extractedCount = (item.rows || []).length;
}

function normalizeDirectionInput(value, fallback = "buy") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["sell", "卖出", "委托卖出"].includes(normalized)) {
    return "sell";
  }
  if (["buy", "买入", "委托买入"].includes(normalized)) {
    return "buy";
  }
  return normalizeDirection(fallback);
}

function focusEditingField(meta, field = detailViewState.editingField || "time") {
  const selector = `[data-field="${field}"][data-source-type="${meta.sourceType}"][data-row-index="${meta.rowIndex}"]${meta.itemKey ? `[data-item-key="${meta.itemKey}"]` : ""}`;
  const target = elements.parsedSheetBody.querySelector(selector);

  if (!(target instanceof HTMLElement)) {
    return;
  }

  target.focus();
  if (field === "time" && typeof target.showPicker === "function") {
    target.showPicker();
  }
}

function setEditingRow(meta, field = "time") {
  const currentRow = getRowByMeta(meta);
  if (!currentRow) {
    setOcrStatus("未找到对应明细", "error");
    return;
  }

  detailViewState.editingKey = `${meta.sourceType}:${meta.itemKey || "base"}:${meta.rowIndex}`;
  detailViewState.editingField = field;
  update();
  window.requestAnimationFrame(() => {
    focusEditingField(meta, field);
  });
}

function clearEditingRow() {
  detailViewState.editingKey = null;
  detailViewState.editingField = null;
}

function readEditingRowValues(meta) {
  const currentRow = getRowByMeta(meta);
  if (!currentRow) {
    return null;
  }

  const selector = (field) =>
    `[data-field="${field}"][data-source-type="${meta.sourceType}"][data-row-index="${meta.rowIndex}"]${meta.itemKey ? `[data-item-key="${meta.itemKey}"]` : ""}`;

  const timeInput = elements.parsedSheetBody.querySelector(selector("time"));
  const directionInput = elements.parsedSheetBody.querySelector(selector("direction"));
  const weightInput = elements.parsedSheetBody.querySelector(selector("weight"));
  const priceInput = elements.parsedSheetBody.querySelector(selector("price"));

  return {
    time: timeInput?.value?.trim() || currentRow.time || "",
    direction: directionInput?.value || currentRow.direction || "buy",
    weight: weightInput?.value?.trim() || currentRow.weight || "",
    price: priceInput?.value?.trim() || currentRow.price || "",
  };
}

function saveEditedDetailRow(meta) {
  const currentRow = getRowByMeta(meta);
  if (!currentRow) {
    setOcrStatus("未找到对应明细", "error");
    return;
  }

  const values = readEditingRowValues(meta);
  const nextRow = createStructuredRow({
    time: values.time,
    direction: normalizeDirectionInput(values.direction, currentRow.direction),
    weight: values.weight,
    price: values.price,
  });

  if (!nextRow) {
    setOcrStatus("明细更新失败，请检查日期、克重和单价格式", "error");
    return;
  }

  const store = getRowStoreByMeta(meta);
  store[Number(meta.rowIndex)] = nextRow;

  if (meta.sourceType === "image") {
    syncImageItemMetrics(findImageItemByKey(meta.itemKey));
  }

  clearEditingRow();
  markWorkspaceDirty();
  update();
  setOcrStatus("已更新 1 笔明细");
}

function sanitizeInlineEditInput(target) {
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  if (target.dataset.sanitize === "weight") {
    const nextValue = sanitizeDecimalInput(
      target.value,
      { maxIntegers: 3, maxDecimals: 4 },
      target.dataset.lastValue || ""
    );
    target.value = nextValue;
    target.dataset.lastValue = nextValue;
  }

  if (target.dataset.sanitize === "price") {
    const nextValue = sanitizeDecimalInput(
      target.value,
      { maxIntegers: 5, maxDecimals: 2 },
      target.dataset.lastValue || ""
    );
    target.value = nextValue;
    target.dataset.lastValue = nextValue;
  }
}

function deleteDetailRow(meta) {
  const currentRow = getRowByMeta(meta);
  if (!currentRow) {
    setOcrStatus("未找到对应明细", "error");
    return;
  }

  if (!window.confirm("删除这笔明细后将无法恢复，是否继续？")) {
    return;
  }

  const store = getRowStoreByMeta(meta);
  store.splice(Number(meta.rowIndex), 1);

  if (meta.sourceType === "image") {
    syncImageItemMetrics(findImageItemByKey(meta.itemKey));
  }

  markWorkspaceDirty();
  update();
  setOcrStatus("已删除 1 笔明细");
}

function openImageLightbox(key) {
  const item = imageState.items.find((entry) => entry.key === key);
  if (!item) {
    return;
  }

  elements.lightboxImage.src = item.previewUrl;
  elements.lightboxImage.alt = item.file?.name || "截图放大预览";
  elements.lightbox.classList.remove("is-hidden");
  elements.lightbox.setAttribute("aria-hidden", "false");
}

function closeImageLightbox() {
  elements.lightbox.classList.add("is-hidden");
  elements.lightbox.setAttribute("aria-hidden", "true");
  elements.lightboxImage.removeAttribute("src");
}

function setDropzoneActive(isActive) {
  elements.imageDropzone.classList.toggle("drag-over", isActive);
}

async function recognizeOneImage(item, index, total) {
  item.status = "processing";
  item.error = "";
  item.rawText = "";
  item.extractedCount = 0;
  item.skippedCount = 0;
  item.structuredRecords = [];
  item.reviewRecords = [];
  update();

  const { rawText, structuredResult } = await recognizeImageContent(item.file, index, total);

  item.rawText = rawText;
  item.rows = structuredResult.rows || [];
  item.extractedCount = structuredResult.extractedCount;
  item.skippedCount = structuredResult.skippedCount;
  item.structuredRecords = structuredResult.records || [];
  item.reviewRecords = structuredResult.reviewRecords || [];

  if (!rawText) {
    item.status = "error";
    item.error = "未识别出有效文字，建议裁剪后重试";
    return;
  }

  if (!structuredResult.text) {
    item.status = "error";
    item.error = "识别到了文字，但没整理出克重和单价";
    return;
  }

  item.status = "done";
  item.error = "";
}

async function recognizeSelectedImage(keys) {
  const targetItems = keys?.length
    ? imageState.items.filter((item) => keys.includes(item.key))
    : imageState.items;

  if (!targetItems.length) {
    setOcrStatus("请先上传至少一张交易截图", "error");
    return;
  }

  const engineState = await detectOcrEngine();
  if (!engineState.available && !window.Tesseract) {
    setOcrStatus("识别组件不可用。请启动本地 Python OCR 服务，或联网后刷新以启用浏览器识别", "error");
    return;
  }

  try {
    imageState.processing = true;
    markWorkspaceDirty();
    elements.recognizeImage.disabled = true;

    for (let index = 0; index < targetItems.length; index += 1) {
      await recognizeOneImage(targetItems[index], index, targetItems.length);
      update();
    }

    const stats = computeQueueStats();
    if (!rebuildTextFromQueue().length && !workspaceState.baseRows.length) {
      setOcrStatus("图片已识别，但没有提取到可读文本，建议裁剪后重试", "error");
      return;
    }

    const skippedText = stats.skipped ? `，跳过 ${stats.skipped} 笔` : "";
    const errorText = stats.error ? `，${stats.error} 张需复查` : "";
    setOcrStatus(`识别完成，共处理 ${targetItems.length} 张截图，整理出 ${stats.extracted} 笔成交${skippedText}${errorText}`);
  } catch (error) {
    setOcrStatus(`识别失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
  } finally {
    imageState.processing = false;
    elements.recognizeImage.disabled = false;
    update();
  }
}

function removeImage(key) {
  const target = imageState.items.find((item) => item.key === key);
  if (!target) {
    return;
  }

  revokeImagePreview(target);
  imageState.items = imageState.items.filter((item) => item.key !== key);
  markWorkspaceDirty();
  update();

  if (!imageState.items.length && !workspaceState.baseRows.length) {
    setOcrStatus("等待导入截图");
    return;
  }

  setOcrStatus(`已删除 1 张截图，当前剩余 ${imageState.items.length} 张`);
}

function clearRecognitionResults() {
  imageState.items = imageState.items.map((item) => ({
    ...item,
    status: "queued",
    rawText: "",
    rows: [],
    extractedCount: 0,
    skippedCount: 0,
    error: "",
  }));
  markWorkspaceDirty();
  update();
  setOcrStatus(imageState.items.length ? "已清空识别结果，队列仍保留" : "已清空识别结果");
}

function clearImageSelection() {
  if (!imageState.items.length) {
    setOcrStatus(workspaceState.baseRows.length ? "当前统计批次无待处理截图" : "等待导入截图");
    return;
  }

  clearQueueItems();
  markWorkspaceDirty();
  update();
  setOcrStatus(workspaceState.baseRows.length ? "已清空待处理截图" : "等待导入截图");
}

function openBatchDatabase() {
  if (!window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BATCH_STORE)) {
        const store = db.createObjectStore(BATCH_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getStore(mode) {
  return workspaceState.db.transaction(BATCH_STORE, mode).objectStore(BATCH_STORE);
}

function getAllBatches() {
  if (!workspaceState.db) {
    return Promise.resolve([]);
  }

  return new Promise((resolve, reject) => {
    const request = getStore("readonly").getAll();
    request.onsuccess = () => {
      const rows = Array.isArray(request.result) ? request.result : [];
      rows.sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
      resolve(rows);
    };
    request.onerror = () => reject(request.error);
  });
}

function getBatchById(id) {
  if (!workspaceState.db || !id) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = getStore("readonly").get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function putBatch(record) {
  if (!workspaceState.db) {
    return Promise.reject(new Error("批次库不可用"));
  }

  return new Promise((resolve, reject) => {
    const request = getStore("readwrite").put(record);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteBatchRecord(id) {
  if (!workspaceState.db) {
    return Promise.reject(new Error("批次库不可用"));
  }

  return new Promise((resolve, reject) => {
    const request = getStore("readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function refreshBatchLibrary() {
  workspaceState.batches = await getAllBatches();
}

function createBatchRecord(rows, existingRecord = null, name = "") {
  const summary = buildBatchSummary(rows);
  const dailySummary = buildDailySummaryFromRows(rows);
  const now = new Date().toISOString();
  const batchName = String(name || getSuggestedBatchName()).trim() || defaultBatchName();

  return {
    id: existingRecord?.id || state.currentBatchId || createBatchId(),
    name: batchName,
    createdAt: existingRecord?.createdAt || state.currentBatchCreatedAt || now,
    updatedAt: now,
    rows: cloneRows(rows),
    summary,
    dailySummary,
  };
}

function hasWorkspaceContent() {
  return Boolean(workspaceState.baseRows.length || imageState.items.length);
}

async function saveCurrentBatch(options = {}) {
  const { forceNew = false } = options;
  const rows = getDisplayRows();
  if (!rows.length) {
    setOcrStatus("当前没有可保存的成交数据", "error");
    return;
  }

  if (!workspaceState.db) {
    setOcrStatus("当前浏览器不支持本地批次库", "error");
    return;
  }

  const existingRecord = !forceNew && state.currentBatchId ? await getBatchById(state.currentBatchId) : null;
  const suggestedName = forceNew
    ? defaultDuplicateBatchName(state.currentBatchName)
    : existingRecord?.name || getSuggestedBatchName();
  const batchName = existingRecord ? existingRecord.name : promptBatchName(suggestedName);
  if (batchName === null || !batchName) {
    return;
  }

  const record = createBatchRecord(rows, existingRecord, batchName);

  await putBatch(record);
  await refreshBatchLibrary();

  state.currentBatchId = record.id;
  state.currentBatchName = record.name;
  state.currentBatchCreatedAt = record.createdAt;
  state.currentBatchUpdatedAt = record.updatedAt;
  workspaceState.baseRows = cloneRows(record.rows);
  workspaceState.dirty = false;
  clearQueueItems();
  update();
  setOcrStatus(existingRecord ? `已更新批次：${record.name}` : `已保存批次：${record.name}`);
}

async function openBatchIntoWorkspace(id, { silent = false } = {}) {
  if (id === state.currentBatchId && !workspaceState.dirty && !imageState.items.length) {
    setHistoryDrawerOpen(false);
    if (!silent) {
      setOcrStatus(`已回到当前批次：${state.currentBatchName}`);
    }
    return;
  }

  const batch = await getBatchById(id);
  if (!batch) {
    setOcrStatus("未找到对应统计批次", "error");
    return;
  }

  clearQueueItems();
  workspaceState.baseRows = cloneRows(batch.rows);
  state.currentBatchId = batch.id;
  state.currentBatchName = batch.name;
  state.currentBatchCreatedAt = batch.createdAt || "";
  state.currentBatchUpdatedAt = batch.updatedAt || "";
  workspaceState.dirty = false;
  update();
  setHistoryDrawerOpen(false);

  if (!silent) {
    setOcrStatus(`已打开统计批次：${batch.name}`);
  }
}

async function mergeBatchIntoWorkspace(id) {
  const batch = await getBatchById(id);
  if (!batch) {
    setOcrStatus("未找到对应统计批次", "error");
    return;
  }

  const existingKeys = new Set(getDisplayRows().map(createRowKey));
  const rowsToAdd = cloneRows(batch.rows).filter((row) => !existingKeys.has(createRowKey(row)));
  workspaceState.baseRows = [...workspaceState.baseRows, ...rowsToAdd];
  workspaceState.dirty = true;
  update();
  setHistoryDrawerOpen(false);
  setOcrStatus(`已合并统计批次：${batch.name}，新增 ${rowsToAdd.length} 笔`);
}

async function renameBatch(id) {
  const batch = await getBatchById(id);
  if (!batch) {
    setOcrStatus("未找到对应统计批次", "error");
    return;
  }

  const nextName = window.prompt("输入新的统计批次名称", batch.name);
  if (nextName === null) {
    return;
  }

  const trimmed = nextName.trim();
  if (!trimmed) {
    setOcrStatus("统计批次名称不能为空", "error");
    return;
  }

  const updated = {
    ...batch,
    name: trimmed,
    updatedAt: new Date().toISOString(),
  };

  await putBatch(updated);
  await refreshBatchLibrary();

  if (state.currentBatchId === id) {
    state.currentBatchName = trimmed;
    state.currentBatchUpdatedAt = updated.updatedAt;
    workspaceState.dirty = false;
  }

  update();
  setOcrStatus(`已重命名统计批次：${trimmed}`);
}

async function removeBatchFromLibrary(id) {
  const batch = await getBatchById(id);
  if (!batch) {
    setOcrStatus("未找到对应统计批次", "error");
    return;
  }

  if (!window.confirm(`删除统计批次“${batch.name}”后将无法恢复，是否继续？`)) {
    return;
  }

  await deleteBatchRecord(id);
  await refreshBatchLibrary();

  if (state.currentBatchId === id) {
    state.currentBatchId = null;
    state.currentBatchUpdatedAt = "";
    workspaceState.dirty = true;
  }

  update();
  setOcrStatus(`已删除统计批次：${batch.name}`);
}

function resetWorkspace() {
  clearQueueItems();
  workspaceState.baseRows = [];
  workspaceState.dirty = false;
  state.currentBatchId = null;
  state.currentBatchCreatedAt = "";
  state.currentBatchUpdatedAt = "";
  state.currentBatchName = defaultBatchName();
  update();
}

function createNewBatch() {
  if (hasWorkspaceContent() && !window.confirm("新建整理台会清空当前工作区，是否继续？")) {
    return;
  }

  resetWorkspace();
  setHistoryDrawerOpen(false);
  setOcrStatus("已新建空白整理台");
}

function getChartCanvasEntries() {
  return [
    ["amount", elements.chartAmount],
    ["average", elements.chartAverage],
    ["weight", elements.chartWeight],
    ["distribution", elements.chartDistribution],
  ];
}

function destroyChart(key) {
  const instance = chartState.instances[key];
  if (instance) {
    instance.destroy();
    delete chartState.instances[key];
  }
}

function setChartEmpty(canvas, isEmpty) {
  const shell = canvas.closest(".chart-shell");
  shell?.classList.toggle("is-empty", isEmpty);
}

const CHART_COLOR_PRIMARY = "#3b82f6";
const CHART_COLOR_PRIMARY_FILL = "rgba(59, 130, 246, 0.7)";
const CHART_COLOR_SECONDARY = "#10b981";
const CHART_COLOR_SECONDARY_FILL = "rgba(16, 185, 129, 0.7)";

function buildChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(31, 41, 55, 0.95)",
        titleColor: "#ffffff",
        bodyColor: "#ffffff",
        cornerRadius: 8,
        padding: 10,
        displayColors: false,
        titleFont: { size: 12 },
        bodyFont: { size: 13 },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { 
          color: "#6b7280", 
          maxRotation: 0, 
          autoSkip: true, 
          padding: 8,
          font: { size: 11 }
        },
        border: { display: false },
      },
      y: {
        grid: { 
          color: "rgba(31, 41, 55, 0.06)",
          drawBorder: false,
        },
        ticks: {
          color: "#6b7280",
          padding: 6,
          font: { size: 11 },
          callback: (value) => Number(value).toLocaleString("zh-CN"),
        },
        border: { display: false },
      },
    },
  };
}

function getFiniteChartValues(values) {
  return values.filter((value) => Number.isFinite(value));
}

function buildTightYAxisRange(values, { paddingRatio = 0.08, minSpan = 10 } = {}) {
  const numericValues = getFiniteChartValues(values);
  if (!numericValues.length) {
    return null;
  }

  const minValue = Math.min(...numericValues);
  const maxValue = Math.max(...numericValues);
  const span = maxValue - minValue;
  const padding = Math.max(span * paddingRatio, minSpan);

  if (span === 0) {
    return {
      min: Math.max(0, minValue - padding),
      max: maxValue + padding,
    };
  }

  return {
    min: Math.max(0, minValue - padding),
    max: maxValue + padding,
  };
}

function getNiceStep(value) {
  if (value <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }
  if (normalized <= 2) {
    return 2 * magnitude;
  }
  if (normalized <= 5) {
    return 5 * magnitude;
  }
  return 10 * magnitude;
}

function buildRoundedYAxisRange(values, { tickCount = 5, paddingRatio = 0.08, minSpan = 10 } = {}) {
  const range = buildTightYAxisRange(values, { paddingRatio, minSpan });
  if (!range) {
    return null;
  }

  const rawSpan = Math.max(range.max - range.min, minSpan);
  const step = getNiceStep(rawSpan / tickCount);
  const min = Math.max(0, Math.floor(range.min / step) * step);
  const max = Math.ceil(range.max / step) * step;

  return {
    min,
    max,
    step,
  };
}

function renderChartWithDatasets(key, canvas, { type, labels, datasets, options }) {
  if (!labels.length || !datasets.length) {
    destroyChart(key);
    if (canvas) {
      setChartEmpty(canvas, true);
    }
    return;
  }

  renderSingleChart(key, canvas, {
    type,
    data: { labels, datasets },
    options,
  });
}

function renderSingleChart(key, canvas, config) {
  const ChartClass = window.Chart;
  if (!ChartClass || !canvas || !config.data.labels.length) {
    destroyChart(key);
    if (canvas) {
      setChartEmpty(canvas, true);
    }
    return;
  }

  setChartEmpty(canvas, false);
  destroyChart(key);
  chartState.instances[key] = new ChartClass(canvas, config);
}

function renderCharts() {
  const rows = getDisplayRows();
  const dailyRows = buildDailySummaryFromRows(rows);
  const distributionRows = buildPriceDistribution(rows);
  const options = buildChartOptions();
  const dailyLabels = dailyRows.map((row) => row.label);
  const distributionLabels = distributionRows.map((row) => row.label);
  const buyDailyWeights = dailyRows.map((row) => Number(row.buyWeight.toFixed(4)));
  const sellDailyWeights = dailyRows.map((row) => Number(row.sellWeight.toFixed(4)));
  const buyAverageValues = dailyRows.map((row) => (row.buyWeight > 0 ? Number(row.buyAvgPrice.toFixed(2)) : null));
  const sellAverageValues = dailyRows.map((row) => (row.sellWeight > 0 ? Number(row.sellAvgPrice.toFixed(2)) : null));
  const buyDistributionValues = distributionRows.map((row) => Number(row.buyWeight.toFixed(4)));
  const sellDistributionValues = distributionRows.map((row) => Number(row.sellWeight.toFixed(4)));
  const averageRange = buildRoundedYAxisRange([
    ...getFiniteChartValues(buyAverageValues),
    ...getFiniteChartValues(sellAverageValues),
  ]);

  renderChartWithDatasets("amount", elements.chartAmount, {
    type: "bar",
    labels: dailyLabels,
    datasets: [
      {
        label: "买入成交克重",
        data: buyDailyWeights,
        backgroundColor: CHART_COLOR_PRIMARY_FILL,
        borderColor: CHART_COLOR_PRIMARY,
        borderWidth: 1,
        borderRadius: 6,
        maxBarThickness: 36,
        borderSkipped: false,
      },
    ],
    options: {
      ...options,
      plugins: {
        ...options.plugins,
        legend: {
          display: true,
          position: "bottom",
          labels: {
            color: "#6b7280",
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
            padding: 12,
          },
        },
      },
      scales: {
        ...options.scales,
        y: {
          ...options.scales.y,
          beginAtZero: true,
        },
      },
    },
  });

  const averageDatasets = [];
  if (getFiniteChartValues(buyAverageValues).length) {
    averageDatasets.push({
      label: "买入均价",
      data: buyAverageValues,
      borderColor: CHART_COLOR_PRIMARY,
      borderWidth: 2,
      backgroundColor: CHART_COLOR_PRIMARY_FILL,
      pointRadius: 2,
      pointHoverRadius: 3,
      pointBackgroundColor: "#ffffff",
      pointBorderWidth: 2,
      tension: 0.24,
      fill: false,
      spanGaps: true,
    });
  }
  if (getFiniteChartValues(sellAverageValues).length) {
    averageDatasets.push({
      label: "卖出均价",
      data: sellAverageValues,
      borderColor: CHART_COLOR_SECONDARY,
      borderWidth: 2,
      backgroundColor: CHART_COLOR_SECONDARY_FILL,
      pointRadius: 2,
      pointHoverRadius: 3,
      pointBackgroundColor: "#ffffff",
      pointBorderWidth: 2,
      tension: 0.24,
      fill: false,
      spanGaps: true,
      borderDash: [6, 4],
    });
  }
  renderChartWithDatasets("average", elements.chartAverage, {
    type: "line",
    labels: dailyLabels,
    datasets: averageDatasets,
    options: {
      ...options,
      plugins: {
        ...options.plugins,
        legend: {
          display: averageDatasets.length > 0,
          position: "bottom",
          labels: {
            color: "#6b7280",
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
            padding: 12,
          },
        },
      },
      scales: {
        ...options.scales,
        y: {
          ...options.scales.y,
          beginAtZero: false,
          min: averageRange?.min,
          max: averageRange?.max,
          ticks: {
            ...options.scales.y.ticks,
            stepSize: averageRange?.step,
          },
        },
      },
    },
  });

  renderChartWithDatasets("weight", elements.chartWeight, {
    type: "bar",
    labels: dailyLabels,
    datasets: [
      {
        label: "卖出成交克重",
        data: sellDailyWeights,
        backgroundColor: CHART_COLOR_SECONDARY_FILL,
        borderColor: CHART_COLOR_SECONDARY,
        borderWidth: 1,
        borderRadius: 6,
        maxBarThickness: 36,
        borderSkipped: false,
      },
    ],
    options: {
      ...options,
      plugins: {
        ...options.plugins,
        legend: {
          display: true,
          position: "bottom",
          labels: {
            color: "#6b7280",
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
            padding: 12,
          },
        },
      },
      scales: {
        ...options.scales,
        y: {
          ...options.scales.y,
          beginAtZero: true,
        },
      },
    },
  });

  const distributionDatasets = [];
  if (buyDistributionValues.some((value) => value > 0)) {
    distributionDatasets.push({
      label: "买入克重",
      data: buyDistributionValues,
      backgroundColor: CHART_COLOR_PRIMARY_FILL,
      borderRadius: 6,
      maxBarThickness: 32,
      borderSkipped: false,
    });
  }
  if (sellDistributionValues.some((value) => value > 0)) {
    distributionDatasets.push({
      label: "卖出克重",
      data: sellDistributionValues,
      backgroundColor: CHART_COLOR_SECONDARY_FILL,
      borderRadius: 6,
      maxBarThickness: 32,
      borderSkipped: false,
    });
  }
  renderChartWithDatasets("distribution", elements.chartDistribution, {
    type: "bar",
    labels: distributionLabels,
    datasets: distributionDatasets,
    options: {
      ...options,
      plugins: {
        ...options.plugins,
        legend: {
          display: distributionDatasets.length > 0,
          position: "bottom",
          labels: {
            color: "#6b7280",
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
            padding: 12,
          },
        },
      },
      scales: {
        ...options.scales,
        y: {
          ...options.scales.y,
          beginAtZero: true,
        },
      },
    },
  });
}

function renderQueueSummary() {
  const stats = computeQueueStats();
  elements.queueTotalImages.textContent = String(stats.total);
  elements.queueDoneImages.textContent = String(stats.done);
  elements.queueExtractedRows.textContent = String(stats.extracted);
}

function renderImageQueue() {
  if (!imageState.items.length) {
    elements.imagePreview.classList.add("is-empty");
    elements.imagePreview.innerHTML = "暂无截图";
    return;
  }

  elements.imagePreview.classList.remove("is-empty");
  elements.imagePreview.innerHTML = "";

  imageState.items.forEach((item, index) => {
    const article = document.createElement("article");
    article.className = "queue-item";
    article.dataset.status = item.status;

    const thumbButton = document.createElement("button");
    thumbButton.type = "button";
    thumbButton.className = "queue-thumb";
    thumbButton.dataset.action = "preview";
    thumbButton.dataset.key = item.key;

    const image = document.createElement("img");
    image.src = item.previewUrl;
    image.alt = `交易截图预览 ${index + 1}`;
    thumbButton.appendChild(image);

    const main = document.createElement("div");
    main.className = "queue-main";

    const title = document.createElement("p");
    title.className = "queue-title";
    title.textContent = `截图 ${index + 1}`;

    const summary = document.createElement("p");
    summary.className = `queue-summary${item.status === "error" ? " error" : ""}`;
    if (item.status === "queued") {
      summary.textContent = "尚未识别";
    } else if (item.status === "processing") {
      summary.textContent = "正在识别";
    } else if (item.status === "done") {
      summary.textContent = item.skippedCount
        ? `成交 ${item.extractedCount} 笔 · 跳过 ${item.skippedCount} 笔`
        : `成交 ${item.extractedCount} 笔`;
    } else {
      summary.textContent = item.error || "结果需复查";
    }

    main.appendChild(title);
    main.appendChild(summary);

    const badge = document.createElement("span");
    badge.className = `status-badge ${item.status}`;
    badge.textContent = STATUS_LABELS[item.status];

    const actions = document.createElement("div");
    actions.className = "queue-actions";

    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "secondary small";
    retryButton.dataset.action = "retry";
    retryButton.dataset.key = item.key;
    retryButton.disabled = imageState.processing;
    retryButton.textContent = item.status === "done" ? "重识别" : "识别";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "secondary danger small";
    removeButton.dataset.action = "remove";
    removeButton.dataset.key = item.key;
    removeButton.disabled = imageState.processing;
    removeButton.textContent = "删除";

    actions.appendChild(retryButton);
    actions.appendChild(removeButton);

    article.appendChild(thumbButton);
    article.appendChild(main);
    article.appendChild(badge);
    article.appendChild(actions);
    elements.imagePreview.appendChild(article);
  });
}

function renderBatchState() {
  const rows = getDisplayRows();
  const totals = calculateTotals(rows);
  const pendingText = imageState.items.length ? ` · ${imageState.items.length} 张截图待整理` : "";
  const isLinkedBatch = Boolean(state.currentBatchId);

  elements.workspaceTitle.textContent = hasWorkspaceContent() || state.currentBatchId ? getSuggestedBatchName() : "空白整理台";

  if (!workspaceState.db) {
    elements.batchMetaCopy.textContent = "当前浏览器不支持本地批次库";
  } else if (isLinkedBatch) {
    elements.batchMetaCopy.textContent = workspaceState.dirty ? `已连接历史批次 · 有未保存更新${pendingText}` : `已连接历史批次${pendingText}`;
  } else {
    elements.batchMetaCopy.textContent = hasWorkspaceContent() ? `未保存到历史库${pendingText}` : "当前整理台为空";
  }

  if (!rows.length && !imageState.items.length) {
    elements.workspaceRecordCopy.textContent = "从截图识别、核对明细，到这里查看本次结果。";
    return;
  }

  if (!rows.length) {
    elements.workspaceRecordCopy.textContent = `${imageState.items.length} 张截图已导入，等待识别结果进入本次整理。`;
    return;
  }

  const detailParts = [
    `${rows.length} 笔记录`,
    `买入 ${formatWeight(totals.buyWeight)}`,
    `卖出 ${formatWeight(totals.sellWeight)}`,
  ];
  if (imageState.items.length) {
    detailParts.push(`${imageState.items.length} 张截图队列`);
  }
  elements.workspaceRecordCopy.textContent = detailParts.join(" · ");
}

function renderBatchLibrary() {
  if (!workspaceState.db) {
    elements.batchLibrary.classList.add("is-empty");
    elements.batchLibrary.innerHTML = "当前浏览器不支持本地批次库";
    return;
  }

  if (!workspaceState.batches.length) {
    elements.batchLibrary.classList.add("is-empty");
    elements.batchLibrary.innerHTML = "暂无历史统计批次";
    return;
  }

  elements.batchLibrary.classList.remove("is-empty");
  elements.batchLibrary.innerHTML = "";

  workspaceState.batches.forEach((batch) => {
    const isCurrentBatch = batch.id === state.currentBatchId;
    const item = document.createElement("article");
    item.className = `batch-item${isCurrentBatch ? " active" : ""}`;

    const main = document.createElement("div");
    main.className = "batch-item-main";

    const titleRow = document.createElement("div");
    titleRow.className = "batch-item-title-row";

    const title = document.createElement("h4");
    title.textContent = batch.name;
    titleRow.appendChild(title);

    if (isCurrentBatch) {
      const badge = document.createElement("span");
      badge.className = "batch-item-badge";
      badge.textContent = workspaceState.dirty ? "当前批次 · 待更新" : "当前批次";
      titleRow.appendChild(badge);
    }

    const summary = batch.summary || buildBatchSummary(batch.rows || []);
    const savedAt = formatDateTime(batch.updatedAt || batch.createdAt || "");
    const meta = document.createElement("p");
    meta.className = "batch-item-meta";
    meta.textContent = savedAt ? `保存时间 ${savedAt}` : "保存时间未记录";

    const stats = document.createElement("p");
    stats.className = "batch-item-stats";
    stats.textContent = `买入 ${formatWeight(summary.buyWeight)} · 卖出 ${formatWeight(summary.sellWeight)} · ${summary.count || 0} 笔记录`;

    main.appendChild(titleRow);
    main.appendChild(meta);
    main.appendChild(stats);

    const actions = document.createElement("div");
    actions.className = "batch-item-actions";

    [
      ["open", isCurrentBatch ? "继续整理" : "打开"],
      ["merge", "合并"],
      ["rename", "重命名"],
      ["delete", "删除"],
    ].forEach(([action, label], index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        action === "delete"
          ? "secondary danger small"
          : index === 0
            ? "small"
            : "secondary small";
      button.dataset.action = `${action}-batch`;
      button.dataset.batchId = batch.id;
      button.disabled = imageState.processing || (isCurrentBatch && action === "merge");
      button.textContent = label;
      actions.appendChild(button);
    });

    item.appendChild(main);
    item.appendChild(actions);
    elements.batchLibrary.appendChild(item);
  });
}

function renderParsedSheet() {
  const rows = getDisplayRows();
  const { baseEntries, imageGroups, flatEntries } = getDetailRowEntries();
  let footerRows = rows;
  elements.parsedSheetBody.innerHTML = "";
  elements.parsedSheetFoot.innerHTML = "";
  elements.parsedAmountHead.textContent = "成交金额(元)";

  if (!flatEntries.length && detailViewState.mode !== "by-image") {
    appendParsedEmptyRow("暂无识别明细");
    return;
  }

  if (!flatEntries.length && detailViewState.mode === "by-image" && !imageState.items.length) {
    appendParsedEmptyRow("暂无识别明细");
    return;
  }

  if (detailViewState.mode === "by-image") {
    let rowNumber = 1;
    let hasVisibleContent = false;

    const visibleBaseEntries = getVisibleDetailEntries(baseEntries);
    footerRows = detailViewState.onlyAnomalies
      ? [
          ...visibleBaseEntries.map((entry) => entry.row),
          ...imageGroups.flatMap((group) => getVisibleDetailEntries(group.entries).map((entry) => entry.row)),
        ]
      : rows;

    if (visibleBaseEntries.length) {
      hasVisibleContent = true;
      appendParsedGroupRow(
        `已载入记录 · ${visibleBaseEntries.length} 笔${detailViewState.onlyAnomalies ? "异常明细" : "（非本次截图）"}`
      );
      visibleBaseEntries.forEach((entry) => {
        appendParsedDataRow(entry, rowNumber);
        rowNumber += 1;
      });
      appendParsedSubtotalRow("已载入记录小计", visibleBaseEntries.map((entry) => entry.row));
    }

    imageGroups.forEach(({ item, imageIndex, entries }) => {
      const statusLabel = STATUS_LABELS[item.status] || "待识别";
      const visibleEntries = getVisibleDetailEntries(entries);
      const issueMessage = getItemIssueMessage(item);
      const shouldShowGroup =
        visibleEntries.length ||
        (!detailViewState.onlyAnomalies && !(item.rows || []).length) ||
        (detailViewState.onlyAnomalies && Boolean(issueMessage));

      if (!shouldShowGroup) {
        return;
      }

      hasVisibleContent = true;

      const anomalySuffix = detailViewState.onlyAnomalies && visibleEntries.length
        ? ` · 异常 ${visibleEntries.length} 笔`
        : item.rows?.length
          ? ` · ${item.rows.length} 笔`
          : "";
      const groupTitle = `截图 ${imageIndex + 1} · ${statusLabel}${anomalySuffix}`;
      appendParsedGroupRow(groupTitle, {
        previewKey: item.key,
        previewUrl: item.previewUrl,
      });

      if (visibleEntries.length) {
        visibleEntries.forEach((entry) => {
          appendParsedDataRow(entry, rowNumber);
          rowNumber += 1;
        });
        appendParsedSubtotalRow(`截图 ${imageIndex + 1} 小计`, visibleEntries.map((entry) => entry.row));
      }

      if (!visibleEntries.length) {
        const messageMap = {
          queued: "尚未识别",
          processing: "正在识别",
          done: "未提取到成交明细",
          error: item.error || "结果需复查",
        };
        appendParsedEmptyRow(issueMessage || messageMap[item.status] || "暂无识别结果");
      }
    });

    if (!hasVisibleContent) {
      appendParsedEmptyRow(detailViewState.onlyAnomalies ? "暂无异常明细" : "暂无识别明细");
      return;
    }
  } else {
    const visibleFlatEntries = getVisibleDetailEntries(flatEntries);
    if (!visibleFlatEntries.length) {
      appendParsedEmptyRow(detailViewState.onlyAnomalies ? "暂无异常明细" : "暂无识别明细");
      return;
    }

    footerRows = visibleFlatEntries.map((entry) => entry.row);
    visibleFlatEntries.forEach((entry, index) => {
      appendParsedDataRow(entry, index + 1);
    });
  }

  const totals = calculateTotals(footerRows);
  const footRow = document.createElement("tr");
  [
    "总计",
    `${totals.count} 笔`,
    "",
    formatAbsolutePlainCompact(totals.netWeight, 4),
    "",
    formatAbsolutePlainCompact(totals.netAmount, 2),
    "",
  ].forEach((value) => {
    const td = document.createElement("td");
    td.textContent = value;
    footRow.appendChild(td);
  });
  elements.parsedSheetFoot.appendChild(footRow);
}

function renderSummary() {
  const rows = getDisplayRows();
  const totals = calculateTotals(rows);
  const buyAvgText = totals.buyWeight > 0 ? formatUnitPrice(totals.buyAvgPrice) : "暂无";
  const sellAvgText = totals.sellWeight > 0 ? formatUnitPrice(totals.sellAvgPrice) : "暂无";

  elements.summaryBuyAvg.textContent = buyAvgText;
  elements.summarySellAvg.textContent = sellAvgText;
  elements.summaryBuyWeight.textContent = formatWeight(totals.buyWeight);
  elements.summarySellWeight.textContent = formatWeight(totals.sellWeight);
  elements.summaryBuyAmount.textContent = formatCurrency(totals.buyAmount);
  elements.summarySellAmount.textContent = formatCurrency(totals.sellAmount);
}

function renderReviewSheet() {
  const reviewRows = getTimeReviewRows();
  elements.reviewSheetBody.innerHTML = "";
  elements.reviewSheetFoot.innerHTML = "";

  if (!reviewRows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.className = "empty-cell";
    td.textContent = "暂无按成交日期复盘";
    tr.appendChild(td);
    elements.reviewSheetBody.appendChild(tr);
    return;
  }

  reviewRows.forEach((row) => {
    const tr = document.createElement("tr");
    [
      row.label,
      row.buyWeight.toFixed(4),
      row.sellWeight.toFixed(4),
      formatSignedPlain(row.netWeight, 4),
    ].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });
    elements.reviewSheetBody.appendChild(tr);
  });

  const totals = calculateTotals(getDisplayRows());
  const footRow = document.createElement("tr");

  [
    "总计",
    totals.buyWeight.toFixed(4),
    totals.sellWeight.toFixed(4),
    formatSignedPlain(totals.netWeight, 4),
  ].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
    footRow.appendChild(td);
  });

  elements.reviewSheetFoot.appendChild(footRow);
}

function renderActionStates() {
  const hasRows = Boolean(getDisplayRows().length);
  const saveLabel = getSaveBatchButtonLabel();
  elements.recognizeImage.disabled = imageState.processing || !imageState.items.length;
  elements.clearImage.disabled = imageState.processing || !imageState.items.length;
  elements.saveBatch.disabled = imageState.processing || !hasRows || !workspaceState.db;
  elements.saveBatch.textContent = saveLabel;
  elements.workspaceSaveBatch.disabled = imageState.processing || !hasRows || !workspaceState.db;
  elements.workspaceSaveBatch.textContent = state.currentBatchId ? "更新当前批次" : "保存到历史库";
  elements.workspaceSaveAsBatch.disabled = imageState.processing || !hasRows || !workspaceState.db;
  elements.newBatch.disabled = imageState.processing;
  elements.exportBatches.disabled = imageState.processing || !workspaceState.db || !workspaceState.batches.length;
  elements.importBatches.disabled = imageState.processing || !workspaceState.db;
  elements.detailOnlyAnomalies.checked = detailViewState.onlyAnomalies;
  renderDetailSortIndicators();
  elements.detailViewFlat.classList.toggle("active", detailViewState.mode === "flat");
  elements.detailViewByImage.classList.toggle("active", detailViewState.mode === "by-image");
}

function update() {
  renderBatchState();
  renderBatchLibrary();
  renderQueueSummary();
  renderImageQueue();
  renderParsedSheet();
  renderSummary();
  renderCharts();
  renderReviewSheet();
  renderActionStates();
  saveState();
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

function toPortableBatchRecord(batch) {
  const rows = normalizeBatchRows(batch?.rows || []);
  const createdAt = batch?.createdAt || new Date().toISOString();
  const updatedAt = batch?.updatedAt || createdAt;

  return {
    id: batch?.id || createBatchId(),
    name: normalizeLegacyBatchName(batch?.name) || defaultBatchName(),
    createdAt,
    updatedAt,
    rows,
    summary: batch?.summary || buildBatchSummary(rows),
    dailySummary: batch?.dailySummary || buildDailySummaryFromRows(rows),
  };
}

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportBatchData() {
  if (!workspaceState.db) {
    setOcrStatus("当前浏览器不支持本地批次库", "error");
    return;
  }

  if (!workspaceState.batches.length) {
    setOcrStatus("暂无可导出的历史批次", "error");
    return;
  }

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    batches: workspaceState.batches.map(toPortableBatchRecord),
  };
  const fileName = `${sanitizeFileName(`gold-batches-${formatDateTime(payload.exportedAt).replace(/[: ]/g, "-")}`)}.json`;
  downloadFile(fileName, JSON.stringify(payload, null, 2), "application/json");
  setOcrStatus(`已导出 ${workspaceState.batches.length} 个历史批次`);
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

async function importBatchData(file) {
  if (!file) {
    return;
  }

  if (!workspaceState.db) {
    setOcrStatus("当前浏览器不支持本地批次库", "error");
    return;
  }

  const rawText = await file.text();
  let parsed;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    setOcrStatus("批次数据不是有效的 JSON 文件", "error");
    return;
  }

  const records = parseImportedBatchPayload(parsed);
  if (!records.length) {
    setOcrStatus("JSON 文件中没有可导入的批次", "error");
    return;
  }

  for (const record of records) {
    await putBatch(toPortableBatchRecord(record));
  }

  await refreshBatchLibrary();
  update();
  setOcrStatus(`已导入 ${records.length} 个历史批次`);
}

















function bindEvents() {
  elements.imageInput.addEventListener("change", (event) => {
    addImageFiles(event.target.files);
  });

  elements.imageDropzone.addEventListener("click", () => {
    elements.imageInput.click();
  });

  elements.imageDropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elements.imageInput.click();
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.imageDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      setDropzoneActive(true);
    });
  });

  ["dragleave", "dragend"].forEach((eventName) => {
    elements.imageDropzone.addEventListener(eventName, () => {
      setDropzoneActive(false);
    });
  });

  elements.imageDropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    setDropzoneActive(false);
    addImageFiles(event.dataTransfer?.files);
  });

  elements.imagePreview.addEventListener("click", async (event) => {
    const target = event.target.closest("button[data-action]");
    if (!target) {
      return;
    }

    const { action, key } = target.dataset;
    if (action === "preview") {
      openImageLightbox(key);
      return;
    }

    if (imageState.processing) {
      return;
    }

    if (action === "remove") {
      removeImage(key);
      return;
    }

    if (action === "retry") {
      await recognizeSelectedImage([key]);
    }
  });

  elements.parsedSheetBody.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-action]");
    if (!target) {
      return;
    }

    if (target.dataset.action === "preview" && target.dataset.key) {
      openImageLightbox(target.dataset.key);
      return;
    }

    const meta = {
      sourceType: target.dataset.sourceType,
      rowIndex: target.dataset.rowIndex,
      itemKey: target.dataset.itemKey,
    };

    if (target.dataset.action === "edit-row") {
      setEditingRow(meta, target.dataset.editField || "time");
      return;
    }

    if (target.dataset.action === "delete-row") {
      deleteDetailRow(meta);
    }
  });

  elements.parsedSheetBody.addEventListener("input", (event) => {
    sanitizeInlineEditInput(event.target);
  });

  elements.parsedSheetBody.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const meta = {
      sourceType: target.dataset.sourceType,
      rowIndex: target.dataset.rowIndex,
      itemKey: target.dataset.itemKey,
    };

    if (event.key === "Enter" && target.dataset.field) {
      event.preventDefault();
      saveEditedDetailRow(meta);
      return;
    }

    if (event.key === "Escape" && target.dataset.field) {
      event.preventDefault();
      clearEditingRow();
      update();
    }
  });

  elements.lightbox.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action='close-lightbox']");
    if (target || event.target === elements.lightbox) {
      closeImageLightbox();
    }
  });

  elements.recognizeImage.addEventListener("click", async () => {
    await recognizeSelectedImage();
  });

  elements.clearImage.addEventListener("click", () => {
    clearImageSelection();
  });

  elements.detailOnlyAnomalies.addEventListener("change", (event) => {
    detailViewState.onlyAnomalies = event.target.checked;
    update();
  });

  elements.detailSortTime.addEventListener("click", () => {
    toggleDetailSort("time");
    update();
  });

  elements.detailSortWeight.addEventListener("click", () => {
    toggleDetailSort("weight");
    update();
  });

  elements.detailSortPrice.addEventListener("click", () => {
    toggleDetailSort("price");
    update();
  });

  elements.detailViewFlat.addEventListener("click", () => {
    clearEditingRow();
    detailViewState.mode = "flat";
    update();
  });

  elements.detailViewByImage.addEventListener("click", () => {
    clearEditingRow();
    detailViewState.mode = "by-image";
    update();
  });

  elements.openHistory.addEventListener("click", () => {
    setHistoryDrawerOpen(true);
  });

  elements.historyDrawer.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action='close-history']");
    if (target || event.target === elements.historyDrawer) {
      setHistoryDrawerOpen(false);
    }
  });

  elements.newBatch.addEventListener("click", () => {
    createNewBatch();
  });

  elements.saveBatch.addEventListener("click", async () => {
    await saveCurrentBatch();
  });

  elements.workspaceSaveBatch.addEventListener("click", async () => {
    await saveCurrentBatch();
  });

  elements.workspaceSaveAsBatch.addEventListener("click", async () => {
    await saveCurrentBatch({ forceNew: true });
  });

  elements.exportBatches.addEventListener("click", async () => {
    await exportBatchData();
  });

  elements.importBatches.addEventListener("click", () => {
    elements.importBatchFile.click();
  });

  elements.importBatchFile.addEventListener("change", async (event) => {
    const [file] = Array.from(event.target.files || []);
    event.target.value = "";
    try {
      await importBatchData(file);
    } catch (error) {
      setOcrStatus(`导入失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
    }
  });

  elements.batchLibrary.addEventListener("click", async (event) => {
    const target = event.target.closest("button[data-batch-id]");
    if (!target || imageState.processing) {
      return;
    }

    const batchId = target.dataset.batchId;
    const action = target.dataset.action;
    const isCurrentBatch = batchId === state.currentBatchId;

    if (action === "open-batch") {
      if (
        !isCurrentBatch &&
        (workspaceState.dirty || imageState.items.length) &&
        !window.confirm("打开历史统计批次会替换当前工作区，未保存的新结果将丢失，是否继续？")
      ) {
        return;
      }
      await openBatchIntoWorkspace(batchId);
      return;
    }

    if (action === "merge-batch") {
      await mergeBatchIntoWorkspace(batchId);
      return;
    }

    if (action === "rename-batch") {
      await renameBatch(batchId);
      return;
    }

    if (action === "delete-batch") {
      await removeBatchFromLibrary(batchId);
    }
  });

  document.addEventListener("paste", (event) => {
    const items = event.clipboardData?.items || [];
    const pastedFiles = [];

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          pastedFiles.push(file);
        }
      }
    }

    if (pastedFiles.length) {
      addImageFiles(pastedFiles);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.lightbox.classList.contains("is-hidden")) {
      closeImageLightbox();
      return;
    }

    if (event.key === "Escape" && isHistoryDrawerOpen()) {
      setHistoryDrawerOpen(false);
    }
  });
}

async function init() {
  loadState();

  if (window.Chart) {
    window.Chart.defaults.font.family = '"PingFang SC", "Hiragino Sans GB", "Source Han Sans SC", "Noto Sans CJK SC", "SF Pro Text", "Segoe UI", sans-serif';
    window.Chart.defaults.color = "#6b7280";
    window.Chart.defaults.font.size = 12;
  }

  workspaceState.db = await openBatchDatabase();
  await refreshBatchLibrary();

  bindEvents();

  if (!state.currentBatchName) {
    state.currentBatchName = defaultBatchName();
  }

  update();
}

init().catch((error) => {
  console.error(error);
  setOcrStatus("初始化失败，请刷新后重试", "error");
  update();
});
