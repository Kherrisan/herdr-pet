# Herdr Pet 桌面宠物实施计划

## 1. 项目目标

开发一款基于 Tauri 2 的跨平台桌面宠物程序。程序长期运行在桌面上方，通过 Herdr Socket API 观察 Herdr 中运行的所有 Agent，在 Agent 开始工作、完成一轮工作、等待用户输入或退出时播放对应动画。

首版重点不是角色编辑器，而是验证完整核心链路：

```text
Herdr Agent 状态变化
    -> Herdr Socket 事件
    -> 本地状态迁移判断
    -> 宠物事件规则
    -> 桌面动画反馈
```

### 1.1 核心体验

- 桌面显示一个透明、无边框、始终置顶的动画角色。
- 用户可以自由拖动、缩放和锁定宠物。
- 任意 Herdr Agent 完成一次 Turn 时，宠物播放完成动画。
- Agent 请求确认或回答时，宠物进入需要关注状态。
- 多个 Agent 并行工作时，程序聚合状态并避免动画刷屏。
- 设置窗口保持简单，不承载复杂运行监控界面。

### 1.2 首版非目标

- 不修改或 Fork Herdr 核心代码。
- 不直接依赖某一种 Agent 的私有 Hook。
- 不开发完整的在线角色商城。
- 不开发与 Avatar Lab 同等复杂度的角色编辑器。
- 不在首版实现 Live2D、复杂骨骼、布料或物理系统。
- 不保证 Wayland 下的全局窗口定位和活动窗口跟随。
- 不精确追踪 Herdr 没有提供的原生 Turn ID。

## 2. 已确定的技术方案

### 2.1 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 后台核心 | Rust + Tokio |
| 设置界面 | React + TypeScript |
| 构建工具 | Vite |
| 第一版动画 | Bible Strong Avatar Lab 程序化头像格式 |
| 渲染 | Avatar Lab 兼容运行时 + SVG |
| 创作/交换 | Avatar Studio Project JSON v2 |
| 配置持久化 | JSON，使用版本化 Schema |
| Herdr 通信 | Unix Domain Socket / Windows Named Pipe |
| 前后端通信 | Tauri Commands + Events |
| 系统入口 | Tauri System Tray |

### 2.2 选择 Tauri 的理由

- Herdr 和本项目后台均使用 Rust，协议、状态模型和错误处理更容易复用。
- 常驻桌面程序需要尽量降低基础资源占用。
- 设置页面可以继续使用成熟的 Web UI 技术。
- Avatar Lab 的程序化几何、SVG 渲染和时间线动画足以覆盖首版 2D 宠物动画。
- Tauri 提供透明窗口、无边框窗口、置顶、托盘、多窗口和鼠标穿透能力。
- Rust Core 与渲染器分离，未来可以替换为 Vello、wgpu 或其他原生渲染器。

## 3. 总体架构

```text
┌───────────────────────────────────────────────────────────┐
│                    Herdr Background Server                │
│                                                           │
│ Agent Hooks / Plugins / Screen Detection                  │
│                         │                                 │
│                         ▼                                 │
│               Normalized Agent State                      │
│       idle / working / blocked / done / unknown           │
│                         │                                 │
│                         ▼                                 │
│          session.snapshot + events.subscribe              │
└─────────────────────────┬─────────────────────────────────┘
                          │ local socket
┌─────────────────────────▼─────────────────────────────────┐
│                      Tauri Rust Core                      │
│                                                           │
│  Socket Discovery -> Connector -> Runtime Cache           │
│                                  │                        │
│                                  ▼                        │
│                         Transition Detector               │
│                                  │                        │
│                                  ▼                        │
│                    Rules + Event Aggregator                │
│                         │              │                  │
│                         ▼              ▼                  │
│                  Pet State Store    Config Store           │
└─────────────────────────┬─────────────────────────────────┘
                          │ Tauri event
             ┌────────────┴────────────┐
             ▼                         ▼
┌────────────────────────┐  ┌───────────────────────────────┐
│ Transparent Pet Window │  │       Settings Window         │
│ SVG / Sprite Renderer  │  │ React forms + live preview   │
└────────────────────────┘  └───────────────────────────────┘
```

### 3.1 进程与窗口

应用保持一个 Tauri 主进程，创建两个 WebView 窗口：

#### `pet-overlay`

- 透明背景。
- 无系统边框。
- 默认始终置顶。
- 不出现在任务栏。
- 默认不抢占键盘焦点。
- 可拖动。
- 可切换鼠标穿透。
- 只加载宠物渲染和轻量交互代码。
- 设置窗口关闭后仍继续运行。

#### `settings`

- 普通系统窗口。
- 由托盘菜单或宠物右键菜单打开。
- 负责通用配置、Herdr 连接状态、动画映射和角色包管理。
- 可以嵌入宠物动画实时预览，但不直接持有 Herdr Socket。

### 3.2 Rust Core 模块

```text
src-tauri/src/
├── main.rs
├── app.rs
├── config/
│   ├── mod.rs
│   ├── schema.rs
│   ├── migrations.rs
│   └── store.rs
├── herdr/
│   ├── mod.rs
│   ├── discovery.rs
│   ├── transport.rs
│   ├── protocol.rs
│   ├── snapshot.rs
│   ├── subscriber.rs
│   └── reconnect.rs
├── agents/
│   ├── mod.rs
│   ├── state.rs
│   ├── cache.rs
│   ├── transition.rs
│   └── aggregate.rs
├── pet/
│   ├── mod.rs
│   ├── event.rs
│   ├── intent.rs
│   ├── rules.rs
│   ├── priority.rs
│   └── cooldown.rs
├── avatar/
│   ├── mod.rs
│   ├── manifest.rs
│   ├── validation.rs
│   └── import.rs
├── platform/
│   ├── mod.rs
│   ├── windows.rs
│   ├── macos.rs
│   └── linux.rs
├── tray.rs
└── commands.rs
```

Rust Core 是唯一可信状态源。前端刷新、设置窗口重建或 WebView 崩溃不应导致 Herdr 连接和 Agent 状态缓存丢失。

## 4. Herdr 集成设计

### 4.1 集成边界

桌宠只对接 Herdr，不直接对接 Codex、Claude Code、OpenCode 等 Agent。

Herdr 内部可能通过以下方式获得状态：

- Agent Hook。
- Agent 插件。
- OSC 标题。
- 终端屏幕检测规则。
- 自定义 Socket 状态上报。

桌宠统一消费 Herdr 输出的语义状态，避免维护多套 Agent 适配器。

### 4.2 Socket 发现

Unix 默认路径：

```text
~/.config/herdr/herdr.sock
~/.config/herdr/sessions/<name>/herdr.sock
```

Windows 使用 Herdr 提供的 Named Pipe 形式，具体名称以运行时 Schema 和 Herdr 当前实现为准。

Windows 原生桌宠可在设置页勾选“WSL 模式”。该模式由 Windows 进程调用 `wsl.exe`，在所选发行版内使用 `nc -U` 将每条标准输入/输出流直接桥接到 Herdr Unix Socket；不监听 TCP 端口，不需要常驻桥接守护进程。发行版、Linux Socket 路径均可覆盖，留空则使用默认发行版并在 WSL 内按环境变量、Session 和默认目录发现。

发现顺序：

1. 用户显式配置的 Socket 或会话。
2. `HERDR_SOCKET_PATH`。
3. 默认 Herdr Session。
4. 用户开启“监听所有会话”后扫描命名 Session。

首版默认只自动连接默认 Session；多 Session 支持在基础链路稳定后加入。

### 4.3 启动与订阅流程

```text
应用启动
  -> 发现 Herdr Socket
  -> ping
  -> session.snapshot
  -> 初始化 Workspace / Pane / Agent 缓存
  -> events.subscribe
  -> 消费 pane.agent_status_changed
  -> 同时监听 pane.created / pane.closed / pane.exited
```

`session.snapshot` 仅用于建立当前事实，不能触发“完成”动画。只有启动后观测到的状态迁移才能产生瞬时事件。

### 4.4 断线恢复

- Socket EOF、Herdr 重启或协议错误后进入 `disconnected`。
- 宠物播放一次离线提示，然后进入 `offline` 持续状态。
- 使用指数退避重连：250ms、500ms、1s、2s，最大 10s。
- 重连成功后重新执行 `session.snapshot` 和订阅。
- 重连 Snapshot 只替换缓存，不补播断线期间可能发生的完成动画。
- Herdr Server handoff 造成订阅中断时同样走重连流程。
- 设置窗口展示最后错误和下一次重试时间。

### 4.5 协议兼容

- 启动时读取 Snapshot 中的协议和版本元数据。
- 开发期使用 `herdr api schema --json` 生成或校验所需协议类型。
- 只实现当前使用到的字段，对新增字段保持向前兼容。
- 未识别状态映射为 `unknown`，不能直接当作失败或完成。
- 协议不兼容时显示明确错误，不循环刷通知。

## 5. Agent 状态与 Turn 推导

### 5.1 Herdr 状态

```rust
enum AgentState {
    Idle,
    Working,
    Blocked,
    Done,
    Unknown,
}
```

语义：

- `working`：Agent 正在执行。
- `idle`：Agent 已可接受输入，且对应标签页已被看见。
- `done`：Agent 已可接受输入，但后台完成状态尚未被看见。
- `blocked`：Agent 等待授权、确认或用户回答。
- `unknown`：Herdr 已知 Agent 存在，但不能可靠判断状态。

### 5.2 本地状态迁移

```rust
struct AgentTransition {
    session_id: String,
    workspace_id: String,
    pane_id: String,
    agent: Option<String>,
    title: Option<String>,
    from: AgentState,
    to: AgentState,
    observed_at: SystemTime,
}
```

每个 Session 内以 `pane_id` 保存上一个状态。若事件只改变展示字段而状态未变化，应更新元数据但不触发动画。

### 5.3 Turn 事件推导

| 状态迁移 | 业务事件 |
| --- | --- |
| `idle/done/blocked -> working` | `agent_started` |
| `working -> idle` | `turn_completed` |
| `working -> done` | `turn_completed_background` |
| `working/idle/done -> blocked` | `attention_requested` |
| Agent 首次被检测到 | `agent_detected` |
| Pane 或 Agent 退出 | `agent_exited` |
| 任意状态变为 `unknown` | 只更新聚合状态，默认无瞬时动画 |

Herdr 不提供精确的单 Turn ID，因此 `turn_completed` 是根据 `working -> idle/done` 推导出的可靠近似。不得把所有 `idle` 或 `done` Snapshot 当作新完成事件。

### 5.4 聚合持续状态

```text
Herdr 未连接                         -> offline
存在 blocked Agent                  -> needs_attention
不存在 blocked，但存在 working      -> working
存在 Agent，且全部处于稳定空闲状态    -> idle
不存在 Agent                         -> sleeping
```

聚合状态在每次 Agent 缓存变化后重新计算。

## 6. 宠物事件规则引擎

### 6.1 两类动画状态

#### 持续动画

- `sleeping`
- `idle`
- `working`
- `needs_attention`
- `offline`

#### 瞬时动画

- `greeting`
- `start_working`
- `celebrate`
- `celebrate_background`
- `ask_for_help`
- `goodbye`
- `reconnected`

瞬时动画完成后重新计算并回到持续动画，不能简单返回到播放前状态，因为期间可能有其他 Agent 发生变化。

### 6.2 默认优先级

```text
offline
  > needs_attention
  > turn_completed
  > agent_detected
  > agent_started
  > working
  > idle
  > sleeping
```

需要关注事件可以中断低优先级动画；普通完成事件不能中断正在播放的需要关注动画。

### 6.3 防刷屏

- 同类完成事件在 1 秒窗口内合并。
- 合并事件气泡可显示“3 个 Agent 已完成”。
- 默认同类动画冷却 1 秒。
- 动画队列默认最大 8 项。
- 队列满时优先丢弃低优先级重复事件。
- `blocked` 和断线事件不能因队列满而丢失。
- 用户可选择“只播放一次聚合动画”或“逐个播放”。

### 6.4 规则过滤

每条事件规则支持：

- 启用/禁用。
- Agent 类型过滤。
- Workspace ID、名称或路径过滤。
- Herdr Session 过滤。
- 动画映射。
- 气泡文本模板。
- 声音映射。
- 持续时间。
- 冷却时间。

模板变量首版支持：

```text
{agent}
{workspace}
{title}
{count}
```

## 7. 动画系统

### 7.1 渲染器抽象

前端定义统一接口：

```ts
interface PetRenderer {
  loadPack(pack: LoadedPetPack): Promise<void>;
  play(animation: string, options?: PlayOptions): Promise<void>;
  setState(state: string): void;
  setParameter(name: string, value: number): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}
```

首版实现：

- `AvatarLabRenderer`：加载兼容的 Avatar Data v1，暴露 `play`、`pause`、`stop`、`destroy`。
- `AvatarStudioImporter`：读取 Avatar Studio Project JSON v2，选择头像并转换为运行时数据。

未来可以增加：

- `RiveRenderer`
- `LottieRenderer`
- `CanvasRenderer`
- `VelloRenderer`
- `WgpuRenderer`

### 7.2 Avatar Lab 兼容层

- 运行时数据采用 Avatar Lab 导出的 Avatar Data `version: 1`：`avatar`、`expressions`、`animations`。
- 动画由 expression steps 组成，每步包含 `expressionId`、`holdMs`、`transitionMs` 和 `transition`。
- 支持 `loop`、`once`、`pingPong` 播放模式和自动眨眼配置。
- 对 Herdr 上层提供稳定的 `play/pause/stop/destroy` 接口；动画结束时产生 `animation-finished`。
- Avatar Studio Project JSON `version: 2` 是用户创作和备份的首选导入格式。
- 不执行用户导入包中的任意 JavaScript；React/JavaScript ZIP 仅作为 Avatar Lab 的应用集成导出，不作为 Herdr Pet 的动态导入格式。
- 详细兼容策略见 `plans/avatar-lab-format.md`。

### 7.3 后续渲染器

PNG Sprite Sheet、Rive、Lottie 等保留为未来可选渲染器，不进入首版宠物包主路径。

### 7.4 动画性能

- 空闲状态尽量使用低频或合成线程动画。
- 设置后台节流策略，确保置顶宠物不可见时不会持续高频消耗。
- 提供 30/60 FPS 上限选项。
- 多显示器高 DPI 下按照逻辑尺寸存储位置，按显示器 Scale Factor 渲染。
- 首版目标：单个 320×320 SVG 动画在常用设备上稳定保持 60 FPS。

## 8. 宠物格式

### 8.1 文件形式

首版不再发明 `.herdrpet` ZIP Schema。用户从 Avatar Lab 导出 `avatar-studio-project.json` 后直接导入；应用在本地选择其中一个 avatar，并生成/缓存 Avatar Data v1。

应用自己的配置只保存以下附加信息，不改写 Avatar Lab 文档：

```json
{
  "source": "avatar-studio-project.json",
  "avatarId": "strobi",
  "eventAnimations": {
    "sleeping": "sleeping",
    "idle": "idle",
    "working": "working",
    "needs_attention": "alerting",
    "offline": "powering-down",
    "turn_completed": "celebrate"
  }
}
```

映射值是导入头像中实际存在的 animation key，缺失时按 `idle` 再到首个可用动画回退。

### 8.3 安全边界

- 仅接收 JSON，限制文件大小、头像数、expression 数、animation 数和每条时间线步数。
- 对所有数字做有限值与范围校验，对 ID/名称做长度限制并拒绝危险对象键。
- 不执行导入文件中的代码，不加载远程资源，不接受 HTML/JS/TSX 作为动态宠物资源。
- 原始工程文档与规范化运行时数据分开保存；格式版本不兼容时明确报错。
- Avatar Lab 当前 Schema 是 pre-release，只承诺适配已测试版本，并通过 fixture 和迁移器控制升级。
- 若直接复用 Avatar Lab 源码或生成运行时，必须遵守其 GNU AGPL v3.0 许可证；许可证策略在发布前单独确认。

## 9. 设置页面

设置窗口保持单页或四个轻量分区。

### 9.1 外观

- 当前宠物包。
- 宠物大小。
- 整体透明度。
- 水平翻转。
- 动画速度。
- 30/60 FPS。
- 显示/隐藏气泡。
- 声音总开关和音量。

### 9.2 位置与交互

- 自由拖动。
- 记住位置。
- 始终置顶。
- 锁定位置。
- 鼠标穿透。
- 显示在所有桌面/Space（平台支持时）。
- 全屏应用时隐藏。
- 开机启动。

鼠标穿透开启后，必须能通过托盘菜单恢复交互，避免用户失去控制入口。

### 9.3 Herdr

- 自动发现 Herdr。
- 当前连接状态。
- 当前 Socket 路径和 Session。
- 当前 Agent 数量。
- 最近连接错误。
- 手动重新连接。
- 是否监听全部命名 Session。
- 开发模式下显示最近状态事件。

### 9.4 事件映射

每种业务事件可配置：

- 是否启用。
- 动画。
- 声音。
- 气泡模板。
- 持续时间。
- 冷却时间。
- Agent 和 Workspace 过滤。

## 10. 托盘菜单

```text
显示/隐藏宠物
打开设置
暂停动画
鼠标穿透 [开/关]
始终置顶 [开/关]
重新连接 Herdr
----------------
退出
```

关闭设置窗口只隐藏设置，不退出应用。退出必须通过托盘菜单或显式退出动作完成。

## 11. 活动窗口附着

首版只实现自由拖动的置顶窗口。

后续可增加：

- 贴在活动窗口右上角。
- 贴在标题栏侧边。
- 活动窗口移动和缩放时跟随。
- 活动窗口最小化时隐藏。
- 全屏窗口时自动隐藏。

平台实现：

| 平台 | 可能方案 | 注意事项 |
| --- | --- | --- |
| Windows | WinEvent Hook + Win32 Window Rect | 处理 DPI 和窗口边界 |
| macOS | NSWorkspace + 平台窗口 API | 后续独立评估 |
| Linux X11 | EWMH / X11 属性 | 不同窗口管理器行为存在差异 |
| Linux Wayland | Compositor-specific protocol | 通常无法可靠访问全局窗口位置 |

该功能必须封装在 `WindowTracker` trait 后，不能渗透到 Herdr 和动画模块。

## 12. 跨平台策略

### 12.1 首发优先级

建议顺序：

1. macOS。
2. Windows。
3. Linux X11。
4. Linux Wayland 尽力支持。

最终顺序可根据实际目标用户平台调整。

### 12.2 Wayland 限制

- 全局绝对窗口位置通常不可用。
- `always-on-top` 可能被 Compositor 忽略。
- 主动设置窗口位置可能不被支持。
- 活动窗口追踪通常不可用。

在 Wayland 环境中降级为：

- 允许用户拖动定位。
- 依靠桌面环境支持的窗口规则。
- 设置页明确展示当前平台能力。
- 不宣称活动窗口附着可用。

## 13. 配置模型

```json
{
  "schemaVersion": 1,
  "general": {
    "launchAtStartup": false,
    "startHidden": false
  },
  "overlay": {
    "alwaysOnTop": true,
    "clickThrough": false,
    "locked": false,
    "scale": 1.0,
    "opacity": 1.0,
    "fps": 60,
    "positions": {}
  },
  "herdr": {
    "autoDiscover": true,
    "session": null,
    "socketPath": null,
    "watchAllSessions": false
  },
  "avatar": {
    "activePackId": "herdr-sheep-default",
    "animationSpeed": 1.0
  },
  "events": {
    "turnCompleted": {
      "enabled": true,
      "animation": "celebrate",
      "sound": "done",
      "bubble": "{agent} 完成了工作",
      "durationMs": 2200,
      "cooldownMs": 1000
    }
  }
}
```

配置写入必须使用临时文件加原子替换，避免崩溃后产生半个 JSON。每次 Schema 变更提供向前迁移函数。

## 14. 前端工程结构

```text
src/
├── main.tsx
├── shared/
│   ├── types.ts
│   ├── tauri.ts
│   └── events.ts
├── overlay/
│   ├── OverlayApp.tsx
│   ├── PetStage.tsx
│   ├── SpeechBubble.tsx
│   ├── drag.ts
│   └── renderers/
│       ├── types.ts
│       ├── svg-renderer.ts
│       └── sprite-renderer.ts
├── settings/
│   ├── SettingsApp.tsx
│   ├── AppearanceSettings.tsx
│   ├── PositionSettings.tsx
│   ├── HerdrSettings.tsx
│   └── EventSettings.tsx
└── styles/
    ├── global.css
    ├── overlay.css
    └── settings.css
```

通过 URL 路径或 Tauri Window Label 决定挂载 `OverlayApp` 或 `SettingsApp`。

## 15. Tauri 前后端接口

### 15.1 Commands

```text
get_app_config
get_default_app_config
update_app_config
get_connection_status
reconnect_herdr
list_agents
get_aggregate_state
report_avatar_runtime_error
complete_runtime_self_test
reset_overlay_position
open_settings
inspect_avatar_project
install_avatar_project
list_avatar_installations
get_avatar_project
get_active_avatar_project
select_avatar
remove_avatar_installation
get_diagnostics
export_diagnostics
```

### 15.2 Rust 发往前端的 Events

```text
herdr://connection-changed
herdr://agents-changed
pet://intent
pet://aggregate-state
config://changed
avatar://changed
```

`pet://intent` 示例：

```json
{
  "id": "evt-123",
  "kind": "turn_completed",
  "animation": "celebrate",
  "priority": 70,
  "durationMs": 2200,
  "bubble": "Codex 完成了工作",
  "count": 1
}
```

前端播放完成后回调 Rust 或发送 `pet://intent-finished`，Rust 再选择队列下一项或持续状态。

## 16. 错误处理与可观测性

- 日志默认写入 Tauri 应用日志目录。
- 用户设置页只展示经过整理的错误，不展示大段底层堆栈。
- Debug 模式记录原始 Herdr 事件，但不得记录敏感终端内容。
- 默认不读取 Pane 输出，除非未来某项功能明确需要且用户开启。
- 默认不上传遥测。
- 崩溃或动画资源错误不能终止 Herdr 监听任务。
- 角色包加载失败时自动回退到内置默认角色。

日志领域：

```text
app
herdr.discovery
herdr.transport
herdr.subscription
agent.transition
pet.rules
pet.animation
avatar.import
platform.window
```

## 17. 测试策略

### 17.1 Rust 单元测试

- Herdr JSON 消息解析。
- Snapshot 到缓存的转换。
- 状态迁移识别。
- `working -> idle/done` 完成事件。
- 相同状态事件去重。
- 多 Agent 聚合优先级。
- 动画队列和冷却。
- 规则过滤和模板渲染。
- 配置迁移。
- ZIP 路径穿越和角色包安全校验。

### 17.2 Rust 集成测试

实现一个假的 Herdr Socket Server，验证：

- 连接和 Snapshot。
- 订阅确认与事件推送。
- 断线重连。
- 重连后缓存替换。
- 未知字段兼容。
- 错误协议处理。
- 多 Session 独立状态。

测试不依赖用户机器上真实 Herdr。

### 17.3 前端测试

- 动画 Intent 到动画名称映射。
- 瞬时动画结束后回到最新持续状态。
- Sprite 帧序列。
- SVG 动画目标元素缺失时安全失败。
- 设置表单校验。
- 气泡模板显示。
- 合并事件计数显示。

### 17.4 端到端测试

- 启动应用后出现透明宠物窗口。
- 设置窗口可以从托盘打开和关闭。
- 假 Herdr 发出 `working -> done` 后播放完成动画。
- 鼠标穿透后可以通过托盘恢复。
- 重启应用后恢复宠物位置和配置。
- 导入合法角色包并切换成功。
- 导入恶意或损坏角色包被拒绝。

### 17.5 真实 Herdr 验证

- 使用 `herdr integration status` 检查集成。
- 启动 Codex、Claude 和至少一种生命周期 Hook Agent。
- 确认前台完成产生 `idle`，后台完成产生 `done`。
- 确认 `blocked` 显示需要关注动画。
- 确认读取或聚焦 Pane 不会错误重复播放完成动画。
- 确认 Herdr 重启或 handoff 后自动恢复连接。

## 18. 性能与资源目标

首版目标值需要在实现后基准验证：

- 空闲状态 CPU 接近零或保持极低水平。
- Working 动画以 60 FPS 为上限，不忙等。
- 默认角色包解压后不超过预设安全限制。
- Herdr 每次事件处理不执行同步文件 I/O。
- 设置窗口关闭后释放其前端资源。
- 不为每个 Agent 创建独立窗口或动画实例。

## 19. 开发阶段

### Phase 0：工程和协议验证

任务：

- 初始化 Tauri 2 + React + TypeScript + Vite。
- 建立 Rust/前端共享领域名称。
- 创建透明 `pet-overlay` 和普通 `settings` 窗口。
- 建立托盘和退出行为。
- 用最简单 SVG 方块验证透明、置顶、拖动和鼠标穿透。
- 使用真实 Herdr 导出并保存一份开发期 Schema。
- 写最小 Socket 原型完成 ping、Snapshot 和订阅。

验收：

- 两个窗口行为正确。
- 设置窗口关闭后宠物仍运行。
- Rust 日志能输出实时 `pane.agent_status_changed`。

### Phase 1：核心 MVP

任务：

- 完成 Socket 发现、连接、Snapshot、订阅和重连。
- 实现 Agent Cache 和 Transition Detector。
- 实现 `working -> idle/done` 完成判断。
- 实现聚合持续状态。
- 实现默认 SVG 宠物。
- 实现五种动画：`idle`、`working`、`complete`、`blocked`、`offline`。
- 设置页实现大小、位置、置顶、鼠标穿透和事件开关。
- 保存配置。

验收：

- 任意 Herdr Agent 开始工作时切换到 Working。
- 前台或后台 Agent 完成时只播放一次完成动画。
- Blocked 事件能抢占低优先级状态。
- Herdr 断线和恢复有明确反馈。
- 重启应用后恢复配置和位置。

### Phase 2：多 Agent 和产品化

任务：

- 完成多 Agent 聚合和事件合并。
- 增加气泡、声音和冷却配置。
- 增加 Agent/Workspace 过滤。
- 增加多显示器位置存储。
- 增加开机启动。
- 增加托盘快速控制。
- 完善错误页和连接诊断。
- 进行 Windows、macOS、Linux X11 手工验证。

验收：

- 多个 Agent 同时完成不会刷屏。
- 用户能看出当前是工作、完成还是需要关注。
- 透明窗口在目标平台无明显黑底、白边或焦点问题。

### Phase 3：宠物包

任务：

- 已完成：固定并直接集成官方 Avatar Lab 源码、导出器和浏览器运行时。
- 已完成：将内置角色迁移为官方 Strobi。
- 固定已测试的 Avatar Studio JSON v2 / Avatar Data v1 导入版本。
- 实现安全 JSON 导入、校验、头像选择、安装和删除。
- 设置页增加预览和动画测试。
- 制作至少两个示例角色包。

详细执行顺序见 `plans/next-development-roadmap.md`。

验收：

- 合法角色包跨平台表现一致。
- 非法 JSON、超大工程和超限时间线被拒绝。
- 角色包缺少可选动画时能回退到默认状态。

### Phase 4：活动窗口跟随（可选）

任务：

- 定义 `WindowTracker` trait。
- 优先实现一个目标平台。
- 实现窗口边缘锚定和偏移。
- 增加能力探测和明确降级。
- 在不支持的平台安全降级。

验收：

- 支持平台上窗口移动时宠物平滑跟随。
- 不支持时不会影响自由拖动模式。

### Phase 5：高级动画（可选）

根据实际需求评估：

- Rive。
- Lottie。
- Canvas/WebGL。
- wgpu/Vello 原生渲染 sidecar。
- 骨骼和物理系统。

只有 SVG/Sprite 明确成为产品瓶颈后才进入本阶段。

## 20. 三平台可执行文件计划

### 20.1 构建产物

- macOS：当前只构建 Apple Silicon 与 Intel Release 可执行文件。
- Windows：当前只构建 x86_64 Release EXE。
- Linux：当前只构建 x86_64 Release 可执行文件。

### 20.2 构建前检查

- Tauri CSP 和权限最小化。
- Rust Commands 仅暴露必要接口。
- 角色包不允许执行代码。
- 配置和日志不包含 Herdr Pane 内容。
- Herdr 未安装或未运行时应用仍可正常启动。

## 21. 风险清单

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| Herdr 状态不是精确 Turn ID | 可能无法区分特殊工作流中的每一轮 | 以状态迁移作为 MVP 定义，未来增加可选 Hook Adapter |
| 前台完成是 `idle` 而非 `done` | 只监听 done 会漏事件 | 统一判断 `working -> idle/done` |
| 状态事件也可能由展示字段变化触发 | 重复动画 | 本地比较前后状态并去重 |
| Herdr 重启导致订阅断开 | 丢失实时反馈 | 自动重连、重新 Snapshot，不补播历史动画 |
| 多 Agent 高频结束 | 动画刷屏 | 合并窗口、冷却和有限队列 |
| Wayland 限制窗口定位与置顶 | Linux 体验不一致 | 能力探测、明确降级、优先 X11 验证 |
| 系统 WebView 差异 | SVG/CSS 表现不同 | 限制动画特性，建立跨平台视觉测试 |
| 鼠标穿透后无法操作 | 用户失去入口 | 托盘永远可恢复，提供快捷键或安全模式 |
| 第三方宠物包恶意内容 | 本地安全风险 | 声明式格式、SVG 清洗、ZIP 限制、禁止 JS |
| 长期动画资源占用高 | 常驻体验差 | 低频空闲动画、FPS 上限、后台节流和性能基准 |

## 22. 关键决策记录

### ADR-001：使用 Tauri 2，而不是 Electron

状态：已决定。

原因：Rust 与 Herdr 对接自然、常驻资源更可控、设置页规模小、系统 WebView 足够支持首版动画。

### ADR-002：桌宠只消费 Herdr 统一状态

状态：已决定。

原因：避免为每个 Agent 重复实现 Hook，保持 Herdr 为状态权威。

### ADR-003：Turn 完成由状态迁移推导

状态：已决定。

规则：`working -> idle/done`。

原因：Herdr 当前不跟踪独立 Turn ID，`done` 又只代表未看见的后台完成。

### ADR-004：首版采用 Bible Strong Avatar Lab 格式

状态：已决定。

原因：该格式已经提供程序化几何、expression、动画时间线、眨眼、播放模式、React/JavaScript 导出和 Studio JSON 交换格式；避免另造一套角色编辑器与动画 Schema。动态导入只接受 JSON，不执行导出的任意 JavaScript。

### ADR-005：首版不做活动窗口跟随

状态：已决定。

原因：平台差异尤其是 Wayland 限制会显著扩大 MVP 范围。

## 23. MVP 完成定义

满足以下全部条件才视为 MVP 完成：

- Tauri 应用可以在目标首发平台安装和启动。
- 宠物窗口透明、无边框、置顶、可拖动。
- 托盘可以打开设置、隐藏宠物和退出。
- 应用能自动连接默认 Herdr Session。
- 应用能通过 Snapshot 初始化当前 Agent 状态。
- 应用能持续订阅 Agent 状态变化。
- `working -> idle` 和 `working -> done` 都只触发一次完成动画。
- `blocked` 能触发需要关注动画。
- 多 Agent 状态能正确聚合。
- Herdr 断线后应用不崩溃且能自动重连。
- 用户配置和窗口位置可持久化。
- 内置默认角色包含全部必需动画。
- 核心状态迁移、聚合、重连和规则引擎有自动化测试。
- 鼠标穿透始终可以通过托盘关闭。

## 24. 第一批实施任务

建议按以下顺序开始：

1. 初始化 Tauri 2 + React + TypeScript 工程。
2. 创建 `pet-overlay`、`settings` 和系统托盘。
3. 验证三个目标平台的透明、置顶和鼠标穿透能力。
4. 使用 `herdr api schema --json` 固化开发期协议夹具。
5. 实现 Herdr 默认 Socket 发现和 `ping`。
6. 实现 `session.snapshot` 和 Agent Cache。
7. 实现 `events.subscribe` 和重连。
8. 实现 Transition Detector 及单元测试。
9. 制作内置 SVG 羊角色与五个核心动画。
10. 打通完成事件到动画播放的端到端链路。
11. 实现最小设置页面与配置持久化。
12. 使用真实 Codex、Claude 和 OpenCode/Pi 验证状态语义。

完成上述任务后，再决定是优先投入宠物包系统、多平台发布，还是活动窗口跟随。
