(function initGoldOcrCore(global) {
  function toNumber(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function trimTrailingZeros(value) {
    return String(value).replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "").replace(/\.$/u, "");
  }

  function normalizeDigits(text) {
    return String(text ?? "")
      .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 65248))
      .replace(/[，、；｜]/g, ",")
      .replace(/[。．·・]/g, ".")
      .replace(/[：]/g, ":")
      .replace(/[（]/g, "(")
      .replace(/[）]/g, ")");
  }

  function normalizeOcrText(text) {
    return normalizeDigits(text)
      .replace(/\r/g, "\n")
      .replace(/[¥￥Y]/g, "¥")
      .replace(/委托买人/g, "委托买入")
      .replace(/委托卖山/g, "委托卖出")
      .replace(/过期失校|过期失笑/g, "过期失效")
      .replace(/已失校/g, "已失效")
      .replace(/克教|克效/g, "克数")
      .replace(/成父价|戌交价/g, "成交价")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  function sanitizeNumberText(value) {
    return String(value ?? "").replace(/,/g, "").replace(/[^0-9.]/g, "");
  }

  function parseNumericValue(value) {
    const parsed = Number.parseFloat(sanitizeNumberText(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function roundNumericValue(value, decimals) {
    const factor = 10 ** decimals;
    return Math.round(Number(value || 0) * factor) / factor;
  }

  function formatExtractedNumber(value, decimals) {
    return trimTrailingZeros(Number(value || 0).toFixed(decimals));
  }

  function normalizeExtractedPriceValue(value) {
    const numeric = roundNumericValue(value, 2);
    const nearestInteger = Math.round(numeric);

    if (Math.abs(numeric - nearestInteger) <= 0.011) {
      return nearestInteger;
    }

    return numeric;
  }

  function reconcileTradeValues({ weight = 0, price = 0, amount = 0 }) {
    let nextWeight = toNumber(weight);
    let nextPrice = toNumber(price);
    const nextAmount = toNumber(amount);

    if (nextAmount > 0 && nextWeight > 0) {
      const reconstructedPrice = roundNumericValue(nextAmount / nextWeight, 2);
      const currentGap = nextPrice > 0 ? Math.abs(nextAmount - nextWeight * nextPrice) : Number.POSITIVE_INFINITY;
      const reconstructedGap = Math.abs(nextAmount - nextWeight * reconstructedPrice);

      if (!nextPrice || (Math.abs(nextPrice - reconstructedPrice) <= 0.02 && reconstructedGap + 0.005 < currentGap)) {
        nextPrice = reconstructedPrice;
      }
    }

    if (nextAmount > 0 && nextPrice > 0) {
      const reconstructedWeight = roundNumericValue(nextAmount / nextPrice, 4);
      const currentGap = nextWeight > 0 ? Math.abs(nextAmount - nextWeight * nextPrice) : Number.POSITIVE_INFINITY;
      const reconstructedGap = Math.abs(nextAmount - reconstructedWeight * nextPrice);

      if (!nextWeight || (Math.abs(nextWeight - reconstructedWeight) <= 0.0002 && reconstructedGap + 0.005 < currentGap)) {
        nextWeight = reconstructedWeight;
      }
    }

    return {
      weight: nextWeight,
      price: nextPrice,
    };
  }

  function normalizeDirection(value) {
    return value === "sell" ? "sell" : "buy";
  }

  function extractDirectionFromText(text) {
    const normalized = normalizeOcrText(text);
    if (/委托卖出/.test(normalized)) {
      return "sell";
    }
    if (/委托买入/.test(normalized)) {
      return "buy";
    }
    return "";
  }

  function normalizeTimeValue(value) {
    const match = String(value ?? "").match(
      /(20\d{2})[-/.年]\s*(\d{1,2})[-/.月]\s*(\d{1,2})(?:[日号]?\s*(\d{1,2}:\d{2}))?/
    );
    if (!match) {
      return "";
    }

    const [, year, month, day, time = ""] = match;
    const normalizedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    return time ? `${normalizedDate} ${time}` : normalizedDate;
  }

  function extractTimeFromText(text) {
    return normalizeTimeValue(normalizeOcrText(text));
  }

  function createStructuredRow({ time = "", direction = "buy", weight, price }) {
    const normalizedWeight = toNumber(weight);
    const normalizedPrice = normalizeExtractedPriceValue(price);

    if (normalizedWeight <= 0 || normalizedPrice <= 0) {
      return null;
    }

    return {
      time: normalizeTimeValue(time),
      direction: normalizeDirection(direction),
      weight: formatExtractedNumber(normalizedWeight, 4),
      price: formatExtractedNumber(normalizedPrice, 2),
    };
  }

  function serializeStructuredRow(row) {
    const pieces = [];
    if (row.time) {
      pieces.push(row.time);
    }
    pieces.push(row.direction || "buy", row.weight, row.price);
    return pieces.join(", ");
  }

  function serializeStructuredRows(rows) {
    return (rows || []).map(serializeStructuredRow).join("\n");
  }

  function normalizeConfidence(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function normalizeBBox(bbox) {
    if (!bbox) {
      return { x0: 0, y0: 0, x1: 0, y1: 0 };
    }

    return {
      x0: toNumber(bbox.x0),
      y0: toNumber(bbox.y0),
      x1: toNumber(bbox.x1),
      y1: toNumber(bbox.y1),
    };
  }

  function normalizeStructuredWord(word) {
    const text = normalizeOcrText(word?.text || "");
    if (!text) {
      return null;
    }

    return {
      text,
      bbox: normalizeBBox(word?.bbox),
      confidence: normalizeConfidence(word?.confidence),
    };
  }

  function normalizeStructuredLine(line) {
    const words = (line?.words || []).map(normalizeStructuredWord).filter(Boolean);
    const text = normalizeOcrText(line?.text || words.map((word) => word.text).join(" "));
    if (!text) {
      return null;
    }

    return {
      text,
      bbox: normalizeBBox(line?.bbox),
      confidence: normalizeConfidence(line?.confidence),
      words,
    };
  }

  function sortStructuredLines(lines) {
    return [...(lines || [])].sort((left, right) => {
      const topGap = left.bbox.y0 - right.bbox.y0;
      if (Math.abs(topGap) > 6) {
        return topGap;
      }
      return left.bbox.x0 - right.bbox.x0;
    });
  }

  function getLineHeight(line) {
    return Math.max(0, toNumber(line?.bbox?.y1) - toNumber(line?.bbox?.y0));
  }

  function getWordHeight(word) {
    return Math.max(0, toNumber(word?.bbox?.y1) - toNumber(word?.bbox?.y0));
  }

  function getWordCenterY(word) {
    return (toNumber(word?.bbox?.y0) + toNumber(word?.bbox?.y1)) / 2;
  }

  function sortStructuredWords(words) {
    return [...(words || [])].sort((left, right) => {
      const centerGap = getWordCenterY(left) - getWordCenterY(right);
      if (Math.abs(centerGap) > 6) {
        return centerGap;
      }
      return left.bbox.x0 - right.bbox.x0;
    });
  }

  function buildStructuredLinesFromWords(words) {
    const sortedWords = sortStructuredWords(words);
    const lineGroups = [];

    sortedWords.forEach((word) => {
      const centerY = getWordCenterY(word);
      const wordHeight = getWordHeight(word);
      const currentGroup = lineGroups[lineGroups.length - 1];

      if (!currentGroup) {
        lineGroups.push({ words: [word], centerY });
        return;
      }

      const threshold = Math.max(Math.max(currentGroup.height || 0, wordHeight) * 0.7, 10);
      if (Math.abs(centerY - currentGroup.centerY) <= threshold) {
        currentGroup.words.push(word);
        currentGroup.centerY = (currentGroup.centerY * (currentGroup.words.length - 1) + centerY) / currentGroup.words.length;
        currentGroup.height = Math.max(currentGroup.height || 0, wordHeight);
        return;
      }

      lineGroups.push({ words: [word], centerY, height: wordHeight });
    });

    return lineGroups
      .map((group) => {
        const rowWords = [...group.words].sort((left, right) => left.bbox.x0 - right.bbox.x0);
        const text = normalizeOcrText(rowWords.map((word) => word.text).join(" "));
        if (!text) {
          return null;
        }

        return {
          text,
          words: rowWords,
          confidence: rowWords.reduce((sum, word) => sum + normalizeConfidence(word.confidence), 0) / rowWords.length,
          bbox: {
            x0: Math.min(...rowWords.map((word) => word.bbox.x0)),
            y0: Math.min(...rowWords.map((word) => word.bbox.y0)),
            x1: Math.max(...rowWords.map((word) => word.bbox.x1)),
            y1: Math.max(...rowWords.map((word) => word.bbox.y1)),
          },
        };
      })
      .filter(Boolean);
  }

  function joinStructuredLineTexts(lines) {
    return (lines || []).map((line) => line.text).join("\n");
  }

  function createRowKey(row) {
    return [row.time || "", row.direction || "buy", row.weight || "", row.price || ""].join("|");
  }

  function dedupeStructuredRows(rows) {
    const seen = new Set();
    return (rows || []).filter((row) => {
      const key = createRowKey(row);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function isDateLine(line) {
    return /20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}/.test(line);
  }

  function isTailNumberLine(line) {
    return /尾号/.test(line);
  }

  function isCanceledLine(line) {
    return /已撤单|撤单|进行中|过期失效|已失效|未成交|已过期|过期/.test(line);
  }

  function isDirectionLine(line) {
    return /(委托买入|委托卖出)/.test(line);
  }

  function isDealPriceLine(line) {
    return /成交价/.test(line);
  }

  function isOrderPriceLine(line) {
    return /委托价/.test(line);
  }

  function extractWeightFromLine(line) {
    const normalizedLine = String(line ?? "");
    if (!/克/.test(normalizedLine)) {
      return 0;
    }

    const labeledMatch = normalizedLine.match(/克[数教效]?[:：]?\s*([\d,]*\.\d+|\d+)/i);
    if (labeledMatch) {
      const labeledValue = parseNumericValue(labeledMatch[1]);
      return labeledValue > 0 && labeledValue <= 10000 ? labeledValue : 0;
    }

    const suffixMatch = normalizedLine.match(/([\d,]*\.\d+|\d+)\s*克(?![数教效])/i);
    if (!suffixMatch) {
      return 0;
    }

    const value = parseNumericValue(suffixMatch[1]);
    return value > 0 && value <= 10000 ? value : 0;
  }

  function extractDealPriceFromLine(line) {
    if (!isDealPriceLine(line)) {
      return 0;
    }

    const match = String(line ?? "").match(/成交价[:：]?\s*[¥￥]?\s*([\d,]+(?:\.\d{1,2})?)/);
    if (!match) {
      return 0;
    }

    const value = parseNumericValue(match[1]);
    return value > 0 && value <= 10000 ? value : 0;
  }

  function cleanAmountSourceText(text) {
    return normalizeOcrText(text)
      .replace(/成交价[:：]?\s*[¥￥]?\s*[\d,]+(?:\.\d{1,2})?/g, " ")
      .replace(/委托价[:：]?\s*[¥￥]?\s*[\d,]+(?:\.\d{1,2})?/g, " ")
      .replace(/克[数教效]?[:：]?\s*[\d,]+(?:\.\d+)?\s*克?/g, " ")
      .replace(/20\d{2}[-/.年]\s*\d{1,2}[-/.月]\s*\d{1,2}(?:[日号]?\s*\d{1,2}:\d{2})?/g, " ")
      .replace(/委托买入|委托卖出|招商黄金账户|交易明细|持仓明细|历史交易|最近\d+[年月]?|全部|进行中/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractAmountCandidates(text) {
    const cleaned = cleanAmountSourceText(text);
    if (!cleaned || isCanceledLine(cleaned) || isTailNumberLine(cleaned)) {
      return [];
    }

    return Array.from(cleaned.matchAll(/[¥￥]?\s*([\d,]+\.\d{2})/g))
      .map((match) => parseNumericValue(match[1]))
      .filter((value) => value >= 50);
  }

  function extractAmountFromLine(line) {
    if (isDateLine(line) || isTailNumberLine(line) || isCanceledLine(line)) {
      return 0;
    }

    return extractAmountCandidates(line)[0] || 0;
  }

  function splitLines(text) {
    return normalizeOcrText(text)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function splitIntoDirectionBlocks(lines) {
    const blocks = [];
    let current = null;

    lines.forEach((line, index) => {
      if (isDirectionLine(line)) {
        if (current?.lines.length) {
          blocks.push(current);
        }
        current = {
          startIndex: index,
          lines: [line],
        };
        return;
      }

      if (current) {
        current.lines.push(line);
      }
    });

    if (current?.lines.length) {
      blocks.push(current);
    }

    return blocks;
  }

  function splitIntoEntryChunks(normalizedText) {
    return String(normalizedText || "")
      .split(/(?=委托买入|委托卖出)/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => /(委托买入|委托卖出)/.test(chunk));
  }

  function buildStructuredEntries(structuredLines) {
    const entries = [];
    const sortedLines = sortStructuredLines(structuredLines);
    const lineHeights = sortedLines.map(getLineHeight).filter((height) => height > 0);
    const averageLineHeight = lineHeights.length
      ? lineHeights.reduce((sum, height) => sum + height, 0) / lineHeights.length
      : 24;
    const entryGapThreshold = Math.max(averageLineHeight * 1.6, 18);

    let currentEntry = null;

    sortedLines.forEach((line) => {
      const isDirectionAnchor = isDirectionLine(line.text);

      if (isDirectionAnchor) {
        if (currentEntry?.lines.length) {
          entries.push(currentEntry);
        }
        currentEntry = { lines: [line] };
        return;
      }

      if (!currentEntry) {
        return;
      }

      const lastLine = currentEntry.lines[currentEntry.lines.length - 1];
      const verticalGap = line.bbox.y0 - lastLine.bbox.y1;

      if (verticalGap > entryGapThreshold) {
        entries.push(currentEntry);
        currentEntry = null;
        return;
      }

      currentEntry.lines.push(line);
    });

    if (currentEntry?.lines.length) {
      entries.push(currentEntry);
    }

    return entries
      .map((entry) => ({
        ...entry,
        text: joinStructuredLineTexts(entry.lines),
      }))
      .filter((entry) => isDirectionLine(entry.text));
  }

  function searchNearest(lines, anchorIndex, extractor, options = {}) {
    const { maxDistance = 4, includeSelf = true } = options;
    const offsets = [];

    if (includeSelf) {
      offsets.push(0);
    }
    for (let distance = 1; distance <= maxDistance; distance += 1) {
      offsets.push(-distance, distance);
    }

    for (const offset of offsets) {
      const targetIndex = anchorIndex + offset;
      if (targetIndex < 0 || targetIndex >= lines.length) {
        continue;
      }

      const value = extractor(lines[targetIndex], targetIndex);
      if (value) {
        return value;
      }
    }

    return "";
  }

  function findNearestAmount(lines, anchorIndex, maxDistance) {
    const offsets = [0];
    for (let distance = 1; distance <= maxDistance; distance += 1) {
      offsets.push(-distance, distance);
    }

    for (const offset of offsets) {
      const targetIndex = anchorIndex + offset;
      if (targetIndex < 0 || targetIndex >= lines.length) {
        continue;
      }

      const value = extractAmountFromLine(lines[targetIndex]);
      if (value) {
        return value;
      }
    }

    return 0;
  }

  function detectLayout(normalizedText) {
    const signalCount = [
      /招商.*黄金账户|黄金账户/.test(normalizedText),
      /交易明细/.test(normalizedText),
      /历史交易/.test(normalizedText),
      /委托买入|委托卖出/.test(normalizedText),
      /成交价/.test(normalizedText),
      /克数|克:/.test(normalizedText),
    ].filter(Boolean).length;

    return {
      signalCount,
      isBankHistoryLayout: signalCount >= 4 && /成交价/.test(normalizedText) && /委托买入|委托卖出/.test(normalizedText),
    };
  }

  function parseStructuredBankHistoryEntries(context) {
    const rows = [];
    let skippedCount = 0;

    context.structuredEntries.forEach((entry) => {
      const direction = extractDirectionFromText(entry.text) || "buy";
      const time = entry.lines.map((line) => extractTimeFromText(line.text)).find(Boolean) || extractTimeFromText(entry.text);
      const hasDealPrice = entry.lines.some((line) => isDealPriceLine(line.text)) || isDealPriceLine(entry.text);
      const canceled = isCanceledLine(entry.text);

      if (canceled || !hasDealPrice) {
        skippedCount += 1;
        return;
      }

      const weight = entry.lines.map((line) => extractWeightFromLine(line.text)).find(Boolean) || extractWeightFromLine(entry.text);
      const price = entry.lines.map((line) => extractDealPriceFromLine(line.text)).find(Boolean) || extractDealPriceFromLine(entry.text);
      const amount =
        entry.lines
          .flatMap((line) => extractAmountCandidates(line.text))
          .find((value) => value > 0) || extractAmountCandidates(entry.text)[0] || 0;

      const reconciled = reconcileTradeValues({ weight, price, amount });
      const row = createStructuredRow({
        time,
        direction,
        weight: reconciled.weight,
        price: reconciled.price,
      });

      if (row) {
        rows.push(row);
      } else {
        skippedCount += 1;
      }
    });

    return {
      parser: "structured-bank-history-entries",
      rows: dedupeStructuredRows(rows),
      skippedCount,
      matchedCount: context.structuredEntries.length,
    };
  }

  function parseBankHistoryBlocks(context) {
    const rows = [];
    const blocks = context.directionBlocks;
    let skippedCount = 0;

    blocks.forEach((block) => {
      const direction = extractDirectionFromText(block.lines[0]) || "buy";
      const dealLineIndex = block.lines.findIndex((line) => isDealPriceLine(line) && !isCanceledLine(line));

      if (dealLineIndex < 0) {
        skippedCount += 1;
        return;
      }

      const price = searchNearest(block.lines, dealLineIndex, (line) => extractDealPriceFromLine(line), {
        maxDistance: 1,
      });
      const weight = searchNearest(block.lines, dealLineIndex, (line) => extractWeightFromLine(line), {
        maxDistance: 2,
      });
      const time = searchNearest(block.lines, dealLineIndex, (line) => extractTimeFromText(line), {
        maxDistance: 2,
      });
      const amount = findNearestAmount(block.lines, dealLineIndex, 2);

      const reconciled = reconcileTradeValues({ weight, price, amount });
      const row = createStructuredRow({
        time,
        direction,
        weight: reconciled.weight,
        price: reconciled.price,
      });

      if (row) {
        rows.push(row);
      } else {
        skippedCount += 1;
      }
    });

    return {
      parser: "bank-history-blocks",
      rows: dedupeStructuredRows(rows),
      skippedCount,
      matchedCount: blocks.length,
    };
  }

  function parseBankHistoryChunks(context) {
    const rows = [];
    let skippedCount = 0;

    context.entryChunks.forEach((chunk) => {
      const direction = extractDirectionFromText(chunk) || "buy";
      const time = extractTimeFromText(chunk);
      const hasDealPrice = isDealPriceLine(chunk);
      const canceled = isCanceledLine(chunk);

      if (canceled || !hasDealPrice) {
        skippedCount += 1;
        return;
      }

      const weight = extractWeightFromLine(chunk);
      const price = extractDealPriceFromLine(chunk);
      const amount = extractAmountCandidates(chunk)[0] || 0;
      const reconciled = reconcileTradeValues({ weight, price, amount });

      const row = createStructuredRow({
        time,
        direction,
        weight: reconciled.weight,
        price: reconciled.price,
      });

      if (row) {
        rows.push(row);
      } else {
        skippedCount += 1;
      }
    });

    return {
      parser: "bank-history-chunks",
      rows: dedupeStructuredRows(rows),
      skippedCount,
      matchedCount: context.entryChunks.length,
    };
  }

  function parseDealPriceWindows(context) {
    const rows = [];
    let skippedCount = 0;

    context.lines.forEach((line, index) => {
      if (!isDealPriceLine(line) || isCanceledLine(line)) {
        return;
      }

      const price = extractDealPriceFromLine(line) || searchNearest(context.lines, index, (target) => extractDealPriceFromLine(target), {
        maxDistance: 1,
      });
      const weight = searchNearest(context.lines, index, (target) => extractWeightFromLine(target), {
        maxDistance: 3,
      });
      const time = searchNearest(context.lines, index, (target) => extractTimeFromText(target), {
        maxDistance: 4,
      });
      const direction = searchNearest(context.lines, index, (target) => extractDirectionFromText(target), {
        maxDistance: 4,
      }) || "buy";
      const amount = findNearestAmount(context.lines, index, 4);

      const reconciled = reconcileTradeValues({ weight, price, amount });
      const row = createStructuredRow({
        time,
        direction,
        weight: reconciled.weight,
        price: reconciled.price,
      });

      if (row) {
        rows.push(row);
      } else {
        skippedCount += 1;
      }
    });

    return {
      parser: "deal-price-windows",
      rows: dedupeStructuredRows(rows),
      skippedCount,
      matchedCount: context.lines.filter((line) => isDealPriceLine(line)).length,
    };
  }

  function parseLooseDirectionBlocks(context) {
    const rows = [];
    let skippedCount = 0;

    context.directionBlocks.forEach((block) => {
      const direction = extractDirectionFromText(block.lines[0]) || "buy";
      const time = block.lines.map((line) => extractTimeFromText(line)).find(Boolean) || "";
      const weight = block.lines.map((line) => extractWeightFromLine(line)).find(Boolean) || 0;
      const price = block.lines.map((line) => extractDealPriceFromLine(line)).find(Boolean) || 0;
      const amount = block.lines.flatMap((line) => extractAmountCandidates(line))[0] || 0;

      if (!price || !weight) {
        skippedCount += 1;
        return;
      }

      const reconciled = reconcileTradeValues({ weight, price, amount });
      const row = createStructuredRow({
        time,
        direction,
        weight: reconciled.weight,
        price: reconciled.price,
      });

      if (row) {
        rows.push(row);
      } else {
        skippedCount += 1;
      }
    });

    return {
      parser: "loose-direction-blocks",
      rows: dedupeStructuredRows(rows),
      skippedCount,
      matchedCount: context.directionBlocks.length,
    };
  }

  function isPlausibleStructuredRow(row) {
    const weight = toNumber(row.weight);
    const price = toNumber(row.price);
    return weight > 0 && weight <= 1000 && price >= 100 && price <= 3000;
  }

  function scoreParserResult(result, context) {
    if (!result.rows.length) {
      return Number.NEGATIVE_INFINITY;
    }

    const rowCount = result.rows.length;
    const timedCount = result.rows.filter((row) => row.time).length;
    const plausibleCount = result.rows.filter((row) => isPlausibleStructuredRow(row)).length;
    const uncoveredCount = Math.max((result.matchedCount || 0) - rowCount, 0);

    let score = rowCount * 100;
    score += timedCount * 12;
    score += plausibleCount * 15;
    score -= (result.skippedCount || 0) * 8;
    score -= uncoveredCount * 6;

    if (context.hasStructuredLines) {
      if (result.parser === "structured-bank-history-entries") {
        score += 80;
      } else {
        score -= 5;
      }
    }

    if (context.layout.isBankHistoryLayout) {
      if (result.parser === "structured-bank-history-entries") {
        score += 60;
      } else if (result.parser === "bank-history-blocks") {
        score += 60;
      } else if (result.parser === "bank-history-chunks") {
        score += 50;
      } else if (result.parser === "deal-price-windows") {
        score += 20;
      } else {
        score -= 10;
      }
    }

    return score;
  }

  function createParseContext(source) {
    let structuredLines = Array.isArray(source?.lines)
      ? source.lines.map(normalizeStructuredLine).filter(Boolean)
      : [];
    const structuredWords = Array.isArray(source?.words)
      ? source.words.map(normalizeStructuredWord).filter(Boolean)
      : [];

    if (!structuredLines.length && structuredWords.length) {
      structuredLines = buildStructuredLinesFromWords(structuredWords);
    }

    const rawText = typeof source === "string" ? source : source?.rawText || joinStructuredLineTexts(structuredLines);
    const normalizedText = normalizeOcrText(rawText);
    const lines = structuredLines.length ? structuredLines.map((line) => line.text) : splitLines(normalizedText);

    return {
      rawText: String(rawText ?? ""),
      normalizedText,
      lines,
      structuredLines,
      structuredEntries: buildStructuredEntries(structuredLines),
      hasStructuredLines: structuredLines.length > 0,
      directionBlocks: splitIntoDirectionBlocks(lines),
      entryChunks: splitIntoEntryChunks(normalizedText),
      layout: detectLayout(normalizedText),
    };
  }

  const PARSERS = [
    parseStructuredBankHistoryEntries,
    parseBankHistoryBlocks,
    parseBankHistoryChunks,
    parseDealPriceWindows,
    parseLooseDirectionBlocks,
  ];

  function deriveStructuredTextFromOcr(source) {
    const context = createParseContext(source);
    const results = PARSERS
      .map((runParser) => {
        const result = runParser(context);
        return {
          ...result,
          score: scoreParserResult(result, context),
        };
      })
      .sort((left, right) => right.score - left.score);

    const bestResult = results.find((result) => result.rows.length > 0);
    if (!bestResult) {
      return {
        rows: [],
        text: "",
        extractedCount: 0,
        skippedCount: 0,
        parser: "",
        candidates: results,
      };
    }

    const rows = dedupeStructuredRows(bestResult.rows);
    return {
      rows,
      text: serializeStructuredRows(rows),
      extractedCount: rows.length,
      skippedCount: bestResult.skippedCount || 0,
      parser: bestResult.parser,
      candidates: results,
    };
  }

  global.GoldOcrCore = {
    deriveStructuredTextFromOcr,
    normalizeOcrText,
    serializeStructuredRows,
  };
})(typeof window !== "undefined" ? window : globalThis);
