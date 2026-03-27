// Detail table editing and rendering stay together so app.js can remain orchestration-only.
import { STATUS_LABELS } from "./config.js";
import {
  formatAbsolutePlainCompact,
  formatPlainCompact,
  toNumber,
} from "./lib/formatters.js";
import { createStructuredRow, normalizeDigits } from "./lib/ocr-utils.js";
import {
  createRowKey,
  getSignedAmountValue,
  getSignedWeightValue,
  normalizeDirection,
} from "./lib/row-utils.js";
import {
  buildDuplicateCountMap,
  getRowAnomalies,
  getTimeValue,
  sortRowEntries,
} from "../src/detail-tools.mjs";

export function createDetailsApi({
  calculateTotals,
  detailViewState,
  elements,
  findImageItemByKey,
  getDirectionLabel,
  getDisplayRows,
  imageState,
  markWorkspaceDirty,
  setOcrStatus,
  syncImageItemMetrics,
  update,
  workspaceState,
}) {
  function getSortField(sortValue = detailViewState.sort) {
    return String(sortValue).split("-")[0];
  }

  function getSortDirection(sortValue = detailViewState.sort) {
    return String(sortValue).split("-")[1] || "desc";
  }

  function toggleDetailSort(field) {
    if (getSortField() === field) {
      detailViewState.sort = `${field}-${getSortDirection() === "asc" ? "desc" : "asc"}`;
    } else {
      detailViewState.sort = `${field}-${field === "time" ? "desc" : "asc"}`;
    }
  }

  function renderDetailSortIndicators() {
    const activeField = getSortField();
    const activeDirection = getSortDirection();
    const indicatorMap = {
      time: elements.detailSortIndicatorTime,
      weight: elements.detailSortIndicatorWeight,
      price: elements.detailSortIndicatorPrice,
    };
    const buttonMap = {
      time: elements.detailSortTime,
      weight: elements.detailSortWeight,
      price: elements.detailSortPrice,
    };

    Object.entries(indicatorMap).forEach(([field, element]) => {
      const isActive = field === activeField;
      const direction = isActive ? activeDirection : "asc";
      element.textContent = direction === "asc" ? "▲" : "▼";
      element.classList.toggle("active", isActive);
      buttonMap[field]?.classList.toggle("active", isActive);
      buttonMap[field]?.setAttribute(
        "aria-label",
        `${field === "time" ? "成交时间" : field === "weight" ? "克重" : "单价"}，当前${direction === "asc" ? "升序" : "降序"}`
      );
    });
  }

  function createDetailRowEntry(row, meta, duplicateCounts) {
    const issues = getRowAnomalies(row, {
      duplicateCount: duplicateCounts.get(createRowKey(row)) || 0,
    });

    return {
      entryKey: `${meta.sourceType}:${meta.itemKey || "base"}:${meta.rowIndex}`,
      row,
      issues,
      isAnomalous: Boolean(issues.length),
      ...meta,
    };
  }

  function getDetailRowEntries() {
    const duplicateCounts = buildDuplicateCountMap(getDisplayRows(), createRowKey);
    const baseEntries = workspaceState.baseRows.map((row, rowIndex) =>
      createDetailRowEntry(row, { sourceType: "base", rowIndex }, duplicateCounts)
    );
    const imageGroups = imageState.items.map((item, imageIndex) => ({
      item,
      imageIndex,
      entries: (item.rows || []).map((row, rowIndex) =>
        createDetailRowEntry(row, { sourceType: "image", rowIndex, itemKey: item.key, imageIndex }, duplicateCounts)
      ),
    }));

    return {
      baseEntries,
      imageGroups,
      flatEntries: [...baseEntries, ...imageGroups.flatMap((group) => group.entries)],
    };
  }

  function getVisibleDetailEntries(entries) {
    const filteredEntries = detailViewState.onlyAnomalies
      ? (entries || []).filter((entry) => entry.isAnomalous)
      : entries || [];
    return sortRowEntries(filteredEntries, detailViewState.sort);
  }

  function getItemIssueMessage(item) {
    if (item.status === "error") {
      return item.error || "结果需复查";
    }
    if (item.status === "done" && !(item.rows || []).length) {
      return "未提取到成交明细";
    }
    return "";
  }

  function appendParsedEmptyRow(message, colSpan = 7) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = colSpan;
    td.className = "empty-cell";
    td.textContent = message;
    tr.appendChild(td);
    elements.parsedSheetBody.appendChild(tr);
  }

  function appendParsedGroupRow(label, options = {}) {
    const tr = document.createElement("tr");
    tr.className = "group-row";
    const td = document.createElement("td");
    td.colSpan = 7;

    const header = document.createElement("div");
    header.className = "parsed-group-head";

    const title = document.createElement("div");
    title.className = "parsed-group-title";
    title.textContent = label;
    header.appendChild(title);

    if (options.previewKey || options.actionButtons?.length) {
      const actions = document.createElement("div");
      actions.className = "parsed-group-actions";

      if (options.previewUrl) {
        const thumbButton = document.createElement("button");
        thumbButton.type = "button";
        thumbButton.className = "parsed-group-thumb";
        thumbButton.dataset.action = "preview";
        thumbButton.dataset.key = options.previewKey;
        thumbButton.setAttribute("aria-label", `${label} 预览原图`);

        const thumbImage = document.createElement("img");
        thumbImage.src = options.previewUrl;
        thumbImage.alt = `${label} 缩略图`;
        thumbButton.appendChild(thumbImage);
        actions.appendChild(thumbButton);
      }

      (options.actionButtons || []).forEach(({ action, label, className = "secondary small", disabled = false }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.dataset.action = action;
        button.disabled = disabled;
        button.textContent = label;
        actions.appendChild(button);
      });

      header.appendChild(actions);
    }

    td.appendChild(header);
    tr.appendChild(td);
    elements.parsedSheetBody.appendChild(tr);
  }

  function appendParsedSubtotalRow(label, rows) {
    const totals = calculateTotals(rows);
    const tr = document.createElement("tr");
    tr.className = "subtotal-row";

    [
      label,
      `${totals.count} 笔`,
      "",
      formatAbsolutePlainCompact(totals.netWeight, 4),
      "",
      formatAbsolutePlainCompact(totals.netAmount, 2),
      "",
    ].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });

    elements.parsedSheetBody.appendChild(tr);
  }

  function toDateInputValue(value) {
    const normalized = String(value || "").trim();
    const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }

  function normalizeDecimalDraft(value) {
    let normalized = normalizeDigits(String(value || "")).replace(/[^\d.]/g, "");
    const firstDotIndex = normalized.indexOf(".");
    if (firstDotIndex >= 0) {
      normalized =
        normalized.slice(0, firstDotIndex + 1) +
        normalized
          .slice(firstDotIndex + 1)
          .replace(/\./g, "");
    }

    if (!normalized) {
      return "";
    }

    if (normalized.startsWith(".")) {
      normalized = `0${normalized}`;
    }

    return normalized;
  }

  function isValidDecimalDraft(value, { maxIntegers = 4, maxDecimals = 4 } = {}) {
    if (value === "") {
      return true;
    }

    const pattern = new RegExp(`^\\d{1,${maxIntegers}}(?:\\.\\d{0,${maxDecimals}})?$`);
    return pattern.test(value);
  }

  function sanitizeDecimalInput(value, options = {}, fallback = "") {
    const normalized = normalizeDecimalDraft(value);
    return isValidDecimalDraft(normalized, options) ? normalized : fallback;
  }

  function createMetaDataset(target, entry) {
    target.dataset.sourceType = entry.sourceType;
    target.dataset.rowIndex = String(entry.rowIndex);
    if (entry.itemKey) {
      target.dataset.itemKey = entry.itemKey;
    }
  }

  function createEditableCellButton(entry, field, text) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "detail-cell-button";
    button.dataset.action = "edit-row";
    button.dataset.editField = field;
    button.title = "点击修改";
    createMetaDataset(button, entry);
    button.textContent = text;
    return button;
  }

  function createStaticCellText(text) {
    const span = document.createElement("span");
    span.className = "detail-cell-text";
    span.textContent = text;
    return span;
  }

  function appendDetailActionButtons(container, entry, actions) {
    const wrap = document.createElement("div");
    wrap.className = "row-action-buttons";

    actions.forEach(({ action, label, className = "secondary small", disabled = false }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className;
      button.dataset.action = action;
      createMetaDataset(button, entry);
      button.disabled = disabled;
      button.textContent = label;
      wrap.appendChild(button);
    });

    container.appendChild(wrap);
  }

  function isEditingEntryField(entry, field) {
    return detailViewState.editingKey === entry.entryKey && detailViewState.editingField === field;
  }

  function canEditDetailEntry(entry) {
    return detailViewState.mode === "by-image" && entry.sourceType === "image";
  }

  function createInlineEditControl(entry, field) {
    if (field === "time") {
      const input = document.createElement("input");
      input.type = "date";
      input.className = "detail-inline-input";
      input.value = toDateInputValue(entry.row.time);
      input.dataset.field = field;
      createMetaDataset(input, entry);
      return input;
    }

    if (field === "direction") {
      const select = document.createElement("select");
      select.className = "detail-inline-select";
      select.dataset.field = field;
      createMetaDataset(select, entry);

      [
        ["buy", "委托买入"],
        ["sell", "委托卖出"],
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = entry.row.direction === value;
        select.appendChild(option);
      });

      return select;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.className = "detail-inline-input";
    input.dataset.field = field;
    createMetaDataset(input, entry);

    if (field === "weight") {
      input.value = sanitizeDecimalInput(entry.row.weight, { maxIntegers: 3, maxDecimals: 4 });
      input.placeholder = "0.0000";
      input.dataset.sanitize = "weight";
      input.dataset.lastValue = input.value;
    }

    if (field === "price") {
      input.value = sanitizeDecimalInput(entry.row.price, { maxIntegers: 5, maxDecimals: 2 });
      input.placeholder = "0.00";
      input.dataset.sanitize = "price";
      input.dataset.lastValue = input.value;
    }

    return input;
  }

  function appendEditableCell(cell, entry, field, text) {
    if (isEditingEntryField(entry, field)) {
      cell.classList.add("is-inline-editing");
      cell.appendChild(createInlineEditControl(entry, field));
      return;
    }

    if (canEditDetailEntry(entry)) {
      cell.appendChild(createEditableCellButton(entry, field, text));
      return;
    }

    cell.appendChild(createStaticCellText(text));
  }

  function appendParsedDataRow(entry, index) {
    const price = toNumber(entry.row.price);
    const signedWeight = getSignedWeightValue(entry.row);
    const signedAmount = getSignedAmountValue(entry.row);
    const isEditingRow = detailViewState.editingKey === entry.entryKey;
    const tr = document.createElement("tr");
    if (entry.isAnomalous) {
      tr.classList.add("is-anomaly");
      tr.title = entry.issues.join(" · ");
    }
    if (isEditingRow) {
      tr.classList.add("detail-edit-row");
    }

    const indexTd = document.createElement("td");
    indexTd.textContent = String(index);
    tr.appendChild(indexTd);

    const timeTd = document.createElement("td");
    appendEditableCell(timeTd, entry, "time", entry.row.time || "未识别");
    tr.appendChild(timeTd);

    const directionTd = document.createElement("td");
    appendEditableCell(directionTd, entry, "direction", getDirectionLabel(entry.row.direction));
    tr.appendChild(directionTd);

    const weightTd = document.createElement("td");
    appendEditableCell(weightTd, entry, "weight", formatAbsolutePlainCompact(signedWeight, 4));
    tr.appendChild(weightTd);

    const priceTd = document.createElement("td");
    appendEditableCell(priceTd, entry, "price", formatPlainCompact(price, 2));
    tr.appendChild(priceTd);

    const amountTd = document.createElement("td");
    amountTd.textContent = formatAbsolutePlainCompact(signedAmount, 2);
    tr.appendChild(amountTd);

    const actionTd = document.createElement("td");
    actionTd.className = "detail-actions-cell";

    if (entry.issues.length && !isEditingRow) {
      const issueWrap = document.createElement("div");
      issueWrap.className = "row-issue-list";
      entry.issues.forEach((issue) => {
        const badge = document.createElement("span");
        badge.className = "row-issue-badge";
        badge.textContent = issue;
        issueWrap.appendChild(badge);
      });
      actionTd.appendChild(issueWrap);
    }

    if (!isEditingRow && canEditDetailEntry(entry)) {
      appendDetailActionButtons(actionTd, entry, [
        { action: "delete-row", label: "删除", className: "secondary danger small", disabled: imageState.processing },
      ]);
    }
    tr.appendChild(actionTd);
    elements.parsedSheetBody.appendChild(tr);
  }

  function getRowStoreByMeta(meta) {
    if (meta.sourceType === "base") {
      return workspaceState.baseRows;
    }

    if (meta.sourceType === "image") {
      return findImageItemByKey(meta.itemKey)?.rows || null;
    }

    return null;
  }

  function getRowByMeta(meta) {
    const store = getRowStoreByMeta(meta);
    if (!store) {
      return null;
    }

    return store[Number(meta.rowIndex)] || null;
  }

  function normalizeDirectionInput(value, fallback = "buy") {
    const normalized = String(value || "").trim().toLowerCase();
    if (["sell", "卖出", "委托卖出"].includes(normalized)) {
      return "sell";
    }
    if (["buy", "买入", "委托买入"].includes(normalized)) {
      return "buy";
    }
    return normalizeDirection(fallback);
  }

  function focusEditingField(meta, field = detailViewState.editingField || "time") {
    const selector = `[data-field="${field}"][data-source-type="${meta.sourceType}"][data-row-index="${meta.rowIndex}"]${meta.itemKey ? `[data-item-key="${meta.itemKey}"]` : ""}`;
    const target = elements.parsedSheetBody.querySelector(selector);

    if (!(target instanceof HTMLElement)) {
      return;
    }

    target.focus();
    if (field === "time" && typeof target.showPicker === "function") {
      target.showPicker();
    }
  }

  function setEditingRow(meta, field = "time") {
    const currentRow = getRowByMeta(meta);
    if (!currentRow) {
      setOcrStatus("未找到对应明细", "error");
      return;
    }

    detailViewState.editingKey = `${meta.sourceType}:${meta.itemKey || "base"}:${meta.rowIndex}`;
    detailViewState.editingField = field;
    update();
    window.requestAnimationFrame(() => {
      focusEditingField(meta, field);
    });
  }

  function clearEditingRow() {
    detailViewState.editingKey = null;
    detailViewState.editingField = null;
  }

  function readEditingRowValues(meta) {
    const currentRow = getRowByMeta(meta);
    if (!currentRow) {
      return null;
    }

    const selector = (field) =>
      `[data-field="${field}"][data-source-type="${meta.sourceType}"][data-row-index="${meta.rowIndex}"]${meta.itemKey ? `[data-item-key="${meta.itemKey}"]` : ""}`;

    const timeInput = elements.parsedSheetBody.querySelector(selector("time"));
    const directionInput = elements.parsedSheetBody.querySelector(selector("direction"));
    const weightInput = elements.parsedSheetBody.querySelector(selector("weight"));
    const priceInput = elements.parsedSheetBody.querySelector(selector("price"));

    return {
      time: timeInput?.value?.trim() || currentRow.time || "",
      direction: directionInput?.value || currentRow.direction || "buy",
      weight: weightInput?.value?.trim() || currentRow.weight || "",
      price: priceInput?.value?.trim() || currentRow.price || "",
    };
  }

  function saveEditedDetailRow(meta) {
    const currentRow = getRowByMeta(meta);
    if (!currentRow) {
      setOcrStatus("未找到对应明细", "error");
      return;
    }

    const values = readEditingRowValues(meta);
    const nextRow = createStructuredRow({
      time: values.time,
      direction: normalizeDirectionInput(values.direction, currentRow.direction),
      weight: values.weight,
      price: values.price,
    });

    if (!nextRow) {
      setOcrStatus("明细更新失败，请检查日期、克重和单价格式", "error");
      return;
    }

    const store = getRowStoreByMeta(meta);
    store[Number(meta.rowIndex)] = nextRow;

    if (meta.sourceType === "image") {
      syncImageItemMetrics(findImageItemByKey(meta.itemKey));
    }

    clearEditingRow();
    markWorkspaceDirty();
    update();
    setOcrStatus("已更新 1 笔明细");
  }

  function sanitizeInlineEditInput(target) {
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.dataset.sanitize === "weight") {
      const nextValue = sanitizeDecimalInput(
        target.value,
        { maxIntegers: 3, maxDecimals: 4 },
        target.dataset.lastValue || ""
      );
      target.value = nextValue;
      target.dataset.lastValue = nextValue;
    }

    if (target.dataset.sanitize === "price") {
      const nextValue = sanitizeDecimalInput(
        target.value,
        { maxIntegers: 5, maxDecimals: 2 },
        target.dataset.lastValue || ""
      );
      target.value = nextValue;
      target.dataset.lastValue = nextValue;
    }
  }

  function deleteDetailRow(meta) {
    const currentRow = getRowByMeta(meta);
    if (!currentRow) {
      setOcrStatus("未找到对应明细", "error");
      return;
    }

    if (!window.confirm("删除这笔明细后将无法恢复，是否继续？")) {
      return;
    }

    const store = getRowStoreByMeta(meta);
    store.splice(Number(meta.rowIndex), 1);

    if (meta.sourceType === "image") {
      syncImageItemMetrics(findImageItemByKey(meta.itemKey));
    }

    markWorkspaceDirty();
    update();
    setOcrStatus("已删除 1 笔明细");
  }

  function clearLoadedRows() {
    if (!workspaceState.baseRows.length) {
      setOcrStatus("当前没有已载入记录", "error");
      return;
    }

    if (!window.confirm(`清空已载入的 ${workspaceState.baseRows.length} 笔记录后将无法恢复，是否继续？`)) {
      return;
    }

    clearEditingRow();
    workspaceState.baseRows = [];
    markWorkspaceDirty();
    update();
    setOcrStatus("已清空已载入记录");
  }

  function renderParsedSheet() {
    const rows = getDisplayRows();
    const { baseEntries, imageGroups, flatEntries } = getDetailRowEntries();
    let footerRows = rows;
    elements.parsedSheetBody.innerHTML = "";
    elements.parsedSheetFoot.innerHTML = "";
    elements.parsedAmountHead.textContent = "成交金额(元)";

    if (!flatEntries.length && detailViewState.mode !== "by-image") {
      appendParsedEmptyRow("暂无识别明细");
      return;
    }

    if (!flatEntries.length && detailViewState.mode === "by-image" && !imageState.items.length) {
      appendParsedEmptyRow("暂无识别明细");
      return;
    }

    if (detailViewState.mode === "by-image") {
      let rowNumber = 1;
      let hasVisibleContent = false;

      const visibleBaseEntries = getVisibleDetailEntries(baseEntries);
      footerRows = detailViewState.onlyAnomalies
        ? [
            ...visibleBaseEntries.map((entry) => entry.row),
            ...imageGroups.flatMap((group) => getVisibleDetailEntries(group.entries).map((entry) => entry.row)),
          ]
        : rows;

      if (visibleBaseEntries.length) {
        hasVisibleContent = true;
        appendParsedGroupRow(
          `已载入记录 · ${visibleBaseEntries.length} 笔${detailViewState.onlyAnomalies ? "异常明细" : "（非本次截图）"}`,
          {
            actionButtons: detailViewState.onlyAnomalies
              ? []
              : [
                  {
                    action: "clear-loaded-rows",
                    label: "清空已载入",
                    className: "secondary small",
                  },
                ],
          }
        );
        visibleBaseEntries.forEach((entry) => {
          appendParsedDataRow(entry, rowNumber);
          rowNumber += 1;
        });
        appendParsedSubtotalRow("已载入记录小计", visibleBaseEntries.map((entry) => entry.row));
      }

      imageGroups.forEach(({ item, imageIndex, entries }) => {
        const statusLabel = STATUS_LABELS[item.status] || "待识别";
        const visibleEntries = getVisibleDetailEntries(entries);
        const issueMessage = getItemIssueMessage(item);
        const shouldShowGroup =
          visibleEntries.length ||
          (!detailViewState.onlyAnomalies && !(item.rows || []).length) ||
          (detailViewState.onlyAnomalies && Boolean(issueMessage));

        if (!shouldShowGroup) {
          return;
        }

        hasVisibleContent = true;

        const anomalySuffix = detailViewState.onlyAnomalies && visibleEntries.length
          ? ` · 异常 ${visibleEntries.length} 笔`
          : item.rows?.length
            ? ` · ${item.rows.length} 笔`
            : "";
        const groupTitle = `截图 ${imageIndex + 1} · ${statusLabel}${anomalySuffix}`;
        appendParsedGroupRow(groupTitle, {
          previewKey: item.key,
          previewUrl: item.previewUrl,
        });

        if (visibleEntries.length) {
          visibleEntries.forEach((entry) => {
            appendParsedDataRow(entry, rowNumber);
            rowNumber += 1;
          });
          appendParsedSubtotalRow(`截图 ${imageIndex + 1} 小计`, visibleEntries.map((entry) => entry.row));
        }

        if (!visibleEntries.length) {
          const messageMap = {
            queued: "尚未识别",
            processing: "正在识别",
            done: "未提取到成交明细",
            error: item.error || "结果需复查",
          };
          appendParsedEmptyRow(issueMessage || messageMap[item.status] || "暂无识别结果");
        }
      });

      if (!hasVisibleContent) {
        appendParsedEmptyRow(detailViewState.onlyAnomalies ? "暂无异常明细" : "暂无识别明细");
        return;
      }
    } else {
      const visibleFlatEntries = getVisibleDetailEntries(flatEntries);
      if (!visibleFlatEntries.length) {
        appendParsedEmptyRow(detailViewState.onlyAnomalies ? "暂无异常明细" : "暂无识别明细");
        return;
      }

      footerRows = visibleFlatEntries.map((entry) => entry.row);
      visibleFlatEntries.forEach((entry, index) => {
        appendParsedDataRow(entry, index + 1);
      });
    }

    const totals = calculateTotals(footerRows);
    const footRow = document.createElement("tr");
    [
      "总计",
      `${totals.count} 笔`,
      "",
      formatAbsolutePlainCompact(totals.netWeight, 4),
      "",
      formatAbsolutePlainCompact(totals.netAmount, 2),
      "",
    ].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      footRow.appendChild(td);
    });
    elements.parsedSheetFoot.appendChild(footRow);
  }

  return {
    clearEditingRow,
    clearLoadedRows,
    deleteDetailRow,
    renderDetailSortIndicators,
    renderParsedSheet,
    sanitizeInlineEditInput,
    saveEditedDetailRow,
    setEditingRow,
    toggleDetailSort,
  };
}
