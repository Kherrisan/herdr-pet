# Bible Strong Avatar Lab 格式兼容方案

更新日期：2026-08-14

## 1. 决策

Herdr Pet 的首版宠物动画采用 Bible Strong Avatar Lab 的程序化头像模型，不再设计独立的 `.herdrpet` 动画格式。

- 用户创作/交换格式：Avatar Studio Project JSON `version: 2`。
- 应用内部播放格式：Avatar Data `version: 1`。
- 渲染方式：程序化几何生成 SVG path，按 expression 时间线插值。
- Herdr 事件映射保存在 Herdr Pet 配置中，不侵入 Avatar Lab 工程文件。

当前已经移除 `SheepAvatar.tsx` 临时实现，直接集成官方导出器和浏览器运行时。内置角色使用官方 Studio Project v2 中的 Strobi，并在启动时生成 Avatar Data v1。

## 2. 已验证的官方导出

Avatar Lab 当前提供四类产物：

1. React 本地 ZIP：`avatar-runtime.ts`、`<name>.avatar.ts`、React 组件和 index。
2. JavaScript/HTML ZIP：`avatar.js` 和演示 `index.html`。
3. Photo Mode：静态 SVG 或 PNG，只是当前帧，不包含可播放动画。
4. Studio Project：完整 JSON 工程，可在浏览器间导入/导出。

因此本项目所说的“采用 Avatar Lab 格式”不是采用 GIF、Lottie 或 Sprite Sheet，而是采用其程序化数据模型和动画时间线。

## 3. 两层数据模型

### 3.1 Studio Project JSON v2

顶层结构：

```ts
interface AvatarStudioProjectV2 {
  version: 2;
  library: {
    activeAvatarId: string;
    avatars: StudioAvatar[];
  };
  expressions: Expression[];
  sequences: AnimationSequence[];
  playback: {
    stateId: string | null;
    playing: boolean;
  };
}
```

Avatar 拥有：

- `id`、`name`；
- `body.primary` 主几何体和 `body.nodes` 附加几何体；
- `colors.body`、`colors.eyes`；
- 中性眼睛尺寸、间距、位置和旋转参数；
- 可选的 avatar-specific behavior library（官方实现采用 copy-on-write）。

Studio v2 用于导入，因为它是纯 JSON、包含完整编辑信息，也最适合安全校验和未来重新编辑。

### 3.2 Avatar Data v1

选择一个 avatar 和一组动画后，规范化为：

```ts
interface AvatarDataV1 {
  version: 1;
  avatar: {
    name: string;
    surface: Surface;
    bodyNodes: BodyNode[];
    colors: { body: string; eyes: string };
  };
  expressions: Record<string, Expression>;
  animations: Record<string, {
    name: string;
    description: string;
    playbackMode: "loop" | "once" | "pingPong";
    blink: {
      enabled: boolean;
      initialDelayMs: number;
      minIntervalMs: number;
      maxIntervalMs: number;
      durationMs: number;
    };
    steps: Array<{
      expressionId: string;
      holdMs: number;
      transitionMs: number;
      transition: "spring" | "smooth" | "snappy";
    }>;
  }>;
}
```

只保留所选动画引用到的 expressions。自定义动画 key 由名称 slug 化，冲突时追加序号。

## 4. Renderer 边界

```ts
interface AvatarLabController {
  play(animation?: string): AvatarLabController;
  pause(): AvatarLabController;
  stop(): AvatarLabController;
  destroy(): void;
}
```

`AvatarLabRenderer` 负责：

- 挂载一个 SVG 场景；
- 根据 surface/body nodes 生成几何路径；
- expression 之间按 transition 插值；
- 执行 hold、loop/once/pingPong 和自动眨眼；
- 在 once 动画结束时通知现有动画调度器；
- 遵循 `prefers-reduced-motion` 和应用内动画速度配置。

现有 Herdr 状态聚合器只产生 Animation Intent，不了解 Avatar Lab 的 expression 或 SVG 实现。

## 5. Herdr 事件映射

默认建议映射：

| Herdr Intent | Avatar Lab animation |
| --- | --- |
| `sleeping` | `sleeping` |
| `idle` | `idle` |
| `working` | `working` |
| `needs_attention` | `alerting`，不存在则 `notifying` |
| `offline` | `powering-down` |
| `turn_completed` | `celebrate` |
| `greeting` | `waking` |
| `goodbye` | `powering-down` |

设置页必须以导入数据的实际 animation key 生成下拉选项，允许逐项自定义。持续状态使用循环动画；瞬时事件优先选择 `once`，结束后重新计算最新持续状态。

## 6. 导入与安全

- 动态导入只接受 Studio JSON v2，不接受或执行导出的 `avatar.js`、TSX、HTML。
- JSON 解析后按白名单字段重建对象，不直接信任原对象原型。
- 限制文件大小、数组长度、字符串长度、动画总时长和数值范围。
- 验证 expression 引用完整性；空动画、悬空引用和非法 playback mode 给出可定位错误。
- 保存原始工程和规范化 Avatar Data，记录 importer 版本，便于以后迁移。
- 设置页导入前显示头像数量、动画数量、预览和将被采用的默认映射。

## 7. 许可证边界

官方仓库使用 GNU AGPL v3.0。项目已选择直接集成官方实现：

- 官方源码固定在 `third-party/avatar-lab/`，保留其完整 LICENSE 和 Git 历史来源；
- 集成版本记录在 `THIRD_PARTY_NOTICES.md`；
- 发布 Herdr Pet 时必须满足 GNU AGPL v3.0 对对应源码、版权和许可证声明的要求。

## 8. 实施顺序

1. 已完成：固定官方源码、生成 Avatar Data v1、加载官方运行时并接入现有动画调度器。
2. 已完成：把硬编码羊迁移为官方 Strobi，并在设置页使用相同预览组件。
3. 下一步：在 `src/avatar-lab/schema.ts` 增加外部 Studio Project v2 的运行时校验器。
4. 下一步：实现 JSON 导入、头像选择、事件映射和逐个动画试听。
5. 下一步：做 Linux/macOS/Windows WebView 视觉回归与性能测试。

## 9. 版本策略

官方 README 明确说明当前项目格式仍是 pre-release，并且只保证当前 Schema。Herdr Pet 因此采用显式兼容矩阵：

- 当前接受：Studio Project `version: 2`、Avatar Data `version: 1`；
- 未知顶层版本默认拒绝，不静默猜测；
- 每次升级以官方 fixture、导出包快照和迁移测试为准。
