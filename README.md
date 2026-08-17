# Manage Codex Sessions

`mcs` 是一个用于批量管理 Codex CLI 会话的终端工具。它把未归档和已归档会话并排显示，并支持多选归档或永久删除。

## 功能简介

- 左侧显示未归档会话，右侧显示已归档会话
- 展示会话名称、项目目录和会话记录的 Git 分支
- 使用键盘移动焦点并跨列多选
- 批量归档未归档会话，或批量删除任意会话

> [!WARNING]
> 删除不可恢复。Codex 在归档或删除父会话时，也可能一并处理它派生出的子会话。

## 安装指南

### 1. 准备运行环境

目前支持 macOS 和 Linux。安装前需要：

- Node.js 20 或更高版本
- 已经能够正常使用的 Codex CLI
- Terminal、iTerm2 等交互式终端

打开终端，运行下面的命令检查环境：

```sh
node --version
npm --version
codex --version
codex app-server --help
```

`node --version` 应显示 `v20` 或更高版本，其余命令不应出现“command not found”。如果尚未安装，请先从 [Node.js 官网](https://nodejs.org/) 安装 Node.js，并按照 [Codex CLI 官方文档](https://developers.openai.com/codex/cli/) 安装和登录 Codex。

### 2. 进入源码目录

下载并解压本项目后，在终端中进入项目目录。路径中有空格时需要使用引号：

```sh
cd "/你的路径/Manage Codex Sessions"
```

### 3. 安装 MCS

依次运行：

```sh
npm install
npm run build
npm install -g .
```

最后验证安装：

```sh
mcs --version
```

看到版本号后，即可在任意目录运行 `mcs`。

## 使用指南

### 1. 启动

```sh
mcs
```

程序会读取 Codex CLI 会话，并在终端中显示左右两列。MCS 使用 Codex 官方 App Server 接口，不会直接修改 `~/.codex` 数据库或会话文件。

### 2. 选择会话

| 按键 | 操作 |
| --- | --- |
| `↑` / `↓` | 在当前列中移动 |
| `←` / `→` | 切换未归档和已归档列 |
| `Space` | 选择或取消选择 |
| `a` | 归档选中的未归档会话 |
| `d` | 删除选中的会话 |
| `q` / `Esc` | 退出 |

选中的会话以 `[x]` 标识，可同时选择多条。按 `a` 时，已归档会话会被跳过；按 `d` 后必须再按 `y` 确认，按 `n` 取消。当前版本不支持取消归档。

## 更新指南

获取新版源码后，重新进入项目目录并运行：

```sh
npm install
npm run build
npm install -g .
```

再次运行 `mcs --version` 确认版本。

## 卸载指南

在任意目录运行：

```sh
npm uninstall -g manage-codex-sessions
```

卸载只会删除 `mcs` 程序，不会删除或修改 Codex 会话。可运行下面的命令确认：

```sh
command -v mcs
```

如果没有输出，说明卸载成功。源码目录不再需要时可自行删除。

## 常见问题

### 提示 `mcs: command not found`

关闭并重新打开终端后再试。如果仍然失败，请回到源码目录重新运行 `npm install -g .`，并留意安装过程中的报错。

### 无法启动 Codex App Server

先确认 `codex app-server --help` 可以运行。如果命令不存在，请升级 Codex CLI，然后重新启动 `mcs`。

### 界面提示终端太窄

把终端窗口拉宽到至少 80 列。长标题和路径会自动截断，不影响对应会话的操作。

## 开发与验证

```sh
npm run typecheck
npm test
npm run build
```
