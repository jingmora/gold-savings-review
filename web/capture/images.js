// Screenshot queue, previews, and queue-side UI state are grouped under capture.
import { STATUS_LABELS } from "../config.js";

export function createImageQueueApi({
  elements,
  imageState,
  markWorkspaceDirty,
  setOcrStatus,
  update,
  workspaceState,
}) {
  function createImageKey(file) {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }

  function revokeImagePreview(item) {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }

  function closeImageLightbox() {
    elements.lightbox.classList.add("is-hidden");
    elements.lightbox.setAttribute("aria-hidden", "true");
    elements.lightboxImage.removeAttribute("src");
  }

  function clearQueueItems() {
    imageState.items.forEach(revokeImagePreview);
    imageState.items = [];
    elements.imageInput.value = "";
    closeImageLightbox();
  }

  function addImageFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => file?.type?.startsWith("image/"));
    if (!files.length) {
      setOcrStatus("请导入有效截图或直接粘贴截图", "error");
      return;
    }

    const existingKeys = new Set(imageState.items.map((item) => item.key));
    let addedCount = 0;

    files.forEach((file) => {
      const key = createImageKey(file);
      if (existingKeys.has(key)) {
        return;
      }

      imageState.items.push({
        key,
        file,
        previewUrl: URL.createObjectURL(file),
        status: "queued",
        rawText: "",
        rows: [],
        extractedCount: 0,
        skippedCount: 0,
        error: "",
      });
      existingKeys.add(key);
      addedCount += 1;
    });

    if (!addedCount) {
      update();
      setOcrStatus(`队列里已有 ${imageState.items.length} 张截图，未重复加入`);
      return;
    }

    markWorkspaceDirty();
    update();
    setOcrStatus(`已加入 ${addedCount} 张截图，当前共 ${imageState.items.length} 张`);
  }

  function rebuildTextFromQueue() {
    return imageState.items.flatMap((item) => item.rows || []);
  }

  function computeQueueStats() {
    return imageState.items.reduce(
      (stats, item) => {
        stats.total += 1;
        if (item.status === "done") {
          stats.done += 1;
        }
        if (item.status === "processing") {
          stats.processing += 1;
        }
        if (item.status === "error") {
          stats.error += 1;
        }
        stats.extracted += item.extractedCount || 0;
        stats.skipped += item.skippedCount || 0;
        return stats;
      },
      { total: 0, done: 0, processing: 0, error: 0, extracted: 0, skipped: 0 }
    );
  }

  function findImageItemByKey(key) {
    return imageState.items.find((item) => item.key === key) || null;
  }

  function syncImageItemMetrics(item) {
    if (!item) {
      return;
    }

    item.extractedCount = (item.rows || []).length;
  }

  function openImageLightbox(key) {
    const item = findImageItemByKey(key);
    if (!item) {
      return;
    }

    elements.lightboxImage.src = item.previewUrl;
    elements.lightboxImage.alt = item.file?.name || "截图放大预览";
    elements.lightbox.classList.remove("is-hidden");
    elements.lightbox.setAttribute("aria-hidden", "false");
  }

  function setDropzoneActive(isActive) {
    elements.imageDropzone.classList.toggle("drag-over", isActive);
  }

  function removeImage(key) {
    const target = findImageItemByKey(key);
    if (!target) {
      return;
    }

    revokeImagePreview(target);
    imageState.items = imageState.items.filter((item) => item.key !== key);
    markWorkspaceDirty();
    update();

    if (!imageState.items.length && !workspaceState.baseRows.length) {
      setOcrStatus("等待导入截图");
      return;
    }

    setOcrStatus(`已删除 1 张截图，当前剩余 ${imageState.items.length} 张`);
  }

  function clearRecognitionResults() {
    imageState.items = imageState.items.map((item) => ({
      ...item,
      status: "queued",
      rawText: "",
      rows: [],
      extractedCount: 0,
      skippedCount: 0,
      error: "",
    }));
    markWorkspaceDirty();
    update();
    setOcrStatus(imageState.items.length ? "已清空识别结果，队列仍保留" : "已清空识别结果");
  }

  function clearImageSelection() {
    if (!imageState.items.length) {
      setOcrStatus(workspaceState.baseRows.length ? "当前批次无待处理截图" : "等待导入截图");
      return;
    }

    clearQueueItems();
    markWorkspaceDirty();
    update();
    setOcrStatus(workspaceState.baseRows.length ? "已清空待处理截图" : "等待导入截图");
  }

  function renderQueueSummary() {
    const stats = computeQueueStats();
    elements.queueTotalImages.textContent = String(stats.total);
    elements.queueDoneImages.textContent = String(stats.done);
    elements.queueExtractedRows.textContent = String(stats.extracted);
  }

  function renderImageQueue() {
    if (!imageState.items.length) {
      elements.imagePreview.classList.add("is-empty");
      elements.imagePreview.innerHTML = "暂无截图";
      return;
    }

    elements.imagePreview.classList.remove("is-empty");
    elements.imagePreview.innerHTML = "";

    imageState.items.forEach((item, index) => {
      const article = document.createElement("article");
      article.className = "queue-item";
      article.dataset.status = item.status;

      const thumbButton = document.createElement("button");
      thumbButton.type = "button";
      thumbButton.className = "queue-thumb";
      thumbButton.dataset.action = "preview";
      thumbButton.dataset.key = item.key;

      const image = document.createElement("img");
      image.src = item.previewUrl;
      image.alt = `交易截图预览 ${index + 1}`;
      thumbButton.appendChild(image);

      const main = document.createElement("div");
      main.className = "queue-main";

      const title = document.createElement("p");
      title.className = "queue-title";
      title.textContent = `截图 ${index + 1}`;

      const summary = document.createElement("p");
      summary.className = `queue-summary${item.status === "error" ? " error" : ""}`;
      if (item.status === "queued") {
        summary.textContent = "尚未识别";
      } else if (item.status === "processing") {
        summary.textContent = "正在识别";
      } else if (item.status === "done") {
        summary.textContent = item.skippedCount
          ? `成交 ${item.extractedCount} 笔 · 跳过 ${item.skippedCount} 笔`
          : `成交 ${item.extractedCount} 笔`;
      } else {
        summary.textContent = item.error || "结果需复查";
      }

      main.appendChild(title);
      main.appendChild(summary);

      const badge = document.createElement("span");
      badge.className = `status-badge ${item.status}`;
      badge.textContent = STATUS_LABELS[item.status];

      const actions = document.createElement("div");
      actions.className = "queue-actions";

      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.className = "secondary small";
      retryButton.dataset.action = "retry";
      retryButton.dataset.key = item.key;
      retryButton.disabled = imageState.processing;
      retryButton.textContent = item.status === "done" ? "重识别" : "识别";

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "secondary danger small";
      removeButton.dataset.action = "remove";
      removeButton.dataset.key = item.key;
      removeButton.disabled = imageState.processing;
      removeButton.textContent = "删除";

      actions.appendChild(retryButton);
      actions.appendChild(removeButton);

      article.appendChild(thumbButton);
      article.appendChild(main);
      article.appendChild(badge);
      article.appendChild(actions);
      elements.imagePreview.appendChild(article);
    });
  }

  return {
    addImageFiles,
    clearImageSelection,
    clearQueueItems,
    clearRecognitionResults,
    closeImageLightbox,
    computeQueueStats,
    findImageItemByKey,
    openImageLightbox,
    rebuildTextFromQueue,
    removeImage,
    renderImageQueue,
    renderQueueSummary,
    setDropzoneActive,
    syncImageItemMetrics,
  };
}
