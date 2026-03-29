# Web Module Map

`web/` 是前端运行时代码目录。现在的组织方式按“业务域 + 装配层”划分，而不是继续把逻辑堆回一个大文件。

## 入口

- `app.js`
  前端装配层。负责组装各模块、初始化状态、执行统一 `update()`。
- `index.html`
  页面入口。
- `styles.css`
  页面样式。

## 业务域

- `capture/images.js`
  截图队列、图片预览、拖拽/粘贴导入后的队列侧 UI。
- `capture/ocr.js`
  OCR 编排。负责本地 Python OCR 服务探测、请求、浏览器 OCR 回退、长图分段识别。
- `history/index.js`
  IndexedDB 历史批次库读写、打开批次、保存/更新当前批次。
- `history/transfer.js`
  历史批次导入导出，复用 `src/history-transfer-tools.mjs` 的纯逻辑。
- `market/live-price.js`
  实时金价拉取与轮询。当前先使用 `Gold API` 作为公开参考价源，向结果总览提供实时买卖价；该价格用于本地“买入加点 / 卖出加点”换算，不等同于招行官方成交价。
- `details.js`
  明细表渲染、排序、异常标记、行内编辑、删除。
- `workspace.js`
  工作区摘要、批次列表、复盘表、按钮状态。
- `events.js`
  DOM 事件绑定层，把 UI 事件分发给各业务模块。
- `charts.js`
  图表渲染和图表实例管理。

## 基础层

- `config.js`
  前端运行配置常量。
- `state.js`
  前端状态容器。
- `elements.js`
  DOM 元素映射。
- `lib/`
  共享工具函数。

## 共享纯逻辑

- `../src/ocr-core.js`
  OCR 解析核心，浏览器 OCR 和 Python OCR 结果都会走这里。
- `../src/detail-tools.mjs`
  明细排序、重复检测、异常识别等纯逻辑。
- `../src/history-transfer-tools.mjs`
  历史批次导入导出的纯逻辑，供浏览器模块和测试共用。
- `../src/portfolio-metrics.mjs`
  按移动平均成本法计算已实现收益、浮动收益和双收益率。

## 修改建议

- 如果改 OCR 流程，优先看 `capture/ocr.js` 和 `src/ocr-core.js`
- 如果改截图队列或图片交互，优先看 `capture/images.js`
- 如果改批次保存、打开或删除，优先看 `history/index.js`
- 如果改 JSON 导入导出格式，优先看 `history/transfer.js` 和 `src/history-transfer-tools.mjs`
- 如果改明细表行为，优先看 `details.js`
- 如果只是接线或初始化，优先看 `app.js`
