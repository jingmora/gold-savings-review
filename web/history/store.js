import { BATCH_STORE, DB_NAME, DB_VERSION } from "../config.js";
import {
  defaultBatchName,
  normalizeLegacyBatchName,
} from "../lib/batch-utils.js";

export function createHistoryStoreApi({ workspaceState }) {
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

  return {
    deleteBatchRecord,
    getBatchById,
    openBatchDatabase,
    putBatch,
    refreshBatchLibrary,
  };
}
