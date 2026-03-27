// Import/export stays beside persistence code so history-related file formats remain co-located.
import { sanitizeFileName } from "../lib/formatters.js";
import {
  parseImportedBatchPayload,
  toPortableBatchRecord,
} from "../../src/history-transfer-tools.mjs";

export function createBatchTransferApi({
  buildBatchSummary,
  buildDailySummaryFromRows,
  putBatch,
  refreshBatchLibrary,
  setOcrStatus,
  update,
  workspaceState,
}) {
  function downloadFile(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function saveViaFilePicker(name, content) {
    const picker = window.showSaveFilePicker || window.top?.showSaveFilePicker;
    if (typeof picker !== "function") {
      return { saved: false, usedPicker: false, fileName: name, reason: "picker-unavailable" };
    }

    try {
      const handle = await picker.call(window, {
        suggestedName: name,
        excludeAcceptAllOption: false,
        types: [
          {
            description: "JSON 文件",
            accept: {
              "application/json": [".json"],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return { saved: true, usedPicker: true, fileName: name };
    } catch (error) {
      if (error?.name === "AbortError") {
        return { saved: false, usedPicker: true, fileName: name };
      }
      return {
        saved: false,
        usedPicker: false,
        fileName: name,
        reason: error instanceof Error ? error.message : "picker-failed",
      };
    }
  }

  async function saveViaLocalBridge(name, content) {
    try {
      const response = await fetch("/__api/save-json", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          suggestedName: name,
          content,
        }),
      });

      if (!response.ok) {
        return { saved: false, usedPicker: false, fileName: name, reason: "bridge-unavailable" };
      }

      const payload = await response.json().catch(() => ({}));
      if (payload?.ok) {
        return {
          saved: true,
          usedPicker: true,
          fileName: name,
          path: payload.path || "",
        };
      }

      if (payload?.cancelled) {
        return { saved: false, usedPicker: true, fileName: name };
      }

      return { saved: false, usedPicker: false, fileName: name, reason: payload?.error || "bridge-unavailable" };
    } catch (error) {
      return { saved: false, usedPicker: false, fileName: name, reason: "bridge-unavailable" };
    }
  }

  async function saveJsonFile(name, content) {
    const pickerResult = await saveViaFilePicker(name, content);
    if (pickerResult.saved || pickerResult.usedPicker) {
      return pickerResult;
    }

    // Keep the macOS NSSavePanel bridge as a fallback option in code,
    // but temporarily disable it so we can verify that the browser-side
    // file picker appears in the foreground of the current page.
    //
    // const bridgeResult = await saveViaLocalBridge(name, content);
    // if (bridgeResult.saved || bridgeResult.usedPicker) {
    //   return bridgeResult;
    // }

    const normalizedName = sanitizeFileName(name).replace(/\.json$/i, "");
    const finalName = `${normalizedName}.json`;
    downloadFile(finalName, content, "application/json");
    return {
      saved: true,
      usedPicker: false,
      fileName: finalName,
      reason: pickerResult.reason || "download-fallback",
    };
  }

  function buildExportFileName(label) {
    const normalized = sanitizeFileName(String(label || "history-batches").replace(/\.json$/i, ""));
    return `${normalized}.json`;
  }

  async function exportSingleBatch(batch) {
    if (!batch) {
      setOcrStatus("未找到对应批次", "error");
      return;
    }

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      batches: [
        toPortableBatchRecord(batch, {
          buildBatchSummary,
          buildDailySummaryFromRows,
        }),
      ],
    };
    const fileName = buildExportFileName(batch.name || "batch");
    const result = await saveJsonFile(fileName, JSON.stringify(payload, null, 2));
    if (!result.saved) {
      setOcrStatus("已取消导出");
      return;
    }
    if (result.reason === "bridge-unavailable") {
      setOcrStatus("本地导出服务不可用，请重新打开积存金复盘台后再试", "error");
      return;
    }
    if (!result.usedPicker) {
      setOcrStatus(`当前环境不支持选择保存路径，已下载到默认目录：${result.fileName}`);
      return;
    }
    if (result.path) {
      setOcrStatus(`已导出到：${result.path}`);
      return;
    }
    setOcrStatus(`已导出批次：${batch.name}`);
  }

  async function exportBatchData() {
    if (!workspaceState.db) {
      setOcrStatus("当前浏览器不支持本地批次库", "error");
      return;
    }

    if (!workspaceState.batches.length) {
      setOcrStatus("暂无可导出的历史批次", "error");
      return;
    }

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      batches: workspaceState.batches.map((batch) =>
        toPortableBatchRecord(batch, {
          buildBatchSummary,
          buildDailySummaryFromRows,
        })
      ),
    };
    const fileName = buildExportFileName("history-batches");
    const result = await saveJsonFile(fileName, JSON.stringify(payload, null, 2));
    if (!result.saved) {
      setOcrStatus("已取消导出");
      return;
    }
    if (result.reason === "bridge-unavailable") {
      setOcrStatus("本地导出服务不可用，请重新打开积存金复盘台后再试", "error");
      return;
    }
    if (!result.usedPicker) {
      setOcrStatus(`当前环境不支持选择保存路径，已下载到默认目录：${result.fileName}`);
      return;
    }
    if (result.path) {
      setOcrStatus(`已导出到：${result.path}`);
      return;
    }
    setOcrStatus(`已导出 ${workspaceState.batches.length} 个历史批次`);
  }
  async function importBatchData(file) {
    if (!file) {
      return;
    }

    if (!workspaceState.db) {
      setOcrStatus("当前浏览器不支持本地批次库", "error");
      return;
    }

    const rawText = await file.text();
    let parsed;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      setOcrStatus("批次数据不是有效的 JSON 文件", "error");
      return;
    }

    const records = parseImportedBatchPayload(parsed);
    if (!records.length) {
      setOcrStatus("JSON 文件中没有可导入的批次", "error");
      return;
    }

    for (const record of records) {
      await putBatch(
        toPortableBatchRecord(record, {
          buildBatchSummary,
          buildDailySummaryFromRows,
        })
      );
    }

    await refreshBatchLibrary();
    update();
    setOcrStatus(`已导入 ${records.length} 个历史批次`);
  }

  return {
    exportBatchData,
    exportSingleBatch,
    importBatchData,
  };
}
