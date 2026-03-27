# Docs Index

当前文档按“总览 + 专项”整理，避免多个文件重复描述同一件事。

## 文档分工

- [design-doc.md](/Users/jing/Documents/Code/gold-savings-review/docs/design-doc.md)
  项目总设计文档。覆盖产品边界、信息架构、运行时模型、主数据流、历史库工作流、存储契约和后续演进方向。

- [trade-screenshot-ocr-design.md](/Users/jing/Documents/Code/gold-savings-review/docs/trade-screenshot-ocr-design.md)
  OCR 子系统专项设计。覆盖本地 Python OCR 服务、浏览器回退链路、共享解析器、识别策略、接口契约与字段规则。

- [learning-plan.md](/Users/jing/Documents/Code/gold-savings-review/docs/learning-plan.md)
  项目学习路线图。服务于从零理解仓库、按阶段掌握模块和测试，不替代正式设计文档。

## 阅读顺序

如果第一次了解项目，建议按这个顺序看：

1. 先看 [design-doc.md](/Users/jing/Documents/Code/gold-savings-review/docs/design-doc.md)
2. 再看 [trade-screenshot-ocr-design.md](/Users/jing/Documents/Code/gold-savings-review/docs/trade-screenshot-ocr-design.md)
3. 如果目标是系统学习仓库，再看 [learning-plan.md](/Users/jing/Documents/Code/gold-savings-review/docs/learning-plan.md)

## 维护规则

- 新文档如果描述的是项目整体行为，优先补进 `design-doc.md`
- 新文档如果描述的是 OCR 识别链路、字段抽取、服务契约，优先补进 `trade-screenshot-ocr-design.md`
- 如果准备新增第三份正式设计文档，应先判断是否只是现有文档的一个章节
- 只服务于 agent 使用习惯或本地提示词的内容，不放进 `docs/`，放在根目录 `AGENTS.md`
