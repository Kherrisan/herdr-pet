# Herdr Pet

基于 Tauri 2、Rust、React 和 TypeScript 的 Herdr 桌面宠物。当前实现包含透明置顶宠物窗口、设置窗口、系统托盘、Herdr Socket 监听、多 Agent 调度与过滤、Avatar Studio Project v2 导入、官方 Bible Strong Avatar Lab 程序化 SVG 运行时，以及桌面配置/位置持久化。

头像渲染直接集成 [Bible Strong Avatar Lab](https://github.com/smontlouis/bible-strong-avatar-lab) 官方导出器和浏览器运行时，固定版本及许可证信息见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

本项目采用 GNU AGPL v3.0-only，完整许可证文本随上游源码保存在 `third-party/avatar-lab/LICENSE`。

## 开发环境

Ubuntu / Debian 需要先安装 Tauri 的原生依赖：

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libdbus-1-dev libgtk-3-dev \
  libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev
```

然后安装依赖并启动：

```bash
npm install
npm run tauri dev
```

默认全局快捷键 `Cmd/Ctrl+Shift+H` 可随时显示或隐藏宠物，即使已经开启鼠标穿透也能恢复。设置页可配置开机启动、提示音、动画速度、观察范围和脱敏诊断导出。

需要从终端直接打开设置页时，可以运行已安装的 `herdr-pet --settings`；设置 WebView 会按需创建，不会在普通后台启动时占用资源。

应用按照以下顺序寻找 Herdr：配置文件中的显式 Socket、`HERDR_SOCKET_PATH`、显式/环境中的 Session，最后是默认的 `~/.config/herdr/herdr.sock`。命名 Session 使用 `~/.config/herdr/sessions/<name>/herdr.sock`。Windows 由与 Herdr 相同的 `interprocess` 命名空间规则映射到 Named Pipe。

Windows 原生版还支持在设置页勾选“WSL 模式”，用于连接运行在 WSL 中的 Herdr。应用通过 `wsl.exe` 启动按连接生存的本地转发进程，不开放 TCP 端口；发行版留空时使用系统默认 WSL 发行版，Linux Socket 留空时在该发行版内按 `HERDR_SOCKET_PATH`、Session 和默认配置目录自动发现。WSL 环境需要提供支持 Unix Socket 的 `nc`，Ubuntu/Debian 可执行 `sudo apt-get install netcat-openbsd`。

## 验证

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

Rust 桌面测试和 Clippy 需要上面的 Linux 原生依赖。若只想运行不依赖 GTK/WebKitGTK 的协议、状态迁移、聚合和规则引擎测试，可执行 `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features`。

Linux Release 性能短烟测可执行 `npm run perf:smoke -- --build`，并通过 `HERDR_PET_PERF_SCENARIO=sleeping|idle|working` 选择稳定夹具。指标统计 Tauri 与 WebKit 完整进程树；Xvfb 结果只用于建立软件渲染基线，不替代真实 GPU 桌面测试。八小时长稳当前不作为发布门禁，`perf:soak` 仅保留为后续可选工具。

Linux X11 视觉基线可在 Release 二进制构建后执行 `npm run visual:capture:linux`。它会使用隔离的 Xvfb/Openbox 会话和假 Herdr，抓取六种宠物状态及设置页；结果与限制见 `plans/visual-baseline/linux-x11/README.md`。

多 Agent 端到端压力验收可执行 `npm run stress:linux -- --build`。夹具会让 10 个 Agent 产生 100 次完成迁移，在事件洪峰中插入 Blocked，并强制断开订阅以验证真实桌面进程能够重连。

官方 Avatar Lab 浏览器运行时可执行 `npm run runtime:self-test:linux -- --build` 做 X11 系统 WebView 自检。应用会在真实 WebKitGTK 中加载运行时、创建 Controller、确认动画与 SVG，并验证 Overlay 的可见性、无边框、逻辑尺寸、Scale Factor 和置顶 API，写出机器可读 v2 报告后自行退出。安装 Weston 后可运行 `npm run runtime:self-test:wayland`，在无 XWayland 的纯 Wayland 会话确认运行时正常且全局快捷键、绝对定位明确降级。Windows/macOS 构建后执行 `npm run runtime:self-test:native`；CI 使用同一报告协议验证 WebKitGTK、WebView2 或 WKWebView。

三平台产物由 `Build executables` 工作流生成：Linux x86_64、Windows x86_64，以及 macOS Apple Silicon/Intel 的 Release 可执行文件。当前不生成 `.deb`、MSI/NSIS、DMG 或其他安装器。

在 Debian/Ubuntu 上可选地交叉验证 Windows 链接：安装 `binutils-mingw-w64-x86-64 gcc-mingw-w64-x86-64`，添加 Rust 的 `x86_64-pc-windows-gnu` target，然后运行 `npm run tauri build -- --target x86_64-pc-windows-gnu --no-bundle`。产物位于 `src-tauri/target/x86_64-pc-windows-gnu/release/herdr-pet.exe`；该检查不能替代 Windows 上的 WebView2 与窗口行为验收。

项目使用的 Herdr 源码固定在 [`third-party/herdr`](third-party/herdr)，开发期协议 Schema 位于 [`third-party/herdr/docs/next/api/herdr-api.schema.json`](third-party/herdr/docs/next/api/herdr-api.schema.json)。
