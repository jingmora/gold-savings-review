# Learning Plan

这份文档服务于“从零到掌握整个仓库”的学习过程，不替代正式设计文档。

## 学习目标

- 能用自己的话讲清项目主流程
- 能说出主要模块各自负责什么
- 能独立运行项目、跑测试、看懂测试失败的大意
- 能独立完成一个小改动并判断影响范围

## 学习节奏

- 第 1 周：认识项目、补齐最小基础、跑通命令
- 第 2 周：理解前端装配层、截图输入链路、OCR 链路
- 第 3 周：理解明细处理、工作区展示、历史库
- 第 4 周：理解测试体系，完成第一次小改动和第一次中等改动

## TODO

- [ ] 阶段 1：阅读 [README.md](/Users/jing/Documents/Code/gold-savings-review/README.md)、[docs/design-doc.md](/Users/jing/Documents/Code/gold-savings-review/docs/design-doc.md)、[docs/trade-screenshot-ocr-design.md](/Users/jing/Documents/Code/gold-savings-review/docs/trade-screenshot-ocr-design.md)、[web/README.md](/Users/jing/Documents/Code/gold-savings-review/web/README.md)，用自己的话写出项目主流程
- [ ] 阶段 2：补齐最小基础知识：`node`、`npm`、`package.json`、JavaScript 基础、Python 基础、JSON、DOM、事件、`import/export`
- [ ] 阶段 3：自己执行 `npm run start`、`npm test`、`npm run check`，确认知道每条命令在做什么
- [ ] 阶段 4：阅读 [web/app.js](/Users/jing/Documents/Code/gold-savings-review/web/app.js)，只关注模块装配、初始化和 `update()`
- [ ] 阶段 5：阅读 [web/capture/images.js](/Users/jing/Documents/Code/gold-savings-review/web/capture/images.js) 和 [web/events.js](/Users/jing/Documents/Code/gold-savings-review/web/events.js)，画出截图进入队列的流程
- [ ] 阶段 6：阅读 [web/capture/ocr.js](/Users/jing/Documents/Code/gold-savings-review/web/capture/ocr.js)、[src/ocr-core.js](/Users/jing/Documents/Code/gold-savings-review/src/ocr-core.js)、[python/paddle_ocr_service.py](/Users/jing/Documents/Code/gold-savings-review/python/paddle_ocr_service.py)，画出 OCR 主链路和回退链路
- [ ] 阶段 7：阅读 [web/details.js](/Users/jing/Documents/Code/gold-savings-review/web/details.js)、[src/detail-tools.mjs](/Users/jing/Documents/Code/gold-savings-review/src/detail-tools.mjs)、[tests/detail-tools.test.mjs](/Users/jing/Documents/Code/gold-savings-review/tests/detail-tools.test.mjs)，理解排序、异常标记、编辑、删除
- [ ] 阶段 8：阅读 [web/workspace.js](/Users/jing/Documents/Code/gold-savings-review/web/workspace.js) 和 [web/charts.js](/Users/jing/Documents/Code/gold-savings-review/web/charts.js)，理解汇总、复盘表、图表、按钮状态
- [ ] 阶段 9：阅读 [web/history/index.js](/Users/jing/Documents/Code/gold-savings-review/web/history/index.js)、[web/history/transfer.js](/Users/jing/Documents/Code/gold-savings-review/web/history/transfer.js)、[src/history-transfer-tools.mjs](/Users/jing/Documents/Code/gold-savings-review/src/history-transfer-tools.mjs)、[tests/history-transfer-tools.test.mjs](/Users/jing/Documents/Code/gold-savings-review/tests/history-transfer-tools.test.mjs)，理解历史库和导入导出
- [ ] 阶段 10：阅读 [tests/ocr-core.test.mjs](/Users/jing/Documents/Code/gold-savings-review/tests/ocr-core.test.mjs) 和 [tests/test_paddle_ocr_service.py](/Users/jing/Documents/Code/gold-savings-review/tests/test_paddle_ocr_service.py)，说清每个测试在保护什么行为
- [ ] 阶段 11：完成第一次小改动，比如修改一个文案、状态提示或按钮行为，并跑测试
- [ ] 阶段 12：完成第一次中等改动，从 OCR、明细、历史库三块里任选一块做一个有业务意义的小功能

## 每次读代码时的固定问题

- 这个文件是干什么的
- 这个文件输入什么
- 这个文件输出什么
- 这个文件不负责什么

## 掌握标准

- 能讲清完整数据流
- 能定位一个需求应该改哪个模块
- 能看懂主要测试在保护什么
- 能独立完成一个小改动并通过检查
