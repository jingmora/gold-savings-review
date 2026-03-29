// IndexedDB batch persistence and workspace loading live in the history domain entrypoint.
import { BATCH_STORE, DB_NAME, DB_VERSION } from "../config.js";
import {
  createBatchId,
  defaultBatchName,
  normalizeLegacyBatchName,
} from "../lib/batch-utils.js";
import { cloneRows, createRowKey } from "../lib/row-utils.js";

export function createHistoryApi({
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
}) {
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
        const rows = (Array.isArray(request.result) ? request.result : []).map((record) => ({
          ...record,
          name: normalizeLegacyBatchName(record?.name) || defaultBatchName(),
        }));
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
      request.onsuccess = () => {
        const record = request.result || null;
        resolve(
          record
            ? {
                ...record,
                name: normalizeLegacyBatchName(record.name) || defaultBatchName(),
              }
            : null
        );
      };
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

  function hasWorkspaceContent() {
    return Boolean(workspaceState.baseRows.length || imageState.items.length);
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
    openBatchDatabase,
    putBatch,
    refreshBatchLibrary,
    saveCurrentBatch,
    openBatchIntoWorkspace,
    mergeBatchIntoWorkspace,
    renameBatch,
    removeBatchFromLibrary,
    createNewBatch,
  };
}
