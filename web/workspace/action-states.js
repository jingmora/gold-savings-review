export function createWorkspaceActionStatesApi({
  detailViewState,
  elements,
  getDisplayRows,
  getSaveBatchButtonLabel,
  imageState,
  renderDetailSortIndicators,
  state,
  workspaceState,
}) {
  function renderActionStates() {
    const hasRows = Boolean(getDisplayRows().length);
    const saveLabel = getSaveBatchButtonLabel();
    const saveBlockedReason = imageState.processing
      ? "识别进行中，请等待完成后再保存"
      : !hasRows
        ? "当前没有可保存的成交数据"
        : !workspaceState.db
          ? "当前浏览器不支持本地批次库"
          : "";
    elements.recognizeImage.disabled = imageState.processing || !imageState.items.length;
    elements.clearImage.disabled = imageState.processing || !imageState.items.length;
    elements.detailClearLoaded.disabled = imageState.processing || !workspaceState.baseRows.length;
    elements.detailClearLoaded.hidden = !workspaceState.baseRows.length;
    elements.saveBatch.disabled = Boolean(saveBlockedReason);
    elements.saveBatch.textContent = saveLabel;
    elements.saveBatch.title = saveBlockedReason;
    elements.saveBatch.setAttribute("aria-disabled", String(Boolean(saveBlockedReason)));
    elements.workspaceSaveBatch.disabled = Boolean(saveBlockedReason);
    elements.workspaceSaveBatch.textContent = state.currentBatchId ? "保存当前" : "保存批次";
    elements.workspaceSaveBatch.title = saveBlockedReason;
    elements.workspaceSaveBatch.setAttribute("aria-disabled", String(Boolean(saveBlockedReason)));
    elements.newBatch.disabled = imageState.processing;
    elements.exportBatches.disabled = imageState.processing || !workspaceState.db || !workspaceState.batches.length;
    elements.importBatches.disabled = imageState.processing || !workspaceState.db;
    elements.mergeAllBatches.disabled =
      imageState.processing || !workspaceState.db || !workspaceState.batches.length;
    elements.detailOnlyAnomalies.checked = detailViewState.onlyAnomalies;
    renderDetailSortIndicators();
    elements.detailViewFlat.classList.toggle("active", detailViewState.mode === "flat");
    elements.detailViewByImage.classList.toggle("active", detailViewState.mode === "by-image");
  }

  return {
    renderActionStates,
  };
}
