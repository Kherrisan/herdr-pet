# Phase 0–1 实现状态

更新日期：2026-08-15

## 已实现

- Tauri 2 + React + TypeScript + Vite 工程与双窗口结构。
- 透明、无边框、始终置顶、跳过任务栏的 `pet-overlay`。
- 可隐藏但不会结束应用的 `settings` 窗口。
- 托盘中的显示/隐藏、设置、角色切换、暂停、静音、鼠标穿透、重连和退出操作。
- 默认角色已从硬编码 SVG 羊迁移为官方 Bible Strong Avatar Lab 的 Strobi；通过官方导出器生成 Avatar Data v1，并使用官方浏览器运行时播放 `idle`、`working`、`celebrate`、`surprised`、`sad`、`waking` 等动画。
- 大小、透明度、置顶、位置锁定、鼠标穿透、位置复位、六类生命周期/状态事件及独立冷却配置。
- Avatar Studio Project v2 安全预检、原子安装、去重、索引恢复、多 Avatar 选择和官方 parser/exporter 转换。
- 双通道多 Agent 调度器：持续聚合、瞬时队列、完成合并、抢占、过期和最大队列限制。
- JSON 配置规范化、临时文件原子写入、窗口位置防抖保存与启动恢复。
- 与 Herdr 一致的 Unix Socket / Windows Named Pipe 传输规则。
- `ping -> session.snapshot -> events.subscribe` 启动链路。
- Pane 拓扑变化后的重新快照和重新订阅。
- 250ms 至 10s 的指数退避与手动立即重连。
- Agent Cache、状态迁移去重、多 Agent 聚合和动画优先级。
- `working -> idle` 与 `working -> done` 各产生一次完成反馈；Snapshot 不补播完成动画。
- 连接状态、版本、协议、Socket、Agent 数量及错误信息展示。
- Rust 协议/状态/规则/配置测试、假 Herdr Unix Socket 测试和前端动画优先级测试。

## 验证结果

- `npm test`：通过，7 个测试文件、30 项测试。
- `npm run build`：通过。
- Rust 全 feature 测试：通过，44 项测试（含 5 MiB 工程预检预算、自检参数边界、窗口契约、X11/Wayland 能力边界、Unicode 快捷键规范化、多屏/DPI 几何和诊断导出字段白名单）。
- 严格 Clippy（`-D warnings`）、项目元数据检查和 JavaScript 包体预算通过。
- Tauri 桌面代码：通过 `x86_64-pc-windows-gnu` 完整 feature 类型检查，并在 Linux 交叉链接出 PE32+ x86_64 Windows GUI Release EXE；Windows 真机运行仍由平台验收完成。
- Linux 原生依赖已安装，`cargo check --lib` 通过；三平台工作流只上传 Release 可执行文件，不生成安装器。
- `npm run tauri dev` 已完成原生编译并启动，成功连接当前 Herdr，读取到 28 个 Pane。
- Release Tauri/WebKitGTK 已在隔离 X11 会话生成六种状态及设置页视觉基线；连续采集哈希一致，尺寸、非空、全局快捷键和 `_NET_WM_STATE_ABOVE` 检查通过。Xvfb 不替代真实 GPU/合成器验收。
- Linux Release 端到端压力夹具通过：10 Agent、100 次完成迁移、Blocked 抢占、强制断线和自动重连；已纳入 CI 验证。
- 官方 Avatar Lab 运行时在 Release WebKitGTK 自检 v2 中通过：23 个动画、Controller、实际 SVG、Overlay 可见/无边框/尺寸/缩放及置顶 API 均合格；Windows/macOS CI 使用相同报告协议并验证平台置顶 getter。
- Weston headless 纯 Wayland Release 自检通过：WebKitGTK/SVG 正常，后端识别为 `wayland`，全局快捷键与绝对定位均按设计关闭，且应用没有因降级而阻塞启动或退出。
- 自定义全局快捷键已由配置驱动；Linux X11 实测 `Alt+Shift+F12` 能隐藏并恢复 Overlay，替换失败时保留旧配置。
- 设置保存先应用可回滚的桌面副作用，再原子落盘；失败时恢复窗口、快捷键和开机启动状态。诊断导出不包含原始运行时错误、Socket、Pane/Workspace 或角色工程内容。
- 所有设置页、托盘和窗口位置写入通过同一串行事务入口，只有落盘成功才更新内存并广播；Windows Release 入口显式使用 GUI subsystem，避免启动时出现控制台窗口。

## 仍需人工验收

- 在带正常 GPU/桌面会话的 Linux 环境目测透明背景、托盘、鼠标穿透和拖动手感；X11 与纯 Wayland 软件渲染均已自动启动验证，但当前主机没有 `/dev/dri`。
- 启动真实 Herdr 与至少一个 Agent，目测 `working -> idle/done`、`blocked`、Herdr 重启恢复。
- Windows 与 macOS 的窗口行为测试属于后续跨平台验证，不由交叉类型检查替代。
- Xvfb 软件渲染完整进程树短烟测尚未达到路线图 CPU 预算；需在真实 GPU 会话复验。只测 Tauri 父进程的旧结果不再作为发布证据；八小时长稳已按产品决策移出当前门禁。
