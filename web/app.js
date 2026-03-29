import {
  DIRECTION_LABELS,
  STORAGE_KEY,
} from "./config.js";
import { createChartsApi } from "./charts.js";
import { createImageQueueApi } from "./capture/images.js";
import { createOcrApi } from "./capture/ocr.js";
import { createDetailsApi } from "./details.js";
import { elements } from "./elements.js";
import { bindAppEvents } from "./events.js";
import {
  attachEphemeralHistoryLifecycle,
  cleanupLegacyBrowserStorage,
  prepareEphemeralHistorySession,
} from "./history/ephemeral-session.js";
import { createHistoryApi } from "./history/index.js";
import { createBatchTransferApi } from "./history/transfer.js";
import { createWorkspaceUiApi } from "./workspace.js";
import { attachRuntimeSession } from "./runtime-session.js";
import {
  formatDay,
  formatSignedCurrency,
  formatSignedPlainCompact,
  formatSignedWeight,
  toNumber,
} from "./lib/formatters.js";
import {
  defaultBatchName,
} from "./lib/batch-utils.js";
import {
  createStructuredRow,
  extractDirectionFromText,
  extractTimeFromText,
  normalizeExtractedPriceValue,
  normalizeOcrText,
  parseNumericValue,
  reconcileTradeValues,
  roundNumericValue,
  sanitizeNumberText,
  serializeStructuredRow,
} from "./lib/ocr-utils.js";
import { normalizeDirection } from "./lib/row-utils.js";
import {
  chartState,
  detailViewState,
  imageState,
  ocrEngineState,
  state,
  workspaceState,
} from "./state.js";

const {
  addImageFiles,
  clearImageSelection,
  clearQueueItems,
  computeQueueStats,
  findImageItemByKey,
  closeImageLightbox,
  openImageLightbox,
  rebuildTextFromQueue,
  removeImage,
  renderImageQueue,
  renderQueueSummary,
  setDropzoneActive,
  syncImageItemMetrics,
} = createImageQueueApi({
  elements,
  imageState,
  markWorkspaceDirty,
  setOcrStatus,
  update,
  workspaceState,
});

const {
  createNewBatch,
  mergeBatchIntoWorkspace,
  openBatchDatabase,
  openBatchIntoWorkspace,
  putBatch,
  refreshBatchLibrary,
  removeBatchFromLibrary,
  renameBatch,
  saveCurrentBatch,
} = createHistoryApi({
  imageState,
  state,
  workspaceState,
  buildBatchSummary,
  buildDailySummaryFromRows,
  clearQueueItems,
  getDisplayRows,
  getSuggestedBatchName,
  promptBatchName,
  setHistoryDrawerOpen,
  setOcrStatus,
  update,
});

const {
  exportBatchData,
  exportSingleBatch,
  importBatchData,
} = createBatchTransferApi({
  buildBatchSummary,
  buildDailySummaryFromRows,
  putBatch,
  refreshBatchLibrary,
  setOcrStatus,
  update,
  workspaceState,
});

const {
  destroyChart,
  getChartCanvasEntries,
  renderCharts,
} = createChartsApi({
  chartState,
  elements,
  buildDailySummaryFromRows,
  buildPriceDistribution,
  getDisplayRows,
});

const { recognizeSelectedImage } = createOcrApi({
  computeQueueStats,
  deriveStructuredTextFromOcr,
  elements,
  imageState,
  markWorkspaceDirty,
  ocrEngineState,
  rebuildTextFromQueue,
  setOcrStatus,
  update,
  workspaceState,
});

const {
  clearEditingRow,
  clearLoadedRows,
  deleteDetailRow,
  renderDetailSortIndicators,
  renderParsedSheet,
  sanitizeInlineEditInput,
  saveEditedDetailRow,
  setEditingRow,
  toggleDetailSort,
} = createDetailsApi({
  calculateTotals,
  detailViewState,
  elements,
  findImageItemByKey,
  getDirectionLabel,
  getDisplayRows,
  imageState,
  markWorkspaceDirty,
  setOcrStatus,
  syncImageItemMetrics,
  update,
  workspaceState,
});

const {
  renderActionStates,
  renderBatchLibrary,
  renderBatchState,
  renderReviewSheet,
  renderSummary,
} = createWorkspaceUiApi({
  buildBatchSummary,
  calculateTotals,
  detailViewState,
  elements,
  getDisplayRows,
  getSaveBatchButtonLabel,
  getSuggestedBatchName,
  getTimeReviewRows,
  hasWorkspaceContent,
  imageState,
  renderDetailSortIndicators,
  state,
  workspaceState,
});

function getSuggestedBatchName() {
  if (state.currentBatchId) {
    const value = String(state.currentBatchName || "").trim();
    return value || defaultBatchName();
  }

  return defaultBatchName();
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
      detailSort: detailViewState.sort,
      detailViewMode: detailViewState.mode,
      detailOnlyAnomalies: detailViewState.onlyAnomalies,
    })
  );
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state.currentBatchName = "";
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.currentBatchId = null;
    state.currentBatchName = "";
    detailViewState.sort = parsed.detailSort || "time-desc";
    detailViewState.mode = parsed.detailViewMode || "flat";
    detailViewState.onlyAnomalies = Boolean(parsed.detailOnlyAnomalies);
  } catch {
    state.currentBatchId = null;
    state.currentBatchName = "";
    detailViewState.sort = "time-desc";
    detailViewState.mode = "flat";
    detailViewState.onlyAnomalies = false;
  }
}

function markWorkspaceDirty() {
  workspaceState.dirty = true;
}

function hasWorkspaceContent() {
  return Boolean(workspaceState.baseRows.length || imageState.items.length);
}

function hasSessionDataToProtect() {
  return Boolean(workspaceState.batches.length || hasWorkspaceContent());
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

function getDirectionLabel(value) {
  return DIRECTION_LABELS[normalizeDirection(value)];
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

function setRuntimeBridgeStatus({ connected, reason = "" } = {}) {
  if (!elements.runtimeBridgeStatus) {
    return;
  }

  if (connected || reason === "unsupported") {
    elements.runtimeBridgeStatus.textContent = "";
    elements.runtimeBridgeStatus.classList.add("is-hidden");
    return;
  }

  const message = reason === "expired"
    ? "本地服务会话已过期，当前页面可能是旧页面。请重新打开积存金复盘台.app 以恢复导出和原生文件保存。"
    : "当前页面已与本地服务断开。历史批次仍保留在浏览器本地，但导出和 Mac 原生文件保存可能不可用，请重新打开积存金复盘台.app。";

  elements.runtimeBridgeStatus.textContent = message;
  elements.runtimeBridgeStatus.classList.remove("is-hidden");
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

function getDisplayRows() {
  return [...workspaceState.baseRows, ...rebuildTextFromQueue()];
}

function getDisplaySourceLabel() {
  const queueStats = computeQueueStats();
  const batchLabel = state.currentBatchName || "当前批次";
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

async function init() {
  attachRuntimeSession({
    onStatusChange: setRuntimeBridgeStatus,
  });
  loadState();
  const legacyCleanup = await cleanupLegacyBrowserStorage();
  const ephemeralHistorySession = await prepareEphemeralHistorySession();

  if (window.Chart) {
    window.Chart.defaults.font.family = '"PingFang SC", "Hiragino Sans GB", "Source Han Sans SC", "Noto Sans CJK SC", "SF Pro Text", "Segoe UI", sans-serif';
    window.Chart.defaults.color = "#6b7280";
    window.Chart.defaults.font.size = 12;
  }

  workspaceState.db = await openBatchDatabase();
  await refreshBatchLibrary();

  bindAppEvents({
    addImageFiles,
    clearEditingRow,
    clearLoadedRows,
    clearImageSelection,
    closeImageLightbox,
    createNewBatch,
    mergeBatchIntoWorkspace,
    deleteDetailRow,
    detailViewState,
    elements,
    exportBatchData,
    exportSingleBatch,
    imageState,
    importBatchData,
    isHistoryDrawerOpen,
    openBatchIntoWorkspace,
    openImageLightbox,
    recognizeSelectedImage,
    removeBatchFromLibrary,
    removeImage,
    renameBatch,
    sanitizeInlineEditInput,
    saveCurrentBatch,
    saveEditedDetailRow,
    setEditingRow,
    setDropzoneActive,
    setHistoryDrawerOpen,
    setOcrStatus,
    state,
    toggleDetailSort,
    update,
    workspaceState,
  });

  update();

  if (legacyCleanup.databases.length || legacyCleanup.localKeys.length) {
    setOcrStatus("已清理旧版本本地数据，当前只保留新版本运行状态");
  } else if (ephemeralHistorySession.clearedOnLoad) {
    setOcrStatus("已按关闭浏览器策略清空上一轮历史批次；如需长期保留，请先导出 JSON");
  }

  attachEphemeralHistoryLifecycle({
    hasDataToProtect: hasSessionDataToProtect,
  });
}

init().catch((error) => {
  console.error(error);
  setOcrStatus("初始化失败，请刷新后重试", "error");
  update();
});
