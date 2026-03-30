import { createAppShellApi } from "./app-shell.js";
import { createChartsApi } from "./charts.js";
import { createImageQueueApi } from "./capture/images.js";
import { createOcrApi } from "./capture/ocr.js";
import { createDetailsApi } from "./details.js";
import { elements } from "./elements.js";
import { bindAppEvents } from "./events.js";
import {
  createLivePriceApi,
} from "./market/live-price.js";
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
  buildBatchSummary,
  buildDailySummaryFromRows,
  buildPriceDistribution,
  calculateTotals,
} from "../src/review-metrics.mjs";
import {
  chartState,
  detailViewState,
  imageState,
  marketState,
  ocrEngineState,
  state,
  workspaceState,
} from "./state.js";

const {
  getSuggestedBatchName,
  promptBatchName,
  getSaveBatchButtonLabel,
  saveState,
  loadState,
  markWorkspaceDirty,
  hasWorkspaceContent,
  hasSessionDataToProtect,
  isHistoryDrawerOpen,
  setHistoryDrawerOpen,
  getDirectionLabel,
  setOcrStatus,
  setRuntimeBridgeStatus,
  setLivePriceSpreads,
  getLiveMarketSnapshot,
} = createAppShellApi({
  detailViewState,
  elements,
  imageState,
  marketState,
  state,
  update,
  workspaceState,
  getDisplayRows,
});

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
  mergeAllBatchesIntoWorkspace,
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
  metricsApi: {
    buildBatchSummary,
    buildDailySummaryFromRows,
  },
  shellApi: {
    getSuggestedBatchName,
    promptBatchName,
    setHistoryDrawerOpen,
    setOcrStatus,
  },
  state,
  update,
  workspaceApi: {
    clearQueueItems,
    getDisplayRows,
  },
  workspaceState,
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
  renderSummary,
} = createWorkspaceUiApi({
  buildBatchSummary,
  calculateTotals,
  detailViewState,
  elements,
  getDisplayRows,
  getLiveMarketSnapshot,
  getSaveBatchButtonLabel,
  getSuggestedBatchName,
  hasWorkspaceContent,
  imageState,
  renderDetailSortIndicators,
  state,
  workspaceState,
});

const {
  startLivePricePolling,
  stopLivePricePolling,
} = createLivePriceApi({
  marketState,
  update,
});

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

function getDisplayRows() {
  return [...workspaceState.baseRows, ...rebuildTextFromQueue()];
}

function update() {
  renderBatchState();
  renderBatchLibrary();
  renderQueueSummary();
  renderImageQueue();
  renderParsedSheet();
  renderSummary();
  renderCharts();
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
    captureApi: {
      addImageFiles,
      clearImageSelection,
      closeImageLightbox,
      openImageLightbox,
      recognizeSelectedImage,
      removeImage,
      setDropzoneActive,
    },
    detailApi: {
      clearEditingRow,
      clearLoadedRows,
      deleteDetailRow,
      sanitizeInlineEditInput,
      saveEditedDetailRow,
      setEditingRow,
      toggleDetailSort,
    },
    detailViewState,
    elements,
    historyApi: {
      createNewBatch,
      mergeAllBatchesIntoWorkspace,
      mergeBatchIntoWorkspace,
      openBatchIntoWorkspace,
      removeBatchFromLibrary,
      renameBatch,
      saveCurrentBatch,
    },
    imageState,
    isHistoryDrawerOpen,
    setLivePriceSpreads,
    setHistoryDrawerOpen,
    setOcrStatus,
    state,
    transferApi: {
      exportBatchData,
      exportSingleBatch,
      importBatchData,
    },
    update,
    workspaceState,
  });

  elements.buySpreadInput.value = String(marketState.buySpread);
  elements.sellSpreadInput.value = String(marketState.sellSpread);
  startLivePricePolling();
  window.addEventListener("beforeunload", stopLivePricePolling, { once: true });
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
