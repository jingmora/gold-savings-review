import { createWorkspaceActionStatesApi } from "./action-states.js";
import { createWorkspaceBatchLibraryApi } from "./batch-library.js";
import { createWorkspaceBatchStateApi } from "./batch-state.js";
import { createWorkspaceSummaryApi } from "./summary.js";

export function createWorkspaceUiApi({
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
}) {
  const batchStateApi = createWorkspaceBatchStateApi({
    calculateTotals,
    elements,
    getDisplayRows,
    getSuggestedBatchName,
    hasWorkspaceContent,
    imageState,
    state,
    workspaceState,
  });
  const batchLibraryApi = createWorkspaceBatchLibraryApi({
    buildBatchSummary,
    elements,
    imageState,
    state,
    workspaceState,
  });
  const summaryApi = createWorkspaceSummaryApi({
    calculateTotals,
    elements,
    getDisplayRows,
    getLiveMarketSnapshot,
  });
  const actionStatesApi = createWorkspaceActionStatesApi({
    detailViewState,
    elements,
    getDisplayRows,
    getSaveBatchButtonLabel,
    imageState,
    renderDetailSortIndicators,
    state,
    workspaceState,
  });

  return {
    renderActionStates: actionStatesApi.renderActionStates,
    renderBatchLibrary: batchLibraryApi.renderBatchLibrary,
    renderBatchState: batchStateApi.renderBatchState,
    renderSummary: summaryApi.renderSummary,
  };
}
