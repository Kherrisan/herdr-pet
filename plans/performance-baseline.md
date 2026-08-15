# Herdr Pet 性能基线

更新日期：2026-08-15

## 测量口径

使用 `npm run perf:smoke -- --build` 启动隔离 X11/Xvfb 会话和稳定假 Herdr。夹具支持：

- `HERDR_PET_PERF_SCENARIO=sleeping`：已连接、没有 Agent。
- `HERDR_PET_PERF_SCENARIO=idle`：一个 Idle Agent。
- `HERDR_PET_PERF_SCENARIO=working`：一个 Working Agent。

CPU 使用 `/proc/<pid>/stat` 的时间片差值计算，不采用包含启动阶段的 `ps %cpu` 累计值。RSS 和 CPU 必须统计 Tauri 主进程及全部 WebKit 子进程；只测主进程不能作为发布预算证据。

## 已实施优化

- 官方浏览器运行时现在对 transition、blink 和 ambient rendering 全部执行 FPS 上限。
- 新安装默认活动帧率由 60 调整为 30 FPS，用户仍可选择 60 FPS。
- Sleeping 使用 5 FPS；Idle/Offline 使用 8 FPS；Working、Needs attention 和瞬时事件继续使用用户配置的 30/60 FPS。
- 设置窗口改为首次打开时才创建 WebView，不再在应用启动时后台运行完整 React/Avatar 实例。
- Overlay 隐藏时由现有 visibility bridge 暂停 Controller，显示后按当前事实恢复。

## Linux Xvfb 结果

在按需创建设置窗口之前，Sleeping 进程树包含 4 个进程，峰值 RSS 约 756164 KiB。改为按需创建后：

| 场景 | 时间 | 进程数 | 平均 CPU | 峰值 RSS |
| --- | ---: | ---: | ---: | ---: |
| Sleeping | 30 s | 3 | 13.15% | 538312 KiB |

按需创建设置窗口使该样本的进程数减少 1，峰值 RSS 下降约 29%。剩余 CPU 主要来自 Xvfb 下的 `WebKitWebProcess` 软件合成；该完整进程树样本仍未达到 Release 空闲 `<1%` 预算。

只测 Tauri 父进程时曾得到 Sleeping 0.90%、Idle 0.92%、Working 2.16%，但这种口径遗漏 WebKit 子进程，已明确废弃，不能用于宣称预算通过。

## 后续验收

- 在真实 GPU 的 Linux X11 桌面按相同进程树口径重测 Sleeping、Idle、Working。
- 分别记录 Windows WebView2 和 macOS WKWebView 的完整应用进程树基线。
- 八小时长稳暂不属于当前版本门禁；后续需要长期运行证据时，再记录每分钟 RSS，并以回归斜率而非首尾两个采样点判断持续增长。
- 隐藏 Overlay 前后使用同一场景和采样窗口比较 CPU，要求有显著下降。

可选长稳入口为 `npm run perf:soak`，默认运行 8 小时，先预热 60 秒，再每 60 秒记录完整进程树 RSS，并在结束时输出峰值和线性回归斜率。默认参考线为回归斜率不超过 2048 KiB/小时，可用 `HERDR_PET_SOAK_MAX_SLOPE_KIB_PER_HOUR` 覆盖。它当前不阻塞发布；`HERDR_PET_SOAK_SECONDS`、`HERDR_PET_SOAK_INTERVAL_SECONDS` 与 `HERDR_PET_SOAK_WARMUP_SECONDS` 可用于短时夹具自检。
