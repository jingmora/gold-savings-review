// Centralized DOM event wiring so app.js only assembles module APIs.
export function bindAppEvents({
  addImageFiles,
  clearEditingRow,
  clearLoadedRows,
  clearImageSelection,
  closeImageLightbox,
  createNewBatch,
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
}) {
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
      return;
    }

    if (target.dataset.action === "clear-loaded-rows") {
      clearLoadedRows();
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
    try {
      await saveCurrentBatch({ promptForName: !state.currentBatchId });
    } catch (error) {
      setOcrStatus(`保存失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
    }
  });

  elements.workspaceSaveBatch.addEventListener("click", async () => {
    try {
      await saveCurrentBatch({ promptForName: !state.currentBatchId });
    } catch (error) {
      setOcrStatus(`保存失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
    }
  });

  elements.exportBatches.addEventListener("click", async () => {
    try {
      await exportBatchData();
    } catch (error) {
      setOcrStatus(`导出失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
    }
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
    if (!target) {
      return;
    }

    const batchId = target.dataset.batchId;
    const action = target.dataset.action;
    const isCurrentBatch = batchId === state.currentBatchId;

    if (imageState.processing && action !== "delete-batch") {
      return;
    }

    if (action === "open-batch") {
      if (
        !isCurrentBatch &&
        (workspaceState.dirty || imageState.items.length) &&
        !window.confirm("打开历史批次会替换当前工作区，未保存的新结果将丢失，是否继续？")
      ) {
        return;
      }
      try {
        await openBatchIntoWorkspace(batchId);
      } catch (error) {
        setOcrStatus(`打开失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
      }
      return;
    }

    if (action === "export-batch") {
      try {
        await exportSingleBatch(workspaceState.batches.find((batch) => batch.id === batchId) || null);
      } catch (error) {
        setOcrStatus(`导出失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
      }
      return;
    }

    if (action === "rename-batch") {
      try {
        await renameBatch(batchId);
      } catch (error) {
        setOcrStatus(`重命名失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
      }
      return;
    }

    if (action === "delete-batch") {
      try {
        await removeBatchFromLibrary(batchId);
      } catch (error) {
        setOcrStatus(`删除失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
      }
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
