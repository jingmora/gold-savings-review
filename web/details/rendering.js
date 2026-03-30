import { STATUS_LABELS } from "../config.js";
import {
  formatAbsolutePlainCompact,
  formatPlainCompact,
  toNumber,
} from "../lib/formatters.js";
import {
  getSignedAmountValue,
  getSignedWeightValue,
} from "../lib/row-utils.js";

export function createDetailsRenderApi({
  calculateTotals,
  detailViewState,
  editingApi,
  elements,
  entriesApi,
  getDirectionLabel,
  getDisplayRows,
  imageState,
}) {
  const {
    canEditDetailEntry,
    createInlineEditControl,
    createMetaDataset,
    isEditingEntryField,
  } = editingApi;
  const {
    getDetailRowEntries,
    getItemIssueMessage,
    getVisibleDetailEntries,
  } = entriesApi;

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
    renderParsedSheet,
  };
}
