import { STORAGE_KEY } from "../config.js";

export function createShellPersistenceApi({
  detailViewState,
  marketState,
  state,
}) {
  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        detailSort: detailViewState.sort,
        detailViewMode: detailViewState.mode,
        detailOnlyAnomalies: detailViewState.onlyAnomalies,
        marketBuySpread: marketState.buySpread,
        marketSellSpread: marketState.sellSpread,
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
      marketState.buySpread = Number.parseFloat(parsed.marketBuySpread) || 0;
      marketState.sellSpread = Number.parseFloat(parsed.marketSellSpread) || 0;
    } catch {
      state.currentBatchId = null;
      state.currentBatchName = "";
      detailViewState.sort = "time-desc";
      detailViewState.mode = "flat";
      detailViewState.onlyAnomalies = false;
      marketState.buySpread = 0;
      marketState.sellSpread = 0;
    }
  }

  return {
    loadState,
    saveState,
  };
}
