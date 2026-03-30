import { formatWeight } from "../lib/formatters.js";

export function createWorkspaceBatchStateApi({
  calculateTotals,
  elements,
  getDisplayRows,
  getSuggestedBatchName,
  hasWorkspaceContent,
  imageState,
  state,
  workspaceState,
}) {
  function renderBatchState() {
    const rows = getDisplayRows();
    const totals = calculateTotals(rows);
    const isLinkedBatch = Boolean(state.currentBatchId);
    const pendingImageCount = imageState.items.filter(
      (item) => item.status === "queued" || item.status === "processing"
    ).length;

    elements.workspaceTitle.textContent =
      hasWorkspaceContent() || state.currentBatchId ? getSuggestedBatchName() : "空白整理台";

    if (!workspaceState.db) {
      elements.batchMetaCopy.textContent = "批次库不可用";
    } else if (isLinkedBatch) {
      elements.batchMetaCopy.textContent = workspaceState.dirty ? "当前批次 · 待保存" : "当前批次";
    } else {
      elements.batchMetaCopy.textContent = hasWorkspaceContent() ? "未保存" : "暂无记录";
    }

    if (!rows.length && !imageState.items.length) {
      elements.workspaceRecordCopy.textContent = "识别后的结果会出现在这里";
      return;
    }

    if (!rows.length) {
      elements.workspaceRecordCopy.textContent = pendingImageCount
        ? `${pendingImageCount} 张截图待识别`
        : "暂无可展示明细";
      return;
    }

    const detailParts = [
      `${rows.length} 笔记录`,
      `买入 ${formatWeight(totals.buyWeight)}`,
      `卖出 ${formatWeight(totals.sellWeight)}`,
    ];
    if (pendingImageCount) {
      detailParts.push(`${pendingImageCount} 张待识别`);
    }
    elements.workspaceRecordCopy.textContent = detailParts.join(" · ");
  }

  return {
    renderBatchState,
  };
}
