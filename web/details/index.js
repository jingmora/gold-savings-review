import { createDetailEntriesApi } from "./entries.js";
import { createDetailEditingApi } from "./editing.js";
import { createDetailsRenderApi } from "./rendering.js";
import { createDetailViewStateApi } from "./view-state.js";

export function createDetailsApi({
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
}) {
  const viewStateApi = createDetailViewStateApi({
    detailViewState,
    elements,
  });
  const entriesApi = createDetailEntriesApi({
    detailViewState,
    getDisplayRows,
    imageState,
    workspaceState,
  });
  const editingApi = createDetailEditingApi({
    detailViewState,
    elements,
    findImageItemByKey,
    markWorkspaceDirty,
    setOcrStatus,
    syncImageItemMetrics,
    update,
    workspaceState,
  });
  const { renderParsedSheet } = createDetailsRenderApi({
    calculateTotals,
    detailViewState,
    editingApi,
    elements,
    entriesApi,
    getDirectionLabel,
    getDisplayRows,
    imageState,
  });

  return {
    clearEditingRow: editingApi.clearEditingRow,
    clearLoadedRows: editingApi.clearLoadedRows,
    deleteDetailRow: editingApi.deleteDetailRow,
    renderDetailSortIndicators: viewStateApi.renderDetailSortIndicators,
    renderParsedSheet,
    sanitizeInlineEditInput: editingApi.sanitizeInlineEditInput,
    saveEditedDetailRow: editingApi.saveEditedDetailRow,
    setEditingRow: editingApi.setEditingRow,
    toggleDetailSort: viewStateApi.toggleDetailSort,
  };
}
