import { createBatchId, defaultBatchName } from "../lib/batch-utils.js";
import { cloneRows, createRowKey } from "../lib/row-utils.js";

export function createHistoryWorkspaceActions({
  imageState,
  metricsApi,
  shellApi,
  state,
  storeApi,
  update,
  workspaceApi,
  workspaceState,
}) {
  const { buildBatchSummary, buildDailySummaryFromRows } = metricsApi;
  const { getDisplayRows, clearQueueItems } = workspaceApi;
  const {
    getSuggestedBatchName,
    promptBatchName,
    setHistoryDrawerOpen,
    setOcrStatus,
  } = shellApi;
  const {
    getBatchById,
    putBatch,
    refreshBatchLibrary,
    deleteBatchRecord,
  } = storeApi;

  function hasWorkspaceContent() {
    return Boolean(workspaceState.baseRows.length || imageState.items.length);
  }

  function createBatchRecord(rows, existingRecord = null, name = "", options = {}) {
    const { reuseCurrentBatch = true } = options;
    const summary = buildBatchSummary(rows);
    const dailySummary = buildDailySummaryFromRows(rows);
    const now = new Date().toISOString();
    const batchName = String(name || getSuggestedBatchName()).trim() || defaultBatchName();
    const currentBatchId = reuseCurrentBatch ? state.currentBatchId : null;
    const currentBatchCreatedAt = reuseCurrentBatch ? state.currentBatchCreatedAt : "";

    return {
      id: existingRecord?.id || currentBatchId || createBatchId(),
      name: batchName,
      createdAt: existingRecord?.createdAt || currentBatchCreatedAt || now,
      updatedAt: now,
      rows: cloneRows(rows),
      summary,
      dailySummary,
    };
  }

  async function saveCurrentBatch({ promptForName = false } = {}) {
    if (imageState.processing) {
      setOcrStatus("识别进行中，请等待完成后再保存", "error");
      return;
    }

    const rows = getDisplayRows();
    if (!rows.length) {
      setOcrStatus("当前没有可保存的成交数据", "error");
      return;
    }

    if (!workspaceState.db) {
      setOcrStatus("当前浏览器不支持本地批次库", "error");
      return;
    }

    const existingRecord = state.currentBatchId ? await getBatchById(state.currentBatchId) : null;
    let batchName = existingRecord?.name || getSuggestedBatchName();
    if (!existingRecord && promptForName) {
      const nextName = promptBatchName(batchName);
      if (nextName === null) {
        setOcrStatus("已取消保存");
        return;
      }
      if (!nextName) {
        return;
      }
      batchName = nextName;
    }

    const record = createBatchRecord(rows, existingRecord, batchName, {
      reuseCurrentBatch: true,
    });

    await putBatch(record);
    await refreshBatchLibrary();

    state.currentBatchId = record.id;
    state.currentBatchName = record.name;
    state.currentBatchCreatedAt = record.createdAt;
    state.currentBatchUpdatedAt = record.updatedAt;
    workspaceState.dirty = false;
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
      setOcrStatus("未找到对应批次", "error");
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
      setOcrStatus(`已打开批次：${batch.name}`);
    }
  }

  async function mergeBatchIntoWorkspace(id) {
    const batch = await getBatchById(id);
    if (!batch) {
      setOcrStatus("未找到对应批次", "error");
      return;
    }

    const existingKeys = new Set(getDisplayRows().map(createRowKey));
    const rowsToAdd = cloneRows(batch.rows || []).filter((row) => !existingKeys.has(createRowKey(row)));

    if (!rowsToAdd.length) {
      setOcrStatus(`批次 ${batch.name} 没有新的可加入记录`);
      return;
    }

    workspaceState.baseRows = [...workspaceState.baseRows, ...rowsToAdd];
    workspaceState.dirty = true;
    state.currentBatchId = null;
    state.currentBatchName = "";
    state.currentBatchCreatedAt = "";
    state.currentBatchUpdatedAt = "";
    update();
    setHistoryDrawerOpen(false);
    setOcrStatus(`已加入批次：${batch.name}，新增 ${rowsToAdd.length} 笔`);
  }

  async function mergeAllBatchesIntoWorkspace() {
    if (!workspaceState.batches.length) {
      setOcrStatus("暂无可加入的历史批次", "error");
      return;
    }

    const existingKeys = new Set(getDisplayRows().map(createRowKey));
    const nextBaseRows = [...workspaceState.baseRows];
    let mergedBatchCount = 0;
    let addedRowCount = 0;

    workspaceState.batches.forEach((batch) => {
      const rowsToAdd = cloneRows(batch.rows || []).filter((row) => {
        const key = createRowKey(row);
        if (existingKeys.has(key)) {
          return false;
        }
        existingKeys.add(key);
        return true;
      });

      if (!rowsToAdd.length) {
        return;
      }

      nextBaseRows.push(...rowsToAdd);
      mergedBatchCount += 1;
      addedRowCount += rowsToAdd.length;
    });

    if (!addedRowCount) {
      setOcrStatus("所有历史批次都已在当前工作区中");
      return;
    }

    workspaceState.baseRows = nextBaseRows;
    workspaceState.dirty = true;
    state.currentBatchId = null;
    state.currentBatchName = "";
    state.currentBatchCreatedAt = "";
    state.currentBatchUpdatedAt = "";
    update();
    setHistoryDrawerOpen(false);
    setOcrStatus(`已加入全部历史批次，新增 ${addedRowCount} 笔，来自 ${mergedBatchCount} 个批次`);
  }

  async function renameBatch(id) {
    const batch = await getBatchById(id);
    if (!batch) {
      setOcrStatus("未找到对应批次", "error");
      return;
    }

    const nextName = window.prompt("输入新的批次名称", batch.name);
    if (nextName === null) {
      return;
    }

    const trimmed = nextName.trim();
    if (!trimmed) {
      setOcrStatus("批次名称不能为空", "error");
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
    setOcrStatus(`已重命名批次：${trimmed}`);
  }

  async function removeBatchFromLibrary(id) {
    const batch = await getBatchById(id);
    if (!batch) {
      setOcrStatus("未找到对应批次", "error");
      return;
    }

    if (!window.confirm(`删除批次“${batch.name}”后将无法恢复，是否继续？`)) {
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
    setOcrStatus(`已删除批次：${batch.name}`);
  }

  function resetWorkspace() {
    clearQueueItems();
    workspaceState.baseRows = [];
    workspaceState.dirty = false;
    state.currentBatchId = null;
    state.currentBatchCreatedAt = "";
    state.currentBatchUpdatedAt = "";
    state.currentBatchName = "";
    update();
  }

  function createNewBatch() {
    if (hasWorkspaceContent() && !window.confirm("新建空白批次会清空当前工作区，是否继续？")) {
      return;
    }

    resetWorkspace();
    setHistoryDrawerOpen(false);
    setOcrStatus("已新建空白批次");
  }

  return {
    createNewBatch,
    mergeAllBatchesIntoWorkspace,
    mergeBatchIntoWorkspace,
    openBatchIntoWorkspace,
    removeBatchFromLibrary,
    renameBatch,
    saveCurrentBatch,
  };
}
