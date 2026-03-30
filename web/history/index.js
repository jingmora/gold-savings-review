import { createHistoryStoreApi } from "./store.js";
import { createHistoryWorkspaceActions } from "./workspace-actions.js";

export function createHistoryApi({
  imageState,
  metricsApi,
  shellApi,
  state,
  update,
  workspaceApi,
  workspaceState,
}) {
  const storeApi = createHistoryStoreApi({
    workspaceState,
  });
  const actionsApi = createHistoryWorkspaceActions({
    imageState,
    metricsApi,
    shellApi,
    state,
    storeApi,
    update,
    workspaceApi,
    workspaceState,
  });

  return {
    createNewBatch: actionsApi.createNewBatch,
    mergeAllBatchesIntoWorkspace: actionsApi.mergeAllBatchesIntoWorkspace,
    mergeBatchIntoWorkspace: actionsApi.mergeBatchIntoWorkspace,
    openBatchDatabase: storeApi.openBatchDatabase,
    openBatchIntoWorkspace: actionsApi.openBatchIntoWorkspace,
    putBatch: storeApi.putBatch,
    refreshBatchLibrary: storeApi.refreshBatchLibrary,
    removeBatchFromLibrary: actionsApi.removeBatchFromLibrary,
    renameBatch: actionsApi.renameBatch,
    saveCurrentBatch: actionsApi.saveCurrentBatch,
  };
}
