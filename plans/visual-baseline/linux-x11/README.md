# Linux X11 视觉基线

更新日期：2026-08-15

这些图片由 Release 版 Herdr Pet 在 Xvfb + Openbox + WebKitGTK 软件渲染环境中生成，输入来自稳定的假 Herdr Socket。动画在截图时暂停，因此 Sleeping、Idle、Working、Needs attention、Offline 和 Celebrate 都能得到可人工比较的固定画面。

运行：

```bash
npm run tauri build -- --no-bundle
npm run visual:capture:linux
```

脚本会校验 Overlay 为 `320x320`、设置页为可见窗口，并拒绝颜色数过低的空白截图。每个场景还直接读取 X11 `_NET_WM_STATE_ABOVE`，确认窗口管理器已将 Overlay 标记为置顶。设置页截图前会临时最小化宠物，以免遮住表单；随后实际发送配置中的 `Alt+Shift+F12`，确认全局快捷键能够隐藏并恢复宠物。假 Herdr 使用稳定相对 Socket 名称，避免随机临时路径污染基线。

`contact-sheet.png` 是六种 Overlay 状态的人工检查总览，`manifest.json` 记录本次基线的尺寸、颜色数和 SHA-256。哈希用于标识已审核资产，不直接作为跨机器像素相等断言；WebKitGTK、字体和软件光栅器版本变化都可能造成合理的像素差异。

## 边界

- 该基线证明真实 Tauri/WebKit 页面能够加载官方 Avatar Lab 浏览器运行时并渲染各状态。
- Xvfb 没有桌面合成器，所以透明区域显示为黑色；X11 置顶标记已经自动验证，但透明、阴影和与其他真实应用之间的层级手感仍需在 Linux GPU 桌面目测。
- Windows WebView2 和 macOS WKWebView 必须各自生成并人工审核平台基线，不能复用这组图片作为验收结果。
