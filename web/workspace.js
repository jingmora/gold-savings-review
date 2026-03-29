// Workspace-facing summary panels and batch library rendering live here.
import {
  formatCurrency,
  formatDateTime,
  formatSignedCurrency,
  formatSignedPercent,
  formatSignedPlain,
  formatUnitPrice,
  formatWeight,
} from "./lib/formatters.js";

export function createWorkspaceUiApi({
  buildBatchSummary,
  calculateTotals,
  detailViewState,
  elements,
  getDisplayRows,
  getLiveMarketSnapshot,
  getSaveBatchButtonLabel,
  getSuggestedBatchName,
  getTimeReviewRows,
  hasWorkspaceContent,
  imageState,
  renderDetailSortIndicators,
  state,
  workspaceState,
}) {
  function setSignedMetric(node, value, formatter) {
    if (!Number.isFinite(value)) {
      node.textContent = "--";
      node.classList.remove("is-positive", "is-negative");
      return;
    }

    node.textContent = formatter(value);
    node.classList.remove("is-positive", "is-negative");
    if (value > 0) {
      node.classList.add("is-positive");
    } else if (value < 0) {
      node.classList.add("is-negative");
    }
  }

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

  function renderSummary() {
    const rows = getDisplayRows();
    const totals = calculateTotals(rows);
    const liveMarket = getLiveMarketSnapshot();
    const buyAvgText = totals.buyWeight > 0 ? formatUnitPrice(totals.buyAvgPrice) : "暂无";
    const sellAvgText = totals.sellWeight > 0 ? formatUnitPrice(totals.sellAvgPrice) : "暂无";

    elements.summaryBuyAvg.textContent = buyAvgText;
    elements.summarySellAvg.textContent = sellAvgText;
    elements.summaryBuyWeight.textContent = formatWeight(totals.buyWeight);
    elements.summarySellWeight.textContent = formatWeight(totals.sellWeight);
    elements.summaryBuyAmount.textContent = formatCurrency(totals.buyAmount);
    elements.summarySellAmount.textContent = formatCurrency(totals.sellAmount);

    elements.liveBuyPriceCny.textContent = liveMarket.buyPriceCnyText;
    elements.liveBuyPriceUsd.textContent = liveMarket.buyPriceUsdText;
    elements.liveSellPriceCny.textContent = liveMarket.sellPriceCnyText;
    elements.liveSellPriceUsd.textContent = liveMarket.sellPriceUsdText;
    elements.livePriceStatus.textContent = liveMarket.statusText;
    elements.livePriceStatus.classList.toggle("is-error", liveMarket.statusTone === "error");

    setSignedMetric(elements.realizedProfit, liveMarket.realizedProfit, formatSignedCurrency);
    setSignedMetric(elements.floatingProfit, liveMarket.floatingProfit, formatSignedCurrency);
    setSignedMetric(elements.holdingReturnRate, liveMarket.holdingReturnRate, formatSignedPercent);
    setSignedMetric(elements.totalReturnRate, liveMarket.totalReturnRate, formatSignedPercent);
  }

  function renderReviewSheet() {
    const reviewRows = getTimeReviewRows();
    elements.reviewSheetBody.innerHTML = "";
    elements.reviewSheetFoot.innerHTML = "";

    if (!reviewRows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.className = "empty-cell";
      td.textContent = "暂无按成交日期复盘";
      tr.appendChild(td);
      elements.reviewSheetBody.appendChild(tr);
      return;
    }

    reviewRows.forEach((row) => {
      const tr = document.createElement("tr");
      [
        row.label,
        row.buyWeight.toFixed(4),
        row.sellWeight.toFixed(4),
        formatSignedPlain(row.netWeight, 4),
      ].forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      });
      elements.reviewSheetBody.appendChild(tr);
    });

    const totals = calculateTotals(getDisplayRows());
    const footRow = document.createElement("tr");

    [
      "总计",
      totals.buyWeight.toFixed(4),
      totals.sellWeight.toFixed(4),
      formatSignedPlain(totals.netWeight, 4),
    ].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      footRow.appendChild(td);
    });

    elements.reviewSheetFoot.appendChild(footRow);
  }

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
    elements.detailOnlyAnomalies.checked = detailViewState.onlyAnomalies;
    renderDetailSortIndicators();
    elements.detailViewFlat.classList.toggle("active", detailViewState.mode === "flat");
    elements.detailViewByImage.classList.toggle("active", detailViewState.mode === "by-image");
  }

  return {
    renderActionStates,
    renderBatchLibrary,
    renderBatchState,
    renderReviewSheet,
    renderSummary,
  };
}
