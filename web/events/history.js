export function bindHistoryEvents({
  elements,
  historyApi,
  imageState,
  setHistoryDrawerOpen,
  setOcrStatus,
  state,
  transferApi,
  workspaceState,
}) {
  const {
    createNewBatch,
    mergeAllBatchesIntoWorkspace,
    mergeBatchIntoWorkspace,
    openBatchIntoWorkspace,
    removeBatchFromLibrary,
    renameBatch,
    saveCurrentBatch,
  } = historyApi;
  const {
    exportBatchData,
    exportSingleBatch,
    importBatchData,
  } = transferApi;

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

  elements.mergeAllBatches.addEventListener("click", async () => {
    try {
      await mergeAllBatchesIntoWorkspace();
    } catch (error) {
      setOcrStatus(`批量加入失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
    }
  });

  async function handleSaveCurrentBatch() {
    try {
      await saveCurrentBatch({ promptForName: !state.currentBatchId });
    } catch (error) {
      setOcrStatus(`保存失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
    }
  }

  elements.saveBatch.addEventListener("click", handleSaveCurrentBatch);
  elements.workspaceSaveBatch.addEventListener("click", handleSaveCurrentBatch);

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
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    try {
      await importBatchData(files);
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

    if (action === "merge-batch") {
      try {
        await mergeBatchIntoWorkspace(batchId);
      } catch (error) {
        setOcrStatus(`加入失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
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
}
