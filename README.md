# 积存金复盘台

积存金复盘台是一个面向黄金积存金交易截图整理的本地优先网页工具，用于把交易截图转成可复核、可统计、可导出的结构化批次数据。

当前版本聚焦招商银行黄金账户历史交易截图，核心目标是稳定完成以下链路：

- 导入截图
- OCR 识别
- 人工核对
- 汇总统计
- 历史批次管理
- JSON 导入导出

项目不是通用 OCR 平台，也不以云端同步为目标。默认数据流以本地浏览器和本地 OCR 服务为中心。

## 核心能力

- 批量导入截图，支持拖拽、点击上传和粘贴图片
- 优先调用本地 Python OCR 服务，失败时自动回退到浏览器 OCR
- 抽取成交时间、方向、克重、成交价、金额等核心字段
- 在明细表中人工修正、删除、复核异常记录
- 生成买入/卖出汇总、日度复盘表和统计图表
- 将当前整理结果保存为历史批次，或更新当前批次
- 导出单个批次或整库 JSON，用于备份和迁移
- 打开旧批次继续整理，或导入外部 JSON 恢复数据

## 环境要求

### 基础要求

- macOS 优先
- Node.js 18 及以上
- 现代浏览器

### 可选增强

- Python 虚拟环境 `.venv`
- PaddleOCR 及其依赖
- iTerm2

说明：

- 不安装 Python 也可以使用，系统会退回浏览器 OCR，但识别稳定性通常不如本地 Python OCR。
- 不安装 iTerm2 也可以使用，只是无法通过 `.app` 启动器拉起专用终端窗口；此时直接执行 `npm run start` 即可。

## 快速开始

### 方式一：命令行启动

在项目根目录执行：

```bash
npm run start
```

默认访问地址：

```text
http://127.0.0.1:4173
```

### 方式二：macOS 启动器

双击 [积存金复盘台.app](/Users/jing/Documents/Code/gold-savings-review/积存金复盘台.app)。

适用前提：

- 当前设备为 macOS
- 已安装 iTerm2

如果未安装 iTerm2，请直接使用命令行方式启动。

## 安装与环境部署

### 1. 获取代码

```bash
git clone <your-repo-url>
cd gold-savings-review
```

### 2. 准备 Node.js

本项目运行时主要依赖 Node.js 内置能力，本地前端没有额外的 npm 构建依赖；安装 Node.js 18 及以上后即可执行启动脚本。

可先确认版本：

```bash
node -v
npm -v
```

### 3. 准备本地 OCR 服务，可选但推荐

如果希望优先使用本地 Python OCR：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r python/requirements-paddle.txt
```

手动单独启动 OCR 服务：

```bash
npm run ocr:serve
```

默认 OCR 服务地址：

```text
http://127.0.0.1:8765
```

如果你不准备安装 Python 依赖，也可以直接跳过这一步，页面会回退到浏览器 OCR。

## 浏览器策略与兼容性

### 默认打开哪个浏览器

macOS 启动脚本当前策略为：

- 如果本机安装了 Chrome，优先用 Chrome 打开
- 如果没有安装 Chrome，自动回退到系统默认浏览器

所以，别人本地没有 Chrome 不是阻塞条件，项目仍然可以正常启动和使用。

### 为什么仍然推荐 Chrome 或其他 Chromium 浏览器

当前导出交互优先依赖浏览器前台保存面板能力。Chromium 系浏览器通常对这类能力支持更完整，因此在以下场景里体验更稳定：

- 导出时选择保存路径
- 导出时直接修改文件名
- 保证保存面板在当前浏览器前台弹出

推荐浏览器：

- Google Chrome
- Microsoft Edge
- Arc
- 其他 Chromium 内核浏览器

### 如果没有 Chrome，会有什么影响

没有 Chrome 时：

- 项目仍可正常打开
- 截图识别、明细复核、批次保存等核心功能仍可使用
- 导出体验取决于当前默认浏览器是否支持前台保存面板

在不支持该能力的浏览器中，导出可能退化为：

- 直接下载到系统默认下载目录
- 不能在浏览器前台选择路径
- 不能在导出前交互式修改文件名

这不是数据丢失，而是浏览器能力差异导致的交互降级。

## 常用命令

启动本地服务：

```bash
npm run start
```

查看当前实例状态：

```bash
npm run status
```

停止当前实例：

```bash
npm run stop
```

代码检查：

```bash
npm run check
```

前端测试：

```bash
npm test
```

Python OCR 测试：

```bash
npm run test:python
```

## 日常使用流程

1. 启动本地服务
2. 打开 `http://127.0.0.1:4173`
3. 导入交易截图
4. 执行 OCR 识别
5. 在明细表中核对、修正异常数据
6. 查看结果总览和统计图表
7. 保存当前批次
8. 如需长期留存，导出 JSON

## 数据存储与隐私

### 历史批次默认存在哪里

历史批次默认保存在当前浏览器的本地 `IndexedDB` 中，不写入仓库目录。

常见位置：

- Chromium 系浏览器：`~/Library/Application Support/<浏览器>/<Profile>/IndexedDB/`
- Safari / WebKit：`~/Library/Containers/com.apple.Safari/Data/Library/WebKit/WebsiteData/` 或 `~/Library/WebKit/.../WebsiteData/`

### 当前版本的数据保留策略

当前版本将浏览器内历史批次视为“本地临时工作数据”：

- 关闭最后一个页面时，会触发离开提醒
- 下次重新打开应用时，会清空上一轮本地历史批次

如果需要长期保存，请在离开前手动导出 JSON。

### 数据会不会被自动 push 到 GitHub

不会。

原因是：

- 浏览器 `IndexedDB` 不在 git 工作区内
- 本地历史批次不会自动写入仓库文件
- 项目也不会自动上传你的批次数据

真正需要注意的只有手动导出的 JSON 文件：

- 如果你把 JSON 保存到仓库外，不会影响 git
- 如果你把 JSON 保存到仓库内，并手动执行 `git add` / `git commit`，才可能被提交

## OCR 识别策略

项目采用双链路 OCR：

1. 本地 Python OCR 服务
2. 浏览器 OCR 回退

运行逻辑：

- 前端先探测 `http://127.0.0.1:8765/health`
- 若本地服务可用，优先调用 Python + PaddleOCR
- 若本地服务不可用，自动回退到浏览器 OCR
- Python 返回结构化结果后，前端仍会通过共享解析器再次补跑解析，优先采用字段更完整、结果更合理的一侧

这保证了本地 OCR 和前端解析在字段口径上尽量一致。

## 导出说明

当前支持两类导出：

- 单个历史批次导出
- 全部历史批次导出

导出成功的前提是：

- 页面通过 `http://127.0.0.1:4173` 打开，而不是直接访问 `file:///...`
- 本地启动脚本仍在运行

如果导出表现异常，优先按下面顺序检查：

1. 执行 `npm run status`，确认本地实例正在运行
2. 确认地址栏为 `http://127.0.0.1:4173`
3. 确认当前页面不是旧页面缓存
4. 如果浏览器不支持前台保存面板，预期行为可能是直接下载到默认目录

## 故障排查

### 启动后页面打不开

- 先运行 `npm run status`
- 若显示未运行，重新执行 `npm run start`
- 若端口已占用，脚本会尽量复用已有实例

### 关闭浏览器后历史批次不见了

这是当前版本的设计行为，不是异常。

如果需要长期保留，请先导出 JSON。

### 导出按钮点击后看起来没反应

优先判断是否属于以下情况：

- 保存面板被其他窗口遮挡
- 当前浏览器不支持前台保存面板，已退化为普通下载
- 页面已与本地服务断开

建议优先使用 Chromium 系浏览器进行导出测试。

### 没有安装 Chrome 怎么办

不用额外处理，项目会自动回退到系统默认浏览器。

如果你希望得到更稳定的导出体验，再单独安装 Chrome 或其他 Chromium 浏览器即可；这属于体验增强，不是运行前提。

## 目录结构

- [web/](/Users/jing/Documents/Code/gold-savings-review/web)：前端页面、状态管理、批次库、导入导出、图表与事件绑定
- [src/](/Users/jing/Documents/Code/gold-savings-review/src)：共享解析器和纯逻辑工具
- [python/](/Users/jing/Documents/Code/gold-savings-review/python)：本地 OCR 服务与依赖文件
- [scripts/](/Users/jing/Documents/Code/gold-savings-review/scripts)：本地启动、状态查询、停止等辅助脚本
- [tests/](/Users/jing/Documents/Code/gold-savings-review/tests)：前端与 Python 回归测试
- [docs/](/Users/jing/Documents/Code/gold-savings-review/docs)：项目设计文档和 OCR 专项设计说明

## 设计文档

- [docs/README.md](/Users/jing/Documents/Code/gold-savings-review/docs/README.md)
- [docs/design-doc.md](/Users/jing/Documents/Code/gold-savings-review/docs/design-doc.md)
- [docs/trade-screenshot-ocr-design.md](/Users/jing/Documents/Code/gold-savings-review/docs/trade-screenshot-ocr-design.md)
