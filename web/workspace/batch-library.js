import {
  formatDateTime,
  formatWeight,
} from "../lib/formatters.js";

export function createWorkspaceBatchLibraryApi({
  buildBatchSummary,
  elements,
  imageState,
  state,
  workspaceState,
}) {
  function renderBatchLibrary() {
    if (!workspaceState.db) {
      elements.batchLibrary.classList.add("is-empty");
      elements.batchLibrary.innerHTML = "批次库不可用";
      return;
    }

    if (!workspaceState.batches.length) {
      elements.batchLibrary.classList.add("is-empty");
      elements.batchLibrary.innerHTML = "暂无历史批次";
      return;
    }

    elements.batchLibrary.classList.remove("is-empty");
    elements.batchLibrary.innerHTML = "";

    workspaceState.batches.forEach((batch) => {
      const isCurrentBatch = batch.id === state.currentBatchId;
      const item = document.createElement("article");
      item.className = `batch-item${isCurrentBatch ? " active" : ""}`;

      const main = document.createElement("div");
      main.className = "batch-item-main";

      const titleRow = document.createElement("div");
      titleRow.className = "batch-item-title-row";

      const title = document.createElement("h4");
      title.textContent = batch.name;
      titleRow.appendChild(title);

      if (isCurrentBatch) {
        const badge = document.createElement("span");
        badge.className = "batch-item-badge";
        badge.textContent = workspaceState.dirty ? "当前批次 · 待更新" : "当前批次";
        titleRow.appendChild(badge);
      }

      const summary = batch.summary || buildBatchSummary(batch.rows || []);
      const savedAt = formatDateTime(batch.updatedAt || batch.createdAt || "");
      const createdAt = formatDateTime(batch.createdAt || "");
      const meta = document.createElement("p");
      meta.className = "batch-item-meta";
      meta.textContent = savedAt ? `保存时间 ${savedAt}` : "保存时间未记录";

      const stats = document.createElement("p");
      stats.className = "batch-item-stats";
      stats.textContent = `买入 ${formatWeight(summary.buyWeight)} · 卖出 ${formatWeight(summary.sellWeight)}`;

      const facts = document.createElement("div");
      facts.className = "batch-item-facts";

      [
        `${(batch.rows || []).length} 笔记录`,
        createdAt ? `创建于 ${createdAt}` : "创建时间未记录",
      ].forEach((value) => {
        const fact = document.createElement("span");
        fact.textContent = value;
        facts.appendChild(fact);
      });

      main.appendChild(titleRow);
      main.appendChild(meta);
      main.appendChild(stats);
      main.appendChild(facts);

      const actions = document.createElement("div");
      actions.className = "batch-item-actions";

      [
        ["open", "打开"],
        ["merge", "加入当前"],
        ["export", "导出"],
        ["rename", "重命名"],
        ["delete", "删除"],
      ].forEach(([action, label], index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className =
          action === "delete"
            ? "secondary danger small"
            : index === 0
              ? "small"
              : "secondary small";
        button.dataset.action = `${action}-batch`;
        button.dataset.batchId = batch.id;
        button.disabled = imageState.processing && action !== "delete";
        button.textContent = label;
        actions.appendChild(button);
      });

      item.appendChild(main);
      item.appendChild(actions);
      elements.batchLibrary.appendChild(item);
    });
  }

  return {
    renderBatchLibrary,
  };
}
