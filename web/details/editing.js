import { createStructuredRow, normalizeDigits } from "../lib/ocr-utils.js";
import { normalizeDirection } from "../lib/row-utils.js";

export function createDetailEditingApi({
  detailViewState,
  elements,
  findImageItemByKey,
  markWorkspaceDirty,
  setOcrStatus,
  syncImageItemMetrics,
  update,
  workspaceState,
}) {
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

  return {
    canEditDetailEntry,
    clearEditingRow,
    clearLoadedRows,
    createInlineEditControl,
    createMetaDataset,
    deleteDetailRow,
    isEditingEntryField,
    sanitizeInlineEditInput,
    saveEditedDetailRow,
    setEditingRow,
  };
}
