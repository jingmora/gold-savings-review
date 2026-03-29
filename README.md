# 积存金复盘台

积存金复盘台是一个面向黄金积存金交易截图整理的本地优先网页工具。项目聚焦“导入截图、OCR 识别、人工复核、结果汇总、历史批次管理”这一条闭环工作流，目标是将交易截图转换为可复盘、可导出、可继续维护的结构化批次数据。

## 适用范围与限制

适用范围：

- 招商银行黄金账户历史交易截图
- 包含 `委托买入`、`委托卖出`、`已撤单`、`过期失效`、转换类条目的截图整理

当前限制：

- 不面向通用文档 OCR 场景
- 不提供云端存储与自动同步
- 浏览器本地历史批次当前按“临时工作数据”管理，长期保存需依赖手动导出 JSON

当前支持：

- 将一个历史批次直接打开到当前整理台
- 将多个历史批次依次加入同一个当前整理台继续整理

## 系统架构

项目采用双链路识别架构：

1. 本地 Python OCR 服务
2. 浏览器 OCR 回退链路

运行时策略如下：

- 前端优先探测本地 OCR 服务 `http://127.0.0.1:8765/health`
- 本地服务可用时，优先调用 Python + PaddleOCR
- 本地服务不可用时，自动回退到浏览器 OCR
- Python 返回结构化结果后，前端仍会通过共享解析器再次补跑解析，以统一字段口径并选择更合理的结果

## 环境要求

基础要求：

- Node.js 18 或更高版本
- 现代浏览器
- macOS 优先支持

可选组件：

- Python 3 虚拟环境 `.venv`
- PaddleOCR 依赖
- iTerm2

说明：

- 不安装 Python 依赖时，系统仍可运行，但会退回浏览器 OCR。
- 不安装 iTerm2 时，不能使用 `.app` 启动器；可直接通过命令行运行。

## 安装

### 1. 获取代码

```bash
git clone <repository-url>
cd gold-savings-review
```

### 2. 安装并确认 Node.js 环境

项目要求：

- Node.js 版本不低于 18
- `npm` 可正常使用

验证命令：

```bash
node -v
npm -v
```

验收标准：

- `node -v` 能输出有效版本号
- Node.js 主版本号应大于或等于 18，例如 `v18.x`、`v20.x`、`v22.x`
- `npm -v` 能输出有效版本号，表示 Node.js 自带的包管理器可正常使用

如果未满足以上条件，请先安装或升级 Node.js，再继续后续步骤。

### 3. 安装本地 OCR 依赖，可选但推荐

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r python/requirements-paddle.txt
```

## 启动方式

### 命令行启动

```bash
npm run start
```

默认访问地址：

```text
http://127.0.0.1:4173
```

### macOS 启动器

双击 [积存金复盘台.app](/Users/jing/Documents/Code/gold-savings-review/积存金复盘台.app)。

适用前提：

- 当前设备为 macOS
- 已安装 iTerm2

如果未安装 iTerm2，请使用命令行方式启动。

## 浏览器兼容性

macOS 启动脚本当前行为：

- 如果检测到 Chrome，则优先使用 Chrome 打开
- 如果未检测到 Chrome，则自动回退到系统默认浏览器

因此，Chrome 不是运行前提；未安装 Chrome 时，项目仍然可以正常打开和使用。

推荐使用 Chromium 系浏览器进行导出测试，原因是这类浏览器通常对前台保存面板支持更完整，在以下场景中体验更稳定：

- 选择保存路径
- 修改导出文件名
- 保证保存面板以前台方式出现

在部分不支持相关能力的浏览器中，导出可能退化为直接下载到默认下载目录。

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

检查前端脚本：

```bash
npm run check
```

运行前端测试：

```bash
npm test
```

运行 Python OCR 测试：

```bash
npm run test:python
```

单独启动 OCR 服务：

```bash
npm run ocr:serve
```

## 使用流程

1. 启动本地服务
2. 打开 `http://127.0.0.1:4173`
3. 导入交易截图
4. 执行 OCR 识别
5. 在明细表中复核并修正结果
6. 查看汇总、图表和按日复盘表
7. 保存当前批次
8. 如需长期保留，导出 JSON

## 数据存储与隐私

### 浏览器本地数据

历史批次默认保存在当前浏览器的本地 `IndexedDB` 中，不写入仓库目录。

常见路径：

- Chromium 系浏览器：`~/Library/Application Support/<浏览器>/<Profile>/IndexedDB/`
- Safari / WebKit：`~/Library/Containers/com.apple.Safari/Data/Library/WebKit/WebsiteData/` 或 `~/Library/WebKit/.../WebsiteData/`

### 当前数据保留策略

当前版本将浏览器内历史批次视为本地临时工作数据：

- 关闭最后一个页面时会触发离开提醒
- 下次重新打开应用时，会清理上一轮浏览器内历史批次

如果需要长期保留，请在离开前手动导出 JSON。

### Git 与 GitHub 风险说明

浏览器本地 `IndexedDB` 数据不会被 git 自动跟踪，也不会自动推送到 GitHub。

需要注意的仅有手动导出的 JSON 文件：

- 若保存到仓库目录外，不会影响 git
- 若保存到仓库目录内，并手动执行 `git add` / `git commit`，则可能被纳入版本控制

## 导出说明

当前支持两类导出：

- 单个历史批次导出
- 全部历史批次导出

导出成功的前提：

- 页面通过 `http://127.0.0.1:4173` 打开
- 本地启动脚本仍在运行

如果导出行为异常，请按以下顺序检查：

1. 执行 `npm run status`，确认本地实例正在运行
2. 确认当前页面地址为 `http://127.0.0.1:4173`
3. 确认当前页面不是旧页面缓存
4. 若浏览器不支持前台保存面板，导出可能退化为默认下载行为

## 故障排查

### 页面无法打开

- 执行 `npm run status`
- 若显示未运行，重新执行 `npm run start`
- 若端口被占用，脚本会优先尝试复用已有实例

### 关闭浏览器后历史批次消失

这是当前版本的预期行为，不是异常。若需长期保留，请先导出 JSON。

### 导出按钮无明显反馈

常见原因包括：

- 保存面板被其他窗口遮挡
- 浏览器不支持前台保存面板，已退化为普通下载
- 页面已与本地服务断开

建议优先使用 Chromium 系浏览器测试导出链路。

## 仓库结构

- [web/](/Users/jing/Documents/Code/gold-savings-review/web)：前端页面、状态管理、批次库、图表、导入导出和事件绑定
- [src/](/Users/jing/Documents/Code/gold-savings-review/src)：共享解析器和纯逻辑工具
- [python/](/Users/jing/Documents/Code/gold-savings-review/python)：本地 OCR 服务与依赖
- [scripts/](/Users/jing/Documents/Code/gold-savings-review/scripts)：启动、状态查询和停止脚本
- [tests/](/Users/jing/Documents/Code/gold-savings-review/tests)：前端与 Python 回归测试
