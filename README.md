# Offer Manager

一款完全本地运行的秋招投递与面试复盘管理软件。投递数据保存在 SQLite 中，复盘保存在独立的 Markdown 文件中，不需要账号或云服务。

## 如何打开运行

### 方式一：使用安装版（推荐）

打开项目的 `release` 文件夹，双击：

```text
Offer Manager Setup 0.1.0.exe
```

按照安装向导完成安装，然后从桌面快捷方式或 Windows 开始菜单打开 **Offer Manager**。安装版已经包含运行所需组件，不需要另外安装 Node.js、npm 或 SQLite。

如果 Windows 第一次运行时显示 SmartScreen 提示，可以点击“更多信息”，确认文件来自本项目后选择“仍要运行”。这是因为个人构建的安装包没有配置商业代码签名证书。

### 方式二：使用便携版

打开 `release` 文件夹，双击：

```text
Offer Manager 0.1.0.exe
```

便携版不需要安装，也不需要其他依赖。第一次启动可能需要等待几秒钟完成解压，之后会直接打开软件。

### 方式三：从源码运行

这种方式适合开发和修改代码。电脑需要先安装：

- Node.js 22 或更高版本
- npm（安装 Node.js 时会一并安装）

在 PowerShell 中进入项目目录并执行：

```powershell
cd C:\chen\OfferManager
npm install
npm run dev
```

运行 `npm run dev` 后会自动打开桌面窗口。开发结束后，在终端按 `Ctrl+C` 停止程序。

如果只想运行已经构建的源码版本，可以执行：

```powershell
npm run build
npm start
```

> `node_modules` 不会提交到 GitHub。从 GitHub 重新下载源码后，需要先执行一次 `npm install`。

## 已实现功能

- 投递概览与状态统计
- 投递记录的新建、编辑、搜索和筛选
- 独立的待投岗位清单，按未投递和临近截止日期优先排序
- 岗位投递链接、投递图片、缺失材料及投递状态管理，支持随时编辑
- 可拖拽的招聘流程看板
- 完整招聘阶段：准备投递、已投递、测评、简历筛选、笔试、AI 面、一面、二面、三面、HR 面和 Offer
- 笔试、面试日程管理，并按临近时间排序
- 每个测评、笔试或面试日程可单独保存并打开各自的链接
- 测评和 AI 面支持只记录截止日期，其他面试可记录具体开始时间和时长
- 首页近期安排只显示状态为“待进行”的未来日程
- 每轮面试独立的 Markdown 复盘
- 内置 Markdown 编辑、分栏预览和外部软件打开
- 导入已有 Markdown 文档
- 状态变更时间线
- CSV 导出、数据目录快捷入口和每日 SQLite 备份

## 构建

构建前端：

```bash
npm run build
```

生成 Windows 安装包和便携版：

```bash
npm run dist
```

输出文件位于 `release` 目录。

## 数据位置

Windows 默认保存到：

```text
%APPDATA%/offer-manager/OfferManagerData/
├── offer-manager.db
├── backups/
├── opportunity-images/
└── reviews/
```

也可以在软件左下角点击“打开数据目录”直接访问。删除由软件管理的复盘时，文件会移动至 `reviews/_trash`，不会立刻永久删除。

## 项目结构

```text
electron/
  main.cjs       # SQLite、文件系统和桌面窗口
  opportunities.cjs # 独立的待投岗位数据与图片管理
  preload.cjs    # 安全的前后端接口
src/
  App.tsx        # 页面和交互
  styles.css     # 界面样式
  types.ts       # 数据类型
  utils.ts       # 日期工具
```
