import test from "node:test";
import assert from "node:assert/strict";

await import("../src/ocr-core.js");

const { deriveStructuredTextFromOcr } = globalThis.GoldOcrCore;

test("bank history parser keeps valid trades and skips expired entries", () => {
  const rawText = `
招商黄金账户
交易明细
历史交易
委托买入
¥ 999.53
2025-10-27
克数:1.0900克
成交价:¥ 917.00

委托买入
¥ 1,002.80
2025-10-27
克数:1.0900克
成交价:¥ 920.00

委托买入
过期失效
2025-10-24
克数:1.1000克
委托价:¥ 915.00
`;

  const result = deriveStructuredTextFromOcr(rawText);

  assert.equal(result.parser, "bank-history-blocks");
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows, [
    {
      time: "2025-10-27",
      direction: "buy",
      weight: "1.09",
      price: "917",
    },
    {
      time: "2025-10-27",
      direction: "buy",
      weight: "1.09",
      price: "920",
    },
  ]);
});

test("parser accepts sub-1000 turnover amounts", () => {
  const rawText = `
委托买入 ¥999.53
2025-10-27 克数:1.0900克 成交价:¥917.00
`;

  const result = deriveStructuredTextFromOcr(rawText);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].weight, "1.09");
  assert.equal(result.rows[0].price, "917");
});

test("parser reconciles common 0.01 OCR drift from amount and weight", () => {
  const rawText = `
委托买入
¥ 7,385.00
2025-03-19
克数:7.0000克
成交价:¥ 1054.99
`;

  const result = deriveStructuredTextFromOcr(rawText);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].weight, "7");
  assert.equal(result.rows[0].price, "1055");
});

test("chunk parser can recover rows from continuous text without stable line breaks", () => {
  const rawText = `
招商黄金账户 交易明细 历史交易 委托买入 ¥999.04 2025-10-28 克数:1.1200克 成交价:¥892.00 委托买入 过期失效 2025-10-28 克数:1.1300克 委托价:¥888.00 委托买入 ¥1,003.52 2025-10-28 克数:1.1200克 成交价:¥896.00
`;

  const result = deriveStructuredTextFromOcr(rawText);

  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows, [
    {
      time: "2025-10-28",
      direction: "buy",
      weight: "1.12",
      price: "892",
    },
    {
      time: "2025-10-28",
      direction: "buy",
      weight: "1.12",
      price: "896",
    },
  ]);
});

test("parser keeps skipped count aligned with invalid entries in continuous text", () => {
  const rawText = `
招商黄金账户 交易明细 历史交易 委托买入 ¥999.04 2025-10-28 克数:1.1200克 成交价:¥892.00 委托买入 过期失效 2025-10-28 克数:1.1300克 委托价:¥888.00 委托卖出 未成交 2025-10-28 克数:1.0100克 委托价:¥901.00
`;

  const result = deriveStructuredTextFromOcr(rawText);

  assert.equal(result.rows.length, 1);
  assert.equal(result.skippedCount, 2);
});

test("structured OCR entries are parsed before raw text fallback", () => {
  const recognition = {
    rawText: "杂乱文本",
    lines: [
      {
        text: "委托买入",
        bbox: { x0: 10, y0: 100, x1: 80, y1: 120 },
        words: [{ text: "委托买入", bbox: { x0: 10, y0: 100, x1: 80, y1: 120 } }],
      },
      {
        text: "¥ 999.04",
        bbox: { x0: 130, y0: 100, x1: 200, y1: 120 },
        words: [{ text: "¥999.04", bbox: { x0: 130, y0: 100, x1: 200, y1: 120 } }],
      },
      {
        text: "成交价: ¥ 892.00",
        bbox: { x0: 260, y0: 100, x1: 380, y1: 120 },
        words: [{ text: "成交价:¥892.00", bbox: { x0: 260, y0: 100, x1: 380, y1: 120 } }],
      },
      {
        text: "2025-10-28",
        bbox: { x0: 10, y0: 128, x1: 100, y1: 148 },
        words: [{ text: "2025-10-28", bbox: { x0: 10, y0: 128, x1: 100, y1: 148 } }],
      },
      {
        text: "克数:1.1200克",
        bbox: { x0: 130, y0: 128, x1: 230, y1: 148 },
        words: [{ text: "克数:1.1200克", bbox: { x0: 130, y0: 128, x1: 230, y1: 148 } }],
      },
      {
        text: "委托买入",
        bbox: { x0: 10, y0: 200, x1: 80, y1: 220 },
        words: [{ text: "委托买入", bbox: { x0: 10, y0: 200, x1: 80, y1: 220 } }],
      },
      {
        text: "过期失效",
        bbox: { x0: 130, y0: 200, x1: 210, y1: 220 },
        words: [{ text: "过期失效", bbox: { x0: 130, y0: 200, x1: 210, y1: 220 } }],
      },
      {
        text: "委托价: ¥ 888.00",
        bbox: { x0: 260, y0: 200, x1: 380, y1: 220 },
        words: [{ text: "委托价:¥888.00", bbox: { x0: 260, y0: 200, x1: 380, y1: 220 } }],
      },
      {
        text: "2025-10-28",
        bbox: { x0: 10, y0: 228, x1: 100, y1: 248 },
        words: [{ text: "2025-10-28", bbox: { x0: 10, y0: 228, x1: 100, y1: 248 } }],
      },
      {
        text: "克数:1.1300克",
        bbox: { x0: 130, y0: 228, x1: 230, y1: 248 },
        words: [{ text: "克数:1.1300克", bbox: { x0: 130, y0: 228, x1: 230, y1: 248 } }],
      },
    ],
  };

  const result = deriveStructuredTextFromOcr(recognition);

  assert.equal(result.parser, "structured-bank-history-entries");
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], {
    time: "2025-10-28",
    direction: "buy",
    weight: "1.12",
    price: "892",
  });
});

test("word-only structured OCR can be promoted into lines before parsing", () => {
  const recognition = {
    rawText: "",
    words: [
      { text: "委托买入", bbox: { x0: 10, y0: 100, x1: 80, y1: 120 } },
      { text: "¥999.04", bbox: { x0: 130, y0: 100, x1: 200, y1: 120 } },
      { text: "成交价:¥892.00", bbox: { x0: 260, y0: 100, x1: 380, y1: 120 } },
      { text: "2025-10-28", bbox: { x0: 10, y0: 128, x1: 100, y1: 148 } },
      { text: "克数:1.1200克", bbox: { x0: 130, y0: 128, x1: 230, y1: 148 } },
    ],
  };

  const result = deriveStructuredTextFromOcr(recognition);

  assert.equal(result.parser, "structured-bank-history-entries");
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], {
    time: "2025-10-28",
    direction: "buy",
    weight: "1.12",
    price: "892",
  });
});
