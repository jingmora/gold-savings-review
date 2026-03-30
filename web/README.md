# Web Module Map

`web/` 是前端运行时代码目录。现在的组织方式按“业务域 + 装配层”划分，而不是继续把逻辑堆回一个大文件。

## 入口

- `app.js`
  前端装配层。负责组装各模块、初始化状态、执行统一 `update()`。
- `app-shell.js`
  页面壳层 feature 入口，组合 `app-shell/` 目录下的子模块。
- `app-shell/persistence.js`
  页面级本地偏好持久化与恢复。
- `app-shell/status.js`
  历史抽屉、OCR 状态和运行时桥接提示。
- `app-shell/workspace.js`
  当前整理台命名、保存按钮文案和工作区脏状态辅助。
- `app-shell/market.js`
  本地价差应用、方向文案和结果总览所需的行情快照接线。
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
  历史批次 feature 入口，组合 `store.js` 和 `workspace-actions.js`。
- `history/store.js`
  IndexedDB 历史批次库读写和列表刷新。
- `history/workspace-actions.js`
  当前批次保存/更新、打开批次、合并批次、新建批次、重命名/删除等工作区生命周期动作。
- `history/transfer.js`
  历史批次导入导出，复用 `src/history-transfer-tools.mjs` 的纯逻辑。
- `market/live-price.js`
  实时金价拉取与轮询。当前先使用 `Gold API` 作为公开参考价源，向结果总览提供实时买卖价；该价格用于本地“买入加点 / 卖出加点”换算，不等同于招行官方成交价。
- `market/view-model.js`
  实时行情状态文案与收益展示快照拼装，负责把 `marketState` 和持仓行数据转成结果总览可直接渲染的视图模型。
- `details.js`
  明细 feature 入口，组合 `details/` 目录下的子模块。
- `details/view-state.js`
  明细视图状态、排序字段切换和排序按钮状态。
- `details/entries.js`
  明细行分组、异常标记和可见条目筛选。
- `details/editing.js`
  明细行编辑、删除、输入清洗和已载入记录清空。
- `details/rendering.js`
  明细表 DOM 渲染和按截图/按明细两种视图输出。
- `workspace.js`
  工作区 feature 入口，组合 `workspace/` 目录下的子模块。
- `workspace/batch-state.js`
  当前整理台状态摘要与顶部文案。
- `workspace/batch-library.js`
  历史批次列表渲染。
- `workspace/summary.js`
  结果总览与收益摘要渲染。
- `workspace/action-states.js`
  页面主按钮、筛选按钮和批次动作按钮状态。
- `events.js`
  事件绑定入口，组合 `events/` 目录下的分域绑定。
- `events/capture.js`
  截图导入、拖拽、粘贴、图片列表交互事件。
- `events/details.js`
  明细表、排序、筛选和编辑提交相关事件。
- `events/history.js`
  历史库抽屉、批次动作、导入导出事件。
- `events/market.js`
  本地价差输入事件。
- `events/global.js`
  Lightbox 和全局 `Escape` 等跨域事件。
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
- `../src/review-metrics.mjs`
  成交汇总、日度汇总、价格带分布、批次摘要等纯统计逻辑，供工作区、图表和历史批次复用。

## 修改建议

- 如果改 OCR 流程，优先看 `capture/ocr.js` 和 `src/ocr-core.js`
- 如果改截图队列或图片交互，优先看 `capture/images.js`
- 如果改批次保存、打开或删除，优先看 `history/workspace-actions.js`
- 如果改 IndexedDB 历史库读写，优先看 `history/store.js`
- 如果改 JSON 导入导出格式，优先看 `history/transfer.js` 和 `src/history-transfer-tools.mjs`
- 如果改页面级状态提示、本地偏好持久化或历史抽屉开关，优先看 `app-shell/` 目录；入口仍在 `app-shell.js`
- 如果改收益总览里的行情状态或收益展示文案，优先看 `market/view-model.js`
- 如果改复盘汇总、日度统计或价格带分布，优先看 `src/review-metrics.mjs`
- 如果改明细表行为，优先看 `details/` 目录；入口仍在 `details.js`
- 如果改工作区顶部状态、批次列表或结果总览，优先看 `workspace/` 目录；入口仍在 `workspace.js`
- 如果只是接线或初始化，优先看 `app.js`

## 新增 Feature Checklist

- 先判断 feature 归属，再决定文件，不要从“最近的文件”开始追加代码。
- 涉及 DOM、事件、渲染、IndexedDB 的逻辑留在 `web/` 对应 feature 域。
- 涉及复用计算、标准化、转换、共享 contract 的逻辑优先进 `src/`。
- 不把新业务分支加回 `app.js`、`events.js`、`details.js`、`workspace.js`、`app-shell.js` 这些入口壳文件。
- 如果某个 feature 入口重新聚集了三类以上职责，优先在该目录下继续细分，而不是回退成单文件。
- 改完结构后，同步更新本文件；如果属于长期设计事实，再同步 `docs/design-doc.md`。
