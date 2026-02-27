# txtReader

一个简洁优雅的本地文本阅读器，支持 Markdown 渲染、LaTeX 数学公式，以及跨设备阅读进度同步。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)

## ✨ 功能特点

- 📖 **文本阅读**：支持 `.txt` 文件，自动渲染 Markdown 格式
- 🧮 **LaTeX 支持**：自动识别并渲染数学公式（`$...$` 和 `$$...$$`）
- 📍 **阅读进度**：自动记录和恢复阅读位置，每 3 秒自动保存
- 🔄 **进度同步**：支持中心服务器模式，多设备间同步阅读进度
- 📁 **目录浏览**：支持文件夹导航，文件按修改时间排序
- 🌓 **深色模式**：自动适配系统深色/浅色主题
- ⌨️ **快捷键**：支持多种快捷键操作
- 📱 **响应式设计**：适配桌面和移动设备

## 🚀 快速开始

### 环境要求

- Node.js >= 14.0.0
- npm 或 yarn

### 安装

```bash
# 克隆或下载项目
cd txtReader

# 安装依赖
npm install
```

### 配置

编辑 `.env` 文件：

```bash
# 本地文件目录（绝对路径）
PRO_DIR='/path/to/your/txt/files'

# 服务器配置
PORT=3000
HOST=0.0.0.0

# 中心服务器模式（可选）
PROGRESS_ONLY=false
REMOTE_SERVER_URL=''
```

### 启动

```bash
node server.js
```

访问 `http://localhost:3000` 即可使用。

## 📖 使用指南

### 文件列表页 (index.html)

- 显示指定目录下的所有 `.txt` 文件和文件夹
- 点击文件夹进入子目录
- 点击文件开始阅读
- 按 `Shift + Cmd + F` 切换仅显示文件夹

### 阅读页 (file.html)

- **自动恢复**：打开文件自动跳转到上次阅读位置
- **手动刷新**：点击左上角刷新按钮强制更新阅读进度
- **返回目录**：`Shift + Cmd + O` 返回文件列表

## ⚙️ 高级配置

### 中心服务器模式

适用于多设备间同步阅读进度，或局域网内共享阅读进度。

#### 场景 1：仅作为进度中心服务器

```bash
# 中心服务器 .env
PROGRESS_ONLY=true
REMOTE_SERVER_URL='http://192.168.1.100:3000'
PORT=3001
```

- 此服务器只保存和同步阅读进度
- 不提供文件内容服务
- 访问时会提示用户去内容服务器阅读

#### 场景 2：内容服务器 + 远端进度同步

```bash
# 内容服务器 .env
PROGRESS_ONLY=false
REMOTE_SERVER_URL='http://progress-server.example.com:3001'
PORT=3000
```

- 提供文件内容服务
- 阅读进度自动同步到远端中心服务器
- 打开文件时优先从远端获取上次阅读位置

### API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/list-files?dir=` | GET | 获取文件列表 |
| `/file-content?name=` | GET | 获取文件内容 |
| `/log-middle-p-index` | POST | 保存阅读进度 |
| `/get-progress?name=` | GET | 获取阅读进度 |
| `/server-config` | GET | 获取服务器配置 |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Shift + Cmd/Ctrl + O` | 返回文件列表 |
| `Shift + Cmd/Ctrl + F` | 切换仅显示文件夹（列表页） |

## 📁 项目结构

```
txtReader/
├── server.js                 # Express 服务器
├── index.html                # 文件列表页面
├── file.html                 # 阅读页面
├── recLoc.js                 # 阅读位置检测模块
├── hashes.json               # 阅读进度数据存储
├── .env                      # 环境变量配置
├── afdian_styles.css         # 主样式文件
├── afdian_styles-print.css   # 打印样式
├── web_icon/                 # 图标资源
│   ├── yanan.png
│   ├── folder.svg
│   └── refresh.svg
└── package.json
```

## 🛠️ 技术栈

- **后端**：Node.js + Express
- **前端**：原生 HTML5 + JavaScript (ES6+)
- **Markdown 渲染**：[marked](https://marked.js.org/)
- **LaTeX 渲染**：[KaTeX](https://katex.org/)
- **加密**：crypto-js (MD5 文件名哈希)
- **并发控制**：async-mutex

## 📝 注意事项

1. **文件编码**：请确保文本文件使用 UTF-8 编码
2. **文件安全**：服务器已做路径安全校验，禁止访问指定目录外的文件
3. **进度存储**：阅读进度保存在 `hashes.json` 文件中，建议定期备份
4. **并发写入**：使用互斥锁确保进度文件并发安全

## 🔧 开发计划

- [ ] 支持更多文件格式（.md, .epub 等）
- [ ] 阅读进度可视化
- [ ] 全文搜索功能
- [ ] 阅读统计
- [ ] 多用户支持

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

如有问题或建议，欢迎反馈！
