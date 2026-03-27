// OCR orchestration stays separate from queue management but inside the same capture domain.
import {
  LOCAL_OCR_SERVICE_TIMEOUT_MS,
  LOCAL_OCR_SERVICE_URL,
} from "../config.js";
import { toNumber } from "../lib/formatters.js";
import {
  formatExtractedNumber,
  normalizeTimeValue,
  serializeStructuredRows,
} from "../lib/ocr-utils.js";
import { createRowKey } from "../lib/row-utils.js";

const OCR_CANVAS_SCALE = 1.65;

export function createOcrApi({
  computeQueueStats,
  deriveStructuredTextFromOcr,
  imageState,
  markWorkspaceDirty,
  ocrEngineState,
  rebuildTextFromQueue,
  setOcrStatus,
  update,
  workspaceState,
  elements,
}) {
  function createTimeoutSignal(timeoutMs) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    return {
      signal: controller.signal,
      release() {
        window.clearTimeout(timer);
      },
    };
  }

  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = LOCAL_OCR_SERVICE_TIMEOUT_MS) {
    const timeout = createTimeoutSignal(timeoutMs);

    try {
      const response = await window.fetch(url, {
        ...options,
        signal: timeout.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `请求失败（${response.status}）`);
      }
      return payload;
    } finally {
      timeout.release();
    }
  }

  async function detectOcrEngine(force = false) {
    if (ocrEngineState.checked && !force) {
      return ocrEngineState;
    }

    try {
      const payload = await fetchJsonWithTimeout(`${LOCAL_OCR_SERVICE_URL}/health`, {}, 1500);
      ocrEngineState.checked = true;
      ocrEngineState.available = Boolean(payload?.ok);
      ocrEngineState.mode = payload?.engine || "python";
      return ocrEngineState;
    } catch {
      ocrEngineState.checked = true;
      ocrEngineState.available = false;
      ocrEngineState.mode = "";
      return ocrEngineState;
    }
  }

  function adaptStructuredTradeRecord(record) {
    if (!record || record.record_type !== "gold_trade") {
      return null;
    }

    const fields = record.fields || {};
    const tradeAction = fields.trade_action === "sell" ? "sell" : "buy";
    const weight = toNumber(fields.weight_g);
    const price = toNumber(fields.deal_price_cny);

    if (weight <= 0 || price <= 0) {
      return null;
    }

    return {
      time: normalizeTimeValue(fields.trade_date),
      direction: tradeAction,
      weight: formatExtractedNumber(weight, 4),
      price: formatExtractedNumber(price, 2),
    };
  }

  function adaptStructuredTradeRecords(records) {
    return (records || []).map(adaptStructuredTradeRecord).filter(Boolean);
  }

  function countSkippedReviewRecords(reviewRecords) {
    return (reviewRecords || []).filter((record) => {
      const category = String(record?.category || "").trim().toLowerCase();
      return category === "skipped" || record?.reason === "excluded_entry";
    }).length;
  }

  function parseExplicitCount(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }

  function createStructuredResultFromTradeRecords(records, reviewRecords = [], rawText = "", counts = null) {
    const rows = adaptStructuredTradeRecords(records);
    const explicitSkippedCount = parseExplicitCount(counts?.skipped_entries);
    return {
      rows,
      text: serializeStructuredRows(rows),
      extractedCount: rows.length,
      skippedCount: explicitSkippedCount ?? countSkippedReviewRecords(reviewRecords),
      parser: "paddleocr-python-service",
      rawText,
      records: records || [],
      counts: counts || null,
      reviewRecords,
    };
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("截图读取失败，请重新导入后重试"));
      reader.readAsDataURL(file);
    });
  }

  function deriveStructuredResultFromOcrPayload(payload) {
    const boxes = payload?.ocr_result?.boxes;
    const source = Array.isArray(boxes) && boxes.length
      ? {
          rawText: payload?.raw_text || "",
          words: boxes.map((box) => ({
            text: box?.text || "",
            bbox: box?.bbox || {},
            confidence: box?.confidence || 0,
          })),
        }
      : payload?.raw_text || "";

    const derived = deriveStructuredTextFromOcr(source);
    return {
      ...derived,
      records: payload?.records || [],
      reviewRecords: payload?.review_records || [],
      counts: payload?.counts || null,
      rawText: payload?.raw_text || "",
    };
  }

  function choosePreferredStructuredResult(primaryResult, fallbackResult) {
    const primaryRows = primaryResult?.rows?.length || 0;
    const fallbackRows = fallbackResult?.rows?.length || 0;
    return fallbackRows > primaryRows ? fallbackResult : primaryResult;
  }

  async function requestLocalOcrBinary(file, index) {
    return fetchJsonWithTimeout(`${LOCAL_OCR_SERVICE_URL}/recognize`, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-Image-Name": encodeURIComponent(file.name || `image-${index + 1}.png`),
      },
      body: file,
    });
  }

  async function requestLocalOcrLegacyJson(file) {
    const imageDataUrl = await readFileAsDataUrl(file);
    return fetchJsonWithTimeout(`${LOCAL_OCR_SERVICE_URL}/recognize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_name: file.name,
        image_data_url: imageDataUrl,
      }),
    });
  }

  async function recognizeWithLocalOcrService(file, index, total) {
    setOcrStatus(`正在调用本地 OCR 服务识别第 ${index + 1}/${total} 张`, "processing");
    let payload;
    try {
      payload = await requestLocalOcrBinary(file, index);
    } catch (binaryError) {
      try {
        payload = await requestLocalOcrLegacyJson(file);
      } catch {
        throw binaryError;
      }
    }

    const serviceStructuredResult = createStructuredResultFromTradeRecords(
      payload?.records || [],
      payload?.review_records || [],
      payload?.raw_text || "",
      payload?.counts || null
    );
    const fallbackStructuredResult = deriveStructuredResultFromOcrPayload(payload);
    const structuredResult = choosePreferredStructuredResult(serviceStructuredResult, fallbackStructuredResult);

    return {
      rawText: payload?.raw_text || "",
      structuredResult,
    };
  }

  function shouldUseSegmentedOcr(imageSource) {
    if (!imageSource?.width || !imageSource?.height) {
      return false;
    }

    return imageSource.height >= 2200 && imageSource.height / imageSource.width >= 1.8;
  }

  function createOcrSlices(imageSource) {
    const preferredHeight = Math.max(1100, Math.min(1600, Math.round(imageSource.width * 1.55)));
    const overlap = Math.max(120, Math.round(preferredHeight * 0.12));
    const slices = [];
    let top = 0;

    while (top < imageSource.height) {
      const height = Math.min(preferredHeight, imageSource.height - top);
      slices.push({ top, height });
      if (top + height >= imageSource.height) {
        break;
      }
      top += preferredHeight - overlap;
    }

    return slices;
  }

  function buildOcrCanvas(imageSource, slice = null, scale = OCR_CANVAS_SCALE) {
    const sourceX = 0;
    const sourceY = slice?.top || 0;
    const sourceWidth = imageSource.width;
    const sourceHeight = slice?.height || imageSource.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return null;
    }

    context.imageSmoothingEnabled = true;
    context.drawImage(
      imageSource,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const gray = red * 0.299 + green * 0.587 + blue * 0.114;
      const contrasted = gray > 214 ? 255 : Math.max(0, Math.min(255, (gray - 128) * 1.18 + 128));
      data[index] = contrasted;
      data[index + 1] = contrasted;
      data[index + 2] = contrasted;
    }
    context.putImageData(imageData, 0, 0);

    return canvas;
  }

  function releaseCanvas(canvas) {
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    context?.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
  }

  function scaleOcrBBox(bbox, coordScale = 1, offsetX = 0, offsetY = 0) {
    return {
      x0: toNumber(bbox?.x0) * coordScale + offsetX,
      y0: toNumber(bbox?.y0) * coordScale + offsetY,
      x1: toNumber(bbox?.x1) * coordScale + offsetX,
      y1: toNumber(bbox?.y1) * coordScale + offsetY,
    };
  }

  function normalizeOcrWord(word, options = {}) {
    const text = String(word?.text || "").trim();
    if (!text) {
      return null;
    }

    return {
      text,
      confidence: Number(word?.confidence) || 0,
      bbox: scaleOcrBBox(word?.bbox, options.coordScale, options.offsetX, options.offsetY),
    };
  }

  function normalizeOcrLine(line, options = {}) {
    const words = (line?.words || []).map((word) => normalizeOcrWord(word, options)).filter(Boolean);
    const text = String(line?.text || words.map((word) => word.text).join(" ")).trim();
    if (!text) {
      return null;
    }

    return {
      text,
      confidence: Number(line?.confidence) || 0,
      bbox: scaleOcrBBox(line?.bbox, options.coordScale, options.offsetX, options.offsetY),
      words,
    };
  }

  function createStructuredRecognitionPayload(data, options = {}) {
    const lines = (data?.lines || []).map((line) => normalizeOcrLine(line, options)).filter(Boolean);
    const lineWords = lines.flatMap((line) => line.words || []);
    const standaloneWords = (data?.words || []).map((word) => normalizeOcrWord(word, options)).filter(Boolean);
    const words = lineWords.length ? lineWords : standaloneWords;

    return {
      rawText: data?.text ? String(data.text).trim() : lines.map((line) => line.text).join("\n"),
      confidence: Number(data?.confidence) || 0,
      lines,
      words,
    };
  }

  function mergeRowsWithOverlap(baseRows, nextRows) {
    if (!baseRows.length) {
      return [...nextRows];
    }
    if (!nextRows.length) {
      return [...baseRows];
    }

    const maxOverlap = Math.min(4, baseRows.length, nextRows.length);
    let overlapSize = 0;

    for (let size = maxOverlap; size > 0; size -= 1) {
      const baseSlice = baseRows.slice(-size).map(createRowKey);
      const nextSlice = nextRows.slice(0, size).map(createRowKey);
      if (baseSlice.every((key, index) => key === nextSlice[index])) {
        overlapSize = size;
        break;
      }
    }

    return [...baseRows, ...nextRows.slice(overlapSize)];
  }

  async function loadImageElement(file) {
    const objectUrl = URL.createObjectURL(file);

    try {
      const image = new Image();
      image.decoding = "async";
      image.src = objectUrl;

      if (typeof image.decode === "function") {
        await image.decode();
      } else {
        await new Promise((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("图片加载失败"));
        });
      }

      return {
        source: image,
        release() {
          URL.revokeObjectURL(objectUrl);
        },
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  async function loadImageSource(file) {
    if (window.createImageBitmap) {
      try {
        const bitmap = await window.createImageBitmap(file);
        return {
          source: bitmap,
          release() {
            bitmap.close?.();
          },
        };
      } catch {
        // Fall back to HTMLImageElement below.
      }
    }

    try {
      return await loadImageElement(file);
    } catch {
      return null;
    }
  }

  async function runTesseractRecognition(source, logger, options = {}) {
    const result = await window.Tesseract.recognize(source, "eng+chi_sim", { logger });
    return createStructuredRecognitionPayload(result?.data, options);
  }

  async function recognizeSegmentedImage(file, index, total, imageSource) {
    const slices = createOcrSlices(imageSource);
    const merged = {
      rows: [],
      skippedCount: 0,
    };
    const rawTextParts = [];

    for (let sliceIndex = 0; sliceIndex < slices.length; sliceIndex += 1) {
      const slice = slices[sliceIndex];
      const canvas = buildOcrCanvas(imageSource, slice);
      if (!canvas) {
        continue;
      }

      try {
        const recognition = await runTesseractRecognition(canvas, (message) => {
          if (message.status === "recognizing text") {
            const progress = `${Math.round((message.progress || 0) * 100)}%`;
            setOcrStatus(`正在识别第 ${index + 1}/${total} 张，第 ${sliceIndex + 1}/${slices.length} 段 ${progress}`, "processing");
          }
        }, {
          coordScale: 1 / OCR_CANVAS_SCALE,
          offsetY: slice.top,
        });

        rawTextParts.push(recognition.rawText);
        const structuredResult = deriveStructuredTextFromOcr(recognition);
        merged.rows = mergeRowsWithOverlap(merged.rows, structuredResult.rows || []);
        merged.skippedCount += structuredResult.skippedCount || 0;
      } finally {
        releaseCanvas(canvas);
      }
    }

    return {
      rawText: rawTextParts.filter(Boolean).join("\n"),
      structuredResult: {
        rows: merged.rows,
        text: serializeStructuredRows(merged.rows),
        extractedCount: merged.rows.length,
        skippedCount: merged.skippedCount,
      },
    };
  }

  async function recognizeImageContent(file, index, total) {
    const engineState = await detectOcrEngine(true);
    if (engineState.available) {
      try {
        return await recognizeWithLocalOcrService(file, index, total);
      } catch (error) {
        console.warn("Local OCR service failed, falling back to browser OCR.", error);
        ocrEngineState.available = false;
      }
    }

    const imageAsset = await loadImageSource(file);
    const imageSource = imageAsset?.source || null;

    try {
      if (!imageSource) {
        throw new Error("截图读取失败，请重新导入后重试");
      }

      if (shouldUseSegmentedOcr(imageSource)) {
        const segmentedResult = await recognizeSegmentedImage(file, index, total, imageSource);
        if (segmentedResult.structuredResult.rows.length) {
          return segmentedResult;
        }
      }

      const fullCanvas = buildOcrCanvas(imageSource);
      try {
        const recognition = await runTesseractRecognition(fullCanvas || imageSource, (message) => {
          if (message.status === "recognizing text") {
            const progress = `${Math.round((message.progress || 0) * 100)}%`;
            setOcrStatus(`正在识别第 ${index + 1}/${total} 张，进度 ${progress}`, "processing");
          }
        }, {
          coordScale: fullCanvas ? 1 / OCR_CANVAS_SCALE : 1,
        });

        const structuredResult = deriveStructuredTextFromOcr(recognition);
        if (structuredResult.extractedCount === 0 && recognition.rawText.trim().length > 0) {
          console.warn("OCR extracted text but failed to structure it.");
        }

        return {
          rawText: recognition.rawText,
          structuredResult,
        };
      } finally {
        releaseCanvas(fullCanvas);
      }
    } finally {
      imageAsset?.release?.();
    }
  }

  async function recognizeOneImage(item, index, total) {
    item.status = "processing";
    item.error = "";
    item.rawText = "";
    item.extractedCount = 0;
    item.skippedCount = 0;
    update();

    const { rawText, structuredResult } = await recognizeImageContent(item.file, index, total);

    item.rows = structuredResult.rows || [];
    item.extractedCount = structuredResult.extractedCount;
    item.skippedCount = structuredResult.skippedCount;

    if (!rawText) {
      item.status = "error";
      item.error = "未识别出有效文字，建议裁剪后重试";
      return;
    }

    if (!structuredResult.text) {
      item.status = "error";
      item.error = "识别到了文字，但没整理出克重和单价";
      return;
    }

    item.status = "done";
    item.error = "";
  }

  async function recognizeSelectedImage(keys) {
    const targetItems = keys?.length
      ? imageState.items.filter((item) => keys.includes(item.key))
      : imageState.items;

    if (!targetItems.length) {
      setOcrStatus("请先上传至少一张交易截图", "error");
      return;
    }

    const engineState = await detectOcrEngine();
    if (!engineState.available && !window.Tesseract) {
      setOcrStatus("识别组件不可用。请启动本地 Python OCR 服务，或联网后刷新以启用浏览器识别", "error");
      return;
    }

    try {
      imageState.processing = true;
      markWorkspaceDirty();
      elements.recognizeImage.disabled = true;

      for (let index = 0; index < targetItems.length; index += 1) {
        await recognizeOneImage(targetItems[index], index, targetItems.length);
        update();
      }

      const stats = computeQueueStats();
      if (!rebuildTextFromQueue().length && !workspaceState.baseRows.length) {
        setOcrStatus("图片已识别，但没有提取到可读文本，建议裁剪后重试", "error");
        return;
      }

      const skippedText = stats.skipped ? `，跳过 ${stats.skipped} 笔` : "";
      const errorText = stats.error ? `，${stats.error} 张需复查` : "";
      setOcrStatus(`识别完成，共处理 ${targetItems.length} 张截图，整理出 ${stats.extracted} 笔成交${skippedText}${errorText}`);
    } catch (error) {
      setOcrStatus(`识别失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
    } finally {
      imageState.processing = false;
      elements.recognizeImage.disabled = false;
      update();
    }
  }

  return {
    detectOcrEngine,
    recognizeSelectedImage,
  };
}
