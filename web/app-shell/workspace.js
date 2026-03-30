import { defaultBatchName } from "../lib/batch-utils.js";

export function createShellWorkspaceApi({
  imageState,
  state,
  workspaceState,
  setOcrStatus,
}) {
  function getSuggestedBatchName() {
    if (state.currentBatchId) {
      const value = String(state.currentBatchName || "").trim();
      return value || defaultBatchName();
    }

    return defaultBatchName();
  }

  function promptBatchName(initialValue = getSuggestedBatchName()) {
    const nextName = window.prompt("输入批次名称", initialValue);
    if (nextName === null) {
      return null;
    }

    const trimmed = nextName.trim();
    if (!trimmed) {
      setOcrStatus("批次名称不能为空", "error");
      return "";
    }

    return trimmed;
  }

  function getSaveBatchButtonLabel() {
    return state.currentBatchId ? "更新当前批次" : "保存为批次";
  }

  function markWorkspaceDirty() {
    workspaceState.dirty = true;
  }

  function hasWorkspaceContent() {
    return Boolean(workspaceState.baseRows.length || imageState.items.length);
  }

  function hasSessionDataToProtect() {
    return Boolean(workspaceState.batches.length || hasWorkspaceContent());
  }

  return {
    getSaveBatchButtonLabel,
    getSuggestedBatchName,
    hasSessionDataToProtect,
    hasWorkspaceContent,
    markWorkspaceDirty,
    promptBatchName,
  };
}
