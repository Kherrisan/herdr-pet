# Herdr Pet 后续开发路线图

更新日期：2026-08-15

> 实施状态（2026-08-15）：当前版本为 `0.4.0-beta.0`。M1–M5 的代码主链路已实现，自动化验收已覆盖官方运行时、Studio v2 导入/恢复、动画映射、双通道多 Agent 调度、设置页、托盘、诊断和窗口降级。M6 仍在进行：三平台 CI、许可证、安全检查、包体预算和 Linux X11 真实 WebKit 光栅基线已具备；构建目标已收敛为 Linux、Windows、macOS 的 Release 可执行文件，不生成 `.deb`、安装器或发布草稿。真实 Linux GPU 桌面及 Windows/macOS 真机行为仍待验收。

### 里程碑状态

| 里程碑 | 当前状态 | 尚需完成 |
| --- | --- | --- |
| M1 官方运行时稳定化 | 代码完成 | Windows WebView2、macOS WKWebView 的 Blob module 真机确认 |
| M2 Studio v2 导入持久化 | 完成 | 无阻塞项；后续可选生成磁盘 `preview.svg` 缓存 |
| M3 设置页与动画映射 | 代码完成 | 三平台人工走查五步导入体验与视觉细节 |
| M4 多 Agent 调度 | 代码完成 | 真实 Herdr 高频场景及隐藏窗口 CPU 复验 |
| M5 桌面产品化 | 代码完成 | Windows/macOS 托盘、DPI、多屏和开机启动真机验收 |
| M6 跨平台验收 | 进行中 | 真实 Linux GPU 与 Windows/macOS 视觉、窗口和性能验收；Windows GUI EXE 已完成交叉链接 |

当前自动化基线：前端 7 个测试文件共 30 项，Rust 全 feature 44 项，Avatar Lab 上游 76 项；`npm run build`、严格 Clippy、项目元数据检查及 400 KiB JavaScript 包体预算均通过。5 MiB 上限工程在 debug 测试中完成预检约 0.27 秒，低于 2 秒预算。Linux Release 端到端压力夹具已验证 10 个 Agent、100 次完成迁移、Blocked 抢占及断线重连，并进入 CI 门禁。

## 1. 当前基线

已经具备：

- Tauri 2 双窗口、透明置顶 Overlay、设置页和托盘。
- Herdr Socket 发现、Snapshot、订阅、重连和多 Agent 聚合。
- Turn 完成、请求关注、开始工作等 Animation Intent。
- 官方 Bible Strong Avatar Lab 源码、导出器和浏览器运行时。
- 官方 Strobi、Studio Project v2 导入以及可自定义的状态/事件动画映射。
- Rust 与前端自动测试、生产构建和 Linux 原生启动验证。

当前主链路已经闭环，最大的剩余缺口是跨平台真机与真实 GPU 性能验证，而不是功能入口。后续工作以 M6 的视觉回归、性能节流和 Windows/macOS 真机验收为主。

## 2. 用户离开期间采用的默认决策

为避免实现过程中因非关键选择停顿，默认按以下规则推进：

- 角色创作只依赖 Avatar Lab，不在 Herdr Pet 内实现角色编辑器。
- 动态导入只接受 Avatar Studio Project JSON v2，不接受 JS、HTML 或 TSX。
- 继续直接使用官方运行时，并遵循 AGPL-3.0-only。
- 原始工程文件保留，运行时 Avatar Data v1 可以随时重新生成。
- 首版每次只激活一个 Avatar，但允许安装多个工程和切换。
- 导入文件上限暂定 5 MiB；超限直接拒绝。
- 冲突以内容 SHA-256 区分，相同内容不重复安装。
- 缺少映射动画时依次回退：用户映射 → 推荐映射 → `idle` → 第一个可用动画。
- 不为自定义角色开放任意 JavaScript 执行权限。
- 不在这一轮实现活动窗口跟随；它不会阻塞核心产品闭环。

## 3. 总体执行顺序

```text
M1 运行时稳定化
  ↓
M2 Studio JSON 导入与持久化
  ↓
M3 头像选择、动画映射与试听
  ↓
M4 动画调度和多 Agent 体验完善
  ↓
M5 桌面产品化
  ↓
M6 跨平台、性能与安全验收
```

每个里程碑必须保持项目可构建；当前交付版本已完成 M2–M5 主链路，后续迭代优先完成 M6 跨平台运行验收。

## 4. M1：官方运行时稳定化

目标：把当前“能够运行”提升为“有明确边界、可诊断、可升级”。

### 4.1 运行时封装

- 将官方源码版本、Studio Schema 版本和 Avatar Data 版本集中定义。
- `officialRuntime.ts` 只暴露：加载运行时、创建 Controller、可用动画列表。
- 增加运行时加载状态：`loading | ready | error`。
- 运行时失败时保留设置入口和错误详情，不让 Overlay 白屏。
- 增加 `onAnimationEnd` 桥接，为一次性动画调度做准备。
- 记录 Avatar Lab 固定提交；升级上游时必须显式变更版本记录和 fixtures。

### 4.2 CSP 和离线行为

- 验证 `blob:` 动态模块在 Linux WebKitGTK、Windows WebView2、macOS WKWebView 中工作。
- 系统 WebView 自检入口为 `herdr-pet --runtime-self-test <report.json>`；v2 报告同时确认官方 Controller、动画列表、SVG，以及 Overlay 的可见性、无边框、320×320 逻辑尺寸、Scale Factor 和平台置顶 API。启动窗口契约由元数据门禁锁定；Linux X11 视觉夹具额外直接验证 `_NET_WM_STATE_ABOVE`。Linux WebKitGTK 已实测通过并纳入 CI，Windows/macOS CI 在各自系统 WebView 中运行同一协议并要求置顶 getter 返回 true。
- 若某平台限制 Blob module，准备构建期生成静态模块的替代路径。
- 确认运行时不请求网络，断网状态仍能完整播放。
- 收紧 CSP，除官方本地运行时需要的能力外不增加权限。

### 4.3 验收

- Strobi 在 Overlay 和设置页均可加载。
- 连续切换全部官方动画不抛异常。
- React StrictMode 重挂载不会产生重复 SVG、计时器或 RAF 泄漏。
- 加载失败会显示可理解错误，设置窗口仍可打开。
- 对官方 payload、动画存在性和映射完整性有自动测试。

## 5. M2：Studio Project v2 导入与持久化

目标：用户可以将在 Avatar Lab 中制作的角色安全地安装到 Herdr Pet。

### 5.1 存储布局

应用数据目录建议：

```text
avatars/
├── index.json
└── <installation-id>/
    ├── project.json
    ├── metadata.json
    └── preview.svg
```

`metadata.json` 保存：

- 安装 ID、内容 SHA-256、导入时间。
- Studio Project 版本和 importer 版本。
- 工程显示名、Avatar 数量和 animation 数量。
- 当前选择的 Avatar ID。
- 不保存或执行任何代码。

### 5.2 Rust 导入边界

新增 Commands：

- `inspect_avatar_project(source)`：只校验并返回摘要，不写入。
- `install_avatar_project(source, avatar_id)`：原子保存并更新索引。
- `list_avatar_installations()`：返回已安装工程。
- `remove_avatar_installation(id)`：删除非当前安装；删除前确认。
- `select_avatar(installation_id, avatar_id)`：更新配置并通知两个窗口。

Rust 首层校验：

- UTF-8 和 JSON 可解析。
- 文件 ≤ 5 MiB。
- `version === 2`。
- Avatar ≤ 64，Expression ≤ 512，Animation ≤ 256。
- 每个动画 Step ≤ 512，总 Step ≤ 8192。
- 字符串长度、数组长度、数字有限值和嵌套深度受限。
- 使用临时文件 + fsync/rename 原子安装，失败不留下半成品。

前端第二层使用官方 parser 做规范化，再用官方 exporter 生成 Avatar Data v1。

### 5.3 配置 Schema v2

当前配置升级到 `schemaVersion: 2`，Avatar 部分建议为：

```ts
avatar: {
  installationId: string | null;
  avatarId: string | null;
  animationSpeed: number;
  stateAnimations: {
    sleeping: string;
    idle: string;
    working: string;
    needsAttention: string;
    offline: string;
  };
}
```

要求：

- 明确实现 v1 → v2 迁移，不能因新增字段丢弃旧设置。
- 未知未来版本先备份再拒绝，不静默覆盖。
- 配置引用的安装被删除或损坏时回退内置 Strobi。

### 5.4 验收

- 官网导出的有效 Project v2 可以预检和安装。
- 多 Avatar 工程可以选择任意一个 Avatar。
- 重启后恢复已选择角色。
- 重复导入相同文件不会创建重复副本。
- 非法、超限、截断和悬空引用工程有明确错误且不写磁盘。
- 内置 Strobi 永远是可用的恢复选项。

## 6. M3：设置页角色管理与自定义动画映射

目标：形成完整的非开发者使用流程。

### 6.1 角色管理界面

- 增加“角色”分区：当前角色、来源、安装时间和 Avatar Lab 版本。
- 使用 `<input type="file" accept="application/json,.json">` 读取工程，无需扩大 Tauri 文件权限。
- 导入前展示摘要：工程名、Avatar 数量、Animation 数量、文件大小。
- 展示 Avatar 卡片和实时预览，选择后才安装/启用。
- 支持切回内置 Strobi、切换已安装工程和安全删除。
- 提供“在 Avatar Lab 中编辑”的外部链接，但不自动上传本地数据。

### 6.2 映射模型

持续状态：

| Herdr 状态 | 默认动画 |
| --- | --- |
| Sleeping | `sleeping` |
| Idle | `idle` |
| Working | `working` |
| Needs attention | `surprised` |
| Offline | `sad` |

瞬时事件继续使用现有 `EventRule.animation`：

| Herdr 事件 | 默认动画 |
| --- | --- |
| Agent detected/reconnected | `waking` |
| Agent started | `excited` |
| Turn completed | `celebrate` |
| Attention requested | `surprised` |
| Agent exited | `drowsy` |

所有下拉选项从当前 Avatar Data v1 的 animation keys 动态生成。切换 Avatar 后：

- 保留仍然存在的映射。
- 对缺失映射应用推荐映射和回退规则。
- 向用户列出被自动替换的项目。

### 6.3 动画试听

- 每个映射旁提供播放按钮。
- 设置页预览拥有独立 Controller，不影响桌面 Overlay。
- 提供播放/暂停/停止、动画速度和是否循环。
- 瞬时动画试听到时自动回到设置页当前持续状态。
- 提供“模拟事件”：开始工作、完成、请求关注、离线、恢复。

### 6.4 验收

- 新用户从 Avatar Lab 导出到桌面宠物生效不超过五步。
- 设置页列出的动画与运行时实际可播放动画完全一致。
- 所有 Herdr Intent 都能配置、试听和恢复默认值。
- 切换 Avatar 不会让 Overlay 短暂消失或保留旧计时器。

## 7. M4：动画调度与多 Agent 体验

目标：高频、多 Agent 场景下仍然清晰，不刷屏、不丢关键提醒。

### 7.1 正式聚合模型

多 Agent 使用两条独立通道，不能把所有信息只压缩成一个状态：

```text
AgentCache: Map<SessionId + PaneId, AgentState>
        │
        ├── 持续状态聚合 ──→ 当前循环动画
        │
        └── 状态迁移检测 ──→ TransientQueue ──→ 瞬时动画/气泡
```

- 持续状态回答“现在整体怎么样”。
- 瞬时事件回答“刚才发生了什么”。
- 单只宠物表达系统整体状态，不频繁切换成某个 Agent 的化身。
- 具体 Agent、Workspace 和数量由气泡与设置页表达。

这也是首版正式产品决策：默认只显示一只宠物，不为每个 Agent 创建一个悬浮窗口。Agent 数量、名称和 Workspace 是事件元数据；持续动画只表达整体健康状态。这样 Agent 数量从 1 扩展到数十个时，桌面占用和窗口管理复杂度不会线性增长。

聚合层的输入和输出边界固定为：

```text
Herdr Snapshot / Event
  → ObservationFilter
  → AgentCache<SessionId + PaneId, AgentInfo>
      ├─ AggregateReducer → AggregateState → 循环动画
      └─ TransitionDetector → PetIntent → Scheduler → 瞬时动画 + 气泡 + 声音
```

- `SessionId + PaneId` 是 Agent 唯一键，避免不同 Session 的同名 Pane 相互覆盖。
- Snapshot 只替换事实缓存，不产生历史事件；订阅事件才进入迁移检测。
- 过滤先于缓存和迁移，未观察的 Agent 不得影响动画，也不得泄漏到气泡。
- Scheduler 不持有或修改 Agent 事实；瞬时动画结束后始终重新展示最新 `AggregateState`。
- 完成事件在合并窗口内按 `agentNames`、`workspaceIds` 去重并累计 `count`；气泡最多列出两个名字。
- 设置页展示 Agent 明细，Overlay 只显示当前最高优先级整体状态和一个正在播放的事件。

### 7.2 持续状态聚合

每次 Agent Cache 或连接状态变化后，按照以下顺序重新计算：

```text
Herdr 断线                    → Offline
Herdr 已连接且没有 Agent      → Sleeping
任意 Agent blocked            → Needs attention
否则任意 Agent working        → Working
否则                          → Idle
```

正式优先级：

```text
Offline > Needs attention > Working > Idle > Sleeping
```

规则说明：

- `blocked` 高于 `working`：即使其他 Agent 仍在工作，也应优先提醒需要用户处理的 Agent。
- `done` 不作为长期展示状态；由 `working → done` 产生完成事件，然后按剩余 Agent 重新聚合。
- Snapshot 只建立当前事实，不补播完成或开始事件。
- `unknown` 只参与缓存，不主动覆盖可确定的高优先级状态。

### 7.3 瞬时事件调度器

- 从组件中的单个 `setTimeout` 提取 `AnimationScheduler`。
- 持续动画与瞬时动画分开保存，瞬时动画临时覆盖持续动画。
- `working → idle/done` 产生 Turn completed，而不是把完成当作持续状态。
- 瞬时动画结束后重新读取最新 Agent Cache 并聚合，绝不返回播放前的陈旧状态。
- 支持官方运行时 `onAnimationEnd` 和最大持续时间双保险。
- 同类事件按照 `cooldownMs` 去重。
- 瞬时队列上限 8；超过上限时优先保留高优先级和最新事件。
- 一个事件只修改动画调度状态，不反向修改 Agent Cache。

### 7.4 完成事件批量合并

- 以 1 秒为默认合并窗口收集 Turn completed。
- 窗口内多个完成事件只播放一次 `celebrate`，默认不逐个排队。
- 单个完成显示具体 Agent；多个完成显示“`{count}` 个 Agent 完成了工作”。
- 气泡最多列出两个 Agent 名，更多使用“等 `{count}` 个 Agent”。
- 相同 Pane 的重复状态通知先由 Transition Detector 去重，再进入合并器。
- Celebrate 播放期间到达的新完成事件优先并入当前批次或下一批，不重新启动无限循环。

示例：

```text
10:00:00.100  Agent A: working → idle
10:00:00.420  Agent B: working → done
10:00:00.870  Agent C: working → idle

结果：播放一次 celebrate，气泡显示“3 个 Agent 完成了工作”。
```

### 7.5 抢占与回退规则

| 当前展示 | 新事件/状态 | 处理 |
| --- | --- | --- |
| Working | Turn completed | 临时播放 Celebrate |
| Celebrate | 另一个完成 | 合并计数或进入下一批 |
| Celebrate | Attention requested/Blocked | 立即中断，切换 Needs attention |
| Needs attention | Turn completed | 不抢占；完成事件可合并后延迟播放或在过期后丢弃 |
| 任意普通动画 | Herdr Offline | 立即切换 Offline 并清理无意义普通事件 |
| Offline | 普通 Agent 事件 | 不播放，等待连接恢复后的 Snapshot |
| Offline | Reconnected | 播放 Waking，随后根据新 Snapshot 聚合 |

Attention 和 Offline 属于保护性状态，优先级高于普通完成反馈。事件过期时间应可配置，避免用户处理完阻塞后补播很久以前的庆祝。

### 7.6 Agent 与 Workspace 过滤

设置页最终提供四种观察范围：

- 所有 Agent：默认且推荐。
- 当前 Workspace。
- 用户选择的多个 Workspace/Agent。
- 安静模式：只保留 Needs attention、Offline 和 Turn completed。

过滤在 Agent Cache 聚合和 Transition Detector 之前应用；被过滤 Agent 不应产生持续状态或瞬时事件。展示名称只使用 Herdr 元数据，不读取 Pane 内容。

### 7.7 速度、FPS 与节流

- `animationSpeed` 真正作用于官方运行时的 hold/transition/timer。
- 30/60 FPS 配置真正作用于 RAF 更新上限。
- 尊重 `prefers-reduced-motion`，默认降低环境动作而不是彻底隐藏状态。
- Overlay 不可见或系统锁屏时暂停高频渲染，恢复后重新计算当前状态。

### 7.8 验收

- 10 个 Agent 高频完成时队列长度受控。
- 1 秒内三个 Agent 完成只播放一次 Celebrate，并正确显示 `{count}`。
- 完成动画期间出现 Blocked 会立即切换关注动画。
- 动画结束后状态与 Agent Cache 当前事实一致。
- Snapshot 和重复展示字段更新不会误触发完成动画。
- 过滤掉的 Agent 不参与聚合，也不产生瞬时事件。
- Herdr 断线期间不补播历史事件，重连后以新 Snapshot 为准。
- 隐藏 Overlay 后 CPU 使用显著下降。

端到端验收入口为 `npm run stress:linux -- --build`：真实 Tauri/WebKitGTK Release 进程连接假 Herdr Socket，处理 10 个 Agent 的 100 次完成迁移，在洪峰中接收 Blocked，并在订阅被强制关闭后重新连接。脚本检查事件数量、保护性状态、连接次数与进程存活；队列长度、合并和抢占结果继续由确定性调度器测试证明。

## 8. M5：桌面产品化

### 8.1 常用功能

- 开机启动。
- 全局显示/隐藏快捷键；鼠标穿透后始终有恢复路径。
- 全局快捷键由 `desktop.toggleShortcut` 配置驱动；替换失败保留原注册，Linux X11 视觉夹具使用非默认组合实际验证隐藏与恢复。
- 托盘快速切换角色、暂停动画、静音和重连。
- 气泡模板编辑与变量预览：`{agent}`、`{workspace}`、`{count}`。
- 可选提示音，默认关闭；音量和每类事件单独开关。
- 诊断页：Herdr 版本、协议、Socket、最后事件、重连次数和运行时错误。
- 导出“脱敏诊断包”，禁止包含 Socket 路径、连接原始错误、Pane/Workspace 标识或文本、用户工程原始内容和 Avatar 运行时原始错误；诊断 JSON 由自动测试锁定显式字段白名单。

### 8.2 窗口与显示器

- 按显示器 ID + Scale Factor 保存逻辑坐标。
- 显示器拔插后把宠物移回最近可见区域。
- 支持屏幕边缘吸附、偏移和位置重置。
- 窗口几何已抽离为纯计算层，自动覆盖不同 DPI 坐标往返、显示器缺失、64px 最小可见区域和按 Scale Factor 计算的四边吸附。
- Wayland 下做能力探测并明确降级，不假装支持绝对定位。
- Weston headless 纯 Wayland Release 自检已纳入 CI：官方 WebKitGTK 运行时和 SVG 正常，报告明确为 `displayBackend=wayland`，全局快捷键与绝对定位能力均为 false；应用保持可启动、可渲染并正常退出。
- 活动窗口跟随继续作为独立可选模块，不进入首个稳定版阻塞项。

### 8.3 验收

- 用户不会因鼠标穿透或显示器变化失去宠物和设置入口。
- Herdr 未启动、升级或崩溃时桌面程序仍可操作。
- 配置损坏时自动备份并回到安全默认值。

## 9. M6：跨平台、性能与安全验收

### 9.1 自动化测试

- Rust：配置迁移、导入限制、原子安装、路径安全、索引恢复。
- TypeScript：官方 parser/exporter、映射回退、调度优先级、Controller 生命周期。
- 集成：假 Herdr Socket → Intent → 官方运行时 `play()`。
- Fixtures：最小有效工程、多 Avatar 工程、定制 behavior、各种非法工程。
- 视觉回归：已对 Sleeping、Idle、Working、Needs attention、Offline 和 Celebrate 的稳定 SVG 几何建立指纹；暂停/停止会取消环境动画 RAF，Linux X11 六状态连续采集已证明逐字节稳定，并由 Release Tauri/WebKitGTK 自动重建总览、校验尺寸、非空、快捷键和 X11 置顶标记，见 `plans/visual-baseline/linux-x11/`。仍需真实 Linux GPU/合成器目测，以及 Windows WebView2、macOS WKWebView 平台基线。

### 9.2 性能预算

- Release 空闲 CPU：目标 < 1%（平台允许时）。
- Working 状态 CPU：目标 < 5%。
- 常驻内存：先记录基线，再设置每平台预算。
- Overlay 首次可见：目标 < 500ms。
- 导入 5 MiB 上限文件：目标 < 2s 且 UI 不永久冻结。
- 短时完整进程树采样无立即可见的持续内存增长；八小时长稳工具保留，但当前不阻塞发布。

执行方式：`npm run perf:smoke -- --build` 在隔离 X11/Xvfb 会话采集进程启动、平均 CPU 和峰值 RSS；支持 Sleeping、Idle、Working 三种稳定夹具。统计口径已修正为 Tauri 与全部 WebKit 子进程。按需创建设置窗口后，Sleeping 30 秒完整进程树样本为 3 个进程、13.15% CPU、538312 KiB 峰值 RSS；Xvfb 软件合成仍未达到预算。详细方法、已废弃的父进程口径和后续 GPU 验收见 `plans/performance-baseline.md`。

### 9.3 平台矩阵

| 平台 | 必验内容 |
| --- | --- |
| Linux X11 | 透明、置顶、托盘、拖动、穿透、Blob module |
| Linux Wayland | 纯 Wayland 启动、运行时和位置/快捷键降级已自动验证；真实 Compositor 下的托盘与透明背景仍需目测 |
| Windows 11 | WebView2、Named Pipe、WSL 模式、DPI、多屏和 Release EXE；WSL 模式已实现 `wsl.exe` + Unix Socket 标准流桥接，仍需 Windows 真机联调 |
| macOS | WKWebView、置顶层级、DPI/多屏和 LaunchAgent |

### 9.4 安全与许可证

- 导入资源只允许 JSON，不执行工程携带的代码。
- Tauri Commands 使用最小能力，避免开放通用文件系统和 Shell。
- CSP 不增加远程脚本源。
- 记录直接集成 Avatar Lab 的固定提交及本项目修改。
- 当前只构建三平台可执行文件；`.deb`、MSI/NSIS、DMG、签名、商店发行和自动更新暂缓。

### 9.5 版本阶梯

1. `0.2.0-dev`：完成 M1–M2，开发者可导入 JSON。
2. `0.3.0-alpha`：完成 M3，普通用户完成导入、选择、映射和试听。
3. `0.4.0-beta`：完成 M4–M5，开始多 Agent 和长时间测试。
4. `1.0.0-rc`：完成三平台可执行文件和真机运行验证。
5. `1.0.0`：无阻塞缺陷，文档、源码和三平台可执行文件齐全。

## 10. 建议的近期任务批次

### 批次 A：稳定当前官方运行时

- 加载状态与错误边界。
- Controller 生命周期测试。
- CSP/Blob module 平台验证记录。
- 更新状态文档中的测试数量。

### 批次 B：导入核心

- 配置 Schema v2 和迁移。
- Rust 导入/索引/删除 Commands。
- 官方 parser 和 exporter 适配层。
- 有效/非法 fixtures 与测试。

### 批次 C：设置页闭环

- 文件选择和导入摘要。
- Avatar 卡片与预览。
- 持续状态及事件动画下拉映射。
- 试听和模拟事件。

### 批次 D：调度与产品化

- AnimationScheduler。
- 多 Agent 合并、过滤和诊断。
- 开机启动、快捷键、托盘增强、多显示器。

## 11. 暂缓事项

以下内容有价值，但不应抢占 M1–M4：

- 内置完整 Avatar 编辑器。
- Rive、Lottie、Sprite Sheet 和原生 wgpu Renderer。
- 活动窗口跟随和复杂物理吸附。
- 在线角色市场、云同步和账号系统。
- 读取 Agent 对话正文来决定表情。
- 自动修改 Herdr 配置或向 Agent 注入 Hook。

## 12. 用户回来时需要确认的产品选择

这些问题不阻塞近期实现，但在 Beta 前需要决定：

- 首个正式支持的平台顺序。
- 是否默认启用提示音和气泡。
- 是否公开发布为完全 AGPL 项目及源码仓库地址。
- 角色安装是否允许一个工程同时启用多个 Avatar 快速切换。
- 活动窗口跟随是否进入 1.0，还是放到 1.x。
