import { createRowKey } from "../lib/row-utils.js";
import {
  buildDuplicateCountMap,
  getRowAnomalies,
  sortRowEntries,
} from "../../src/detail-tools.mjs";

export function createDetailEntriesApi({
  detailViewState,
  getDisplayRows,
  imageState,
  workspaceState,
}) {
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

  return {
    getDetailRowEntries,
    getVisibleDetailEntries,
    getItemIssueMessage,
  };
}
