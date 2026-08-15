import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../shared/tauri";
import type { AggregateState, AgentInfo, AppConfig, ConnectionStatus, DiagnosticReport } from "../shared/types";
import { AvatarLabPet } from "../avatar-lab/AvatarLabPet";
import { useActiveAvatar } from "../avatar-lab/useActiveAvatar";
import { animationForAggregate } from "../overlay/animation";
import { AvatarSettings } from "./AvatarSettings";
import { translate, type AppLanguage } from "./i18n";
import "../styles/settings.css";

type SettingsTab = "general" | "avatar" | "events" | "diagnostics";

export function SettingsApp() {
  const [config, setConfig] = useState<AppConfig>();
  const [status, setStatus] = useState<ConnectionStatus>();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [previewAnimation, setPreviewAnimation] = useState<string>();
  const [previewKey, setPreviewKey] = useState(0);
  const [previewPlayback, setPreviewPlayback] = useState<"playing" | "paused" | "stopped">("playing");
  const [previewLoop, setPreviewLoop] = useState(true);
  const [simulatedState, setSimulatedState] = useState<AggregateState>();
  const previewTimer = useRef<number | undefined>(undefined);
  const [diagnostics, setDiagnostics] = useState<DiagnosticReport>();
  const [diagnosticExport, setDiagnosticExport] = useState<string>();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const activeAvatar = useActiveAvatar(config?.avatar);
  const language = config?.language ?? "zh-CN";
  const t = (text: string) => translate(language, text);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    void Promise.all([api.getConfig(), api.getConnectionStatus(), api.listAgents()]).then(
      ([nextConfig, nextStatus, nextAgents]) => {
        setConfig(nextConfig);
        setStatus(nextStatus);
        setAgents(nextAgents);
      },
    );
    void api.getDiagnostics().then(setDiagnostics);
    const unlisteners = Promise.all([
      listen<ConnectionStatus>("herdr://connection-changed", ({ payload }) => {
        setStatus(payload);
        void api.getDiagnostics().then(setDiagnostics);
      }),
      listen<AgentInfo[]>("herdr://agents-changed", ({ payload }) => {
        setAgents(payload);
        void api.getDiagnostics().then(setDiagnostics);
      }),
      listen<AppConfig>("config://changed", ({ payload }) => setConfig(payload)),
    ]);
    return () => {
      void unlisteners.then((items) => items.forEach((unlisten) => unlisten()));
      if (previewTimer.current) window.clearTimeout(previewTimer.current);
    };
  }, []);

  const actualPreviewState = useMemo(() => {
    if (agents.some((agent) => agent.state === "blocked")) return "needs_attention" as const;
    if (agents.some((agent) => agent.state === "working")) return "working" as const;
    return status?.state === "connected" ? (agents.length ? "idle" : "sleeping") : "offline";
  }, [agents, status]);
  const previewState = simulatedState ?? actualPreviewState;

  async function save(next: AppConfig) {
    setSaveError(undefined);
    setSaving(true);
    try {
      const saved = await api.updateConfig(next);
      setConfig(saved);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setSaveError(message);
      try {
        setConfig(await api.getConfig());
      } catch (reloadCause) {
        const reloadMessage = reloadCause instanceof Error ? reloadCause.message : String(reloadCause);
        setSaveError(language === "en"
          ? `${message}; reloading the saved configuration also failed: ${reloadMessage}`
          : `${message}；重新读取已保存配置也失败：${reloadMessage}`);
      }
    } finally {
      setSaving(false);
    }
  }

  function preview(animation: string, durationMs?: number) {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    setSimulatedState(undefined);
    setPreviewAnimation(animation);
    setPreviewPlayback("playing");
    setPreviewKey((current) => current + 1);
    if (durationMs) {
      previewTimer.current = window.setTimeout(() => {
        previewTimer.current = undefined;
        setPreviewAnimation(undefined);
      }, durationMs);
    }
  }

  if (!config) return <main className="settings-shell">{t("正在加载设置…")}</main>;

  return (
    <main className="settings-shell">
      <header className="settings-header">
        <div>
          <p className="eyebrow">HERDR PET</p>
          <h1>{t("桌面伙伴设置")}</h1>
          <p>{t("让每个 Agent 的状态变化都能被看见。")}</p>
          <label className="language-picker">
            <span>{t("语言")}</span>
            <select
              value={config.language}
              onChange={(event) => void save({ ...config, language: event.target.value as AppLanguage })}
            >
              <option value="zh-CN">中文</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <div className="preview-card">
          <AvatarLabPet
            state={previewState}
            animation={previewAnimation ?? animationForAggregate(previewState, config.avatar)}
            payload={activeAvatar.project.payload}
            playbackKey={previewKey}
            animationSpeed={config.avatar.animationSpeed}
            fps={config.overlay.fps}
            playback={previewPlayback}
            loop={previewLoop}
            pauseWhenHidden={false}
            onAnimationEnd={() => {
              if (!previewLoop) setPreviewAnimation(undefined);
            }}
            onRuntimeError={(error) => void api.reportAvatarRuntimeError(error ?? null)}
          />
        </div>
      </header>

      <nav className="settings-tabs" role="tablist" aria-label={t("设置分类")}>
        {([
          ["general", t("常规")],
          ["avatar", t("角色")],
          ["events", t("事件")],
          ["diagnostics", t("诊断")],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? "is-active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "general" && (
        <div className="settings-tab-panel" role="tabpanel">

      <section className="settings-card preview-controls">
        <div className="section-title">
          <h2>{t("动画预览与模拟")}</h2>
          <label className="inline-check">
            <input type="checkbox" checked={previewLoop} onChange={(event) => setPreviewLoop(event.target.checked)} />
            {t("循环")}
          </label>
        </div>
        <div className="button-row">
          <button className="secondary-button" onClick={() => {
            setPreviewPlayback("playing");
            setPreviewKey((current) => current + 1);
          }}>{t("播放/重播")}</button>
          <button className="secondary-button" onClick={() => setPreviewPlayback("paused")}>{t("暂停")}</button>
          <button className="secondary-button" onClick={() => setPreviewPlayback("stopped")}>{t("停止")}</button>
        </div>
        <p className="preview-status" aria-live="polite">
          {previewPlayback === "paused"
            ? t("预览已暂停")
            : previewPlayback === "stopped"
              ? t("预览已停止")
              : `${t("正在预览")}: ${previewAnimation ?? animationForAggregate(previewState, config.avatar)}`}
        </p>
        <div className="button-row simulation-buttons">
          <button className="secondary-button" onClick={() => preview(config.events.agentStarted.animation, config.events.agentStarted.durationMs)}>{t("开始工作")}</button>
          <button className="secondary-button" onClick={() => preview(config.events.turnCompleted.animation, config.events.turnCompleted.durationMs)}>{t("Turn 完成")}</button>
          <button className="secondary-button" onClick={() => preview(config.events.attentionRequested.animation, config.events.attentionRequested.durationMs)}>{t("请求关注")}</button>
          <button className="secondary-button" onClick={() => { setPreviewAnimation(undefined); setSimulatedState("offline"); }}>{t("离线")}</button>
          <button className="secondary-button" onClick={() => { setSimulatedState(undefined); preview(config.events.reconnected.animation, config.events.reconnected.durationMs); }}>{t("恢复连接")}</button>
          <button className="secondary-button" onClick={() => { setSimulatedState(undefined); setPreviewAnimation(undefined); }}>{t("恢复实时状态")}</button>
        </div>
      </section>

      <section className="settings-card">
        <div className="section-title">
          <h2>{t("Herdr 连接")}</h2>
          <span className={`status-pill status-pill--${status?.state ?? "disconnected"}`}>
            {status?.state === "connected" ? t("已连接") : status?.state === "connecting" ? t("连接中") : t("未连接")}
          </span>
        </div>
        <dl className="connection-grid">
          <div><dt>Socket</dt><dd>{status?.socketPath ?? t("自动发现")}</dd></div>
          <div><dt>{t("版本")}</dt><dd>{status?.version ?? "—"}</dd></div>
          <div><dt>Agent</dt><dd>{status?.agentCount ?? 0}</dd></div>
        </dl>
        {diagnostics && !diagnostics.globalShortcutAvailable && (
          <p className="field-hint">{t("当前为纯 Wayland 会话，全局快捷键不可用；请使用托盘恢复宠物。")}</p>
        )}
        {diagnostics && !diagnostics.absolutePositionAvailable && (
          <p className="field-hint">{t("当前显示协议不支持绝对窗口坐标；位置保存、复位和边缘吸附已停用。")}</p>
        )}
        {status?.lastError && <p className="error-message">{status.lastError}</p>}
        <button className="secondary-button" onClick={() => void api.reconnect()}>{t("重新连接")}</button>
        {(diagnostics?.platform === "windows" || config.herdr.wsl.enabled) && (
          <WslConnectionSettings config={config} save={save} language={language} />
        )}
        <ObservationSettings config={config} agents={agents} save={save} language={language} />
      </section>

        </div>
      )}

      {activeTab === "avatar" && (
        <div className="settings-tab-panel" role="tabpanel">
          <AvatarSettings
            config={config}
            activeAvatar={activeAvatar}
            save={save}
            onConfig={setConfig}
            onPreview={preview}
            language={language}
          />
        </div>
      )}

      {activeTab === "general" && (
        <div className="settings-tab-panel" role="tabpanel">
      <section className="settings-card">
        <h2>{t("外观与交互")}</h2>
        <Toggle
          label={t("开机自动启动")}
          checked={config.desktop.autoStart}
          onChange={(autoStart) => void save({
            ...config,
            desktop: { ...config.desktop, autoStart },
          })}
        />
        <Toggle
          label={t("暂停动画")}
          checked={config.desktop.paused}
          onChange={(paused) => void save({
            ...config,
            desktop: { ...config.desktop, paused },
          })}
        />
        <label className="field-row">
          <span>{t("显示/隐藏快捷键")}</span>
          <input
            key={config.desktop.toggleShortcut}
            type="text"
            defaultValue={config.desktop.toggleShortcut}
            maxLength={64}
            spellCheck={false}
            onBlur={(event) => {
              const toggleShortcut = event.currentTarget.value.trim();
              if (toggleShortcut && toggleShortcut !== config.desktop.toggleShortcut) {
                void save({
                  ...config,
                  desktop: { ...config.desktop, toggleShortcut },
                });
              } else {
                event.currentTarget.value = config.desktop.toggleShortcut;
              }
            }}
          />
        </label>
        <p className="field-hint">{t("例如：CmdOrCtrl+Shift+H。失效或被占用时会保留原快捷键。")}</p>
        {saveError && <p className="error-message">{t("保存失败")}: {saveError}</p>}
        <label className="field-row">
          <span>{t("大小")}</span>
          <input
            type="range"
            min="0.3"
            max="2"
            step="0.05"
            value={config.overlay.scale}
            onChange={(event) => void save({ ...config, overlay: { ...config.overlay, scale: Number(event.target.value) } })}
          />
          <output>{Math.round(config.overlay.scale * 100)}%</output>
        </label>
        <label className="field-row">
          <span>{t("透明度")}</span>
          <input
            type="range"
            min="0.35"
            max="1"
            step="0.05"
            value={config.overlay.opacity}
            onChange={(event) => void save({ ...config, overlay: { ...config.overlay, opacity: Number(event.target.value) } })}
          />
          <output>{Math.round(config.overlay.opacity * 100)}%</output>
        </label>
        <label className="field-row">
          <span>{t("动画速度")}</span>
          <input
            type="range"
            min="0.25"
            max="3"
            step="0.25"
            value={config.avatar.animationSpeed}
            onChange={(event) => void save({
              ...config,
              avatar: { ...config.avatar, animationSpeed: Number(event.target.value) },
            })}
          />
          <output>{config.avatar.animationSpeed.toFixed(2)}×</output>
        </label>
        <label className="field-row">
          <span>{t("活动帧率（空闲自动节流）")}</span>
          <select
            value={config.overlay.fps}
            onChange={(event) => void save({
              ...config,
              overlay: { ...config.overlay, fps: Number(event.target.value) as 30 | 60 },
            })}
          >
            <option value="30">{t("30 FPS（省电）")}</option>
            <option value="60">{t("60 FPS（流畅）")}</option>
          </select>
        </label>
        <Toggle
          label={t("始终置顶")}
          checked={config.overlay.alwaysOnTop}
          onChange={(checked) => void save({ ...config, overlay: { ...config.overlay, alwaysOnTop: checked } })}
        />
        <Toggle
          label={t("锁定位置")}
          checked={config.overlay.locked}
          onChange={(checked) => void save({ ...config, overlay: { ...config.overlay, locked: checked } })}
        />
        <Toggle
          label={t("鼠标穿透（可从托盘恢复）")}
          checked={config.overlay.clickThrough}
          onChange={(checked) => void save({ ...config, overlay: { ...config.overlay, clickThrough: checked } })}
        />
        <div className="action-row">
          <span>{t("窗口位置")}</span>
          <button className="secondary-button" onClick={() => void api.resetOverlayPosition()}>
            {t("移回主屏幕中央")}
          </button>
        </div>
      </section>
        </div>
      )}

      {activeTab === "events" && (
        <div className="settings-tab-panel" role="tabpanel">
      <section className="settings-card">
        <h2>{t("事件动画")}</h2>
        <Toggle
          label={t("事件提示音（默认关闭）")}
          checked={config.audio.enabled}
          onChange={(enabled) => void save({ ...config, audio: { ...config.audio, enabled } })}
        />
        <label className="field-row">
          <span>{t("提示音音量")}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={config.audio.volume}
            disabled={!config.audio.enabled}
            onChange={(event) => void save({
              ...config,
              audio: { ...config.audio, volume: Number(event.target.value) },
            })}
          />
          <output>{Math.round(config.audio.volume * 100)}%</output>
        </label>
        {config.audio.enabled && (
          <div className="selection-list">
            <Toggle
              label={t("Agent 检出提示音")}
              checked={config.audio.agentDetected}
              onChange={(agentDetected) => void save({
                ...config,
                audio: { ...config.audio, agentDetected },
              })}
            />
            <Toggle
              label={t("完成提示音")}
              checked={config.audio.turnCompleted}
              onChange={(turnCompleted) => void save({
                ...config,
                audio: { ...config.audio, turnCompleted },
              })}
            />
            <Toggle
              label={t("请求关注提示音")}
              checked={config.audio.attentionRequested}
              onChange={(attentionRequested) => void save({
                ...config,
                audio: { ...config.audio, attentionRequested },
              })}
            />
            <Toggle
              label={t("开始工作提示音")}
              checked={config.audio.agentStarted}
              onChange={(agentStarted) => void save({
                ...config,
                audio: { ...config.audio, agentStarted },
              })}
            />
            <Toggle
              label={t("Agent 退出提示音")}
              checked={config.audio.agentExited}
              onChange={(agentExited) => void save({
                ...config,
                audio: { ...config.audio, agentExited },
              })}
            />
            <Toggle
              label={t("Herdr 重连提示音")}
              checked={config.audio.reconnected}
              onChange={(reconnected) => void save({
                ...config,
                audio: { ...config.audio, reconnected },
              })}
            />
          </div>
        )}
        <div className="event-rule-editor">
          <strong>{t("队列与合并")}</strong>
          <label>
            <span>{t("完成合并窗口")}</span>
            <input type="number" min="100" max="10000" step="100" value={config.scheduler.completionMergeMs} onChange={(event) => void save({ ...config, scheduler: { ...config.scheduler, completionMergeMs: Number(event.target.value) } })} />
            <small>ms</small>
          </label>
          <label>
            <span>{t("事件过期时间")}</span>
            <input type="number" min="1000" max="300000" step="1000" value={config.scheduler.eventTtlMs} onChange={(event) => void save({ ...config, scheduler: { ...config.scheduler, eventTtlMs: Number(event.target.value) } })} />
            <small>ms</small>
          </label>
          <label>
            <span>{t("最大排队数")}</span>
            <input type="number" min="1" max="64" value={config.scheduler.maxQueue} onChange={(event) => void save({ ...config, scheduler: { ...config.scheduler, maxQueue: Number(event.target.value) } })} />
          </label>
        </div>
        <Toggle
          label={t("Agent 检出时反馈")}
          checked={config.events.agentDetected.enabled}
          onChange={(enabled) => void save({
            ...config,
            events: { ...config.events, agentDetected: { ...config.events.agentDetected, enabled } },
          })}
        />
        <Toggle
          label={t("Turn 完成时庆祝")}
          checked={config.events.turnCompleted.enabled}
          onChange={(enabled) => void save({
            ...config,
            events: { ...config.events, turnCompleted: { ...config.events.turnCompleted, enabled } },
          })}
        />
        <Toggle
          label={t("Agent 请求关注时提醒")}
          checked={config.events.attentionRequested.enabled}
          onChange={(enabled) => void save({
            ...config,
            events: { ...config.events, attentionRequested: { ...config.events.attentionRequested, enabled } },
          })}
        />
        <Toggle
          label={t("Agent 开始时反馈")}
          checked={config.events.agentStarted.enabled}
          onChange={(enabled) => void save({
            ...config,
            events: { ...config.events, agentStarted: { ...config.events.agentStarted, enabled } },
          })}
        />
        <Toggle
          label={t("Agent 退出时反馈")}
          checked={config.events.agentExited.enabled}
          onChange={(enabled) => void save({
            ...config,
            events: { ...config.events, agentExited: { ...config.events.agentExited, enabled } },
          })}
        />
        <Toggle
          label={t("Herdr 重连时反馈")}
          checked={config.events.reconnected.enabled}
          onChange={(enabled) => void save({
            ...config,
            events: { ...config.events, reconnected: { ...config.events.reconnected, enabled } },
          })}
        />
        <BubbleRuleEditor label={t("Agent 检出")} ruleKey="agentDetected" config={config} save={save} language={language} />
        <BubbleRuleEditor label={t("完成")} ruleKey="turnCompleted" config={config} save={save} language={language} />
        <BubbleRuleEditor label={t("请求关注")} ruleKey="attentionRequested" config={config} save={save} language={language} />
        <BubbleRuleEditor label={t("开始工作")} ruleKey="agentStarted" config={config} save={save} language={language} />
        <BubbleRuleEditor label={t("Agent 退出")} ruleKey="agentExited" config={config} save={save} language={language} />
        <BubbleRuleEditor label={t("Herdr 重连")} ruleKey="reconnected" config={config} save={save} language={language} />
      </section>
        </div>
      )}

      {activeTab === "diagnostics" && (
        <div className="settings-tab-panel" role="tabpanel">
      <section className="settings-card">
        <h2>{t("诊断")}</h2>
        <p className="section-description">{t("诊断文件不会包含 Pane 文本、Socket 实际路径或 Avatar 工程内容。")}</p>
        <dl className="connection-grid">
          <div><dt>{t("平台")}</dt><dd>{diagnostics?.platform ?? "—"}</dd></div>
          <div><dt>Herdr</dt><dd>{diagnostics?.connection.version ?? "—"}</dd></div>
          <div><dt>{t("协议")}</dt><dd>{diagnostics?.connection.protocol ?? "—"}</dd></div>
          <div><dt>Socket</dt><dd>{status?.socketPath ?? t("自动发现")}</dd></div>
          <div><dt>{t("最后事件")}</dt><dd>{diagnostics?.runtime.lastEventKind ?? "—"}</dd></div>
          <div><dt>{t("重连")}</dt><dd>{diagnostics?.runtime.reconnectCount ?? 0}</dd></div>
        </dl>
        {diagnostics?.runtime.avatarRuntimeHasError && (
          <p className="error-message">{t("Avatar 运行时报告了错误；诊断导出仅记录错误状态，不包含角色工程内容。")}</p>
        )}
        <button
          className="secondary-button"
          onClick={() => void api.exportDiagnostics().then(setDiagnosticExport)}
        >
          {t("导出脱敏诊断文件")}
        </button>
        <button
          className="secondary-button"
          onClick={() => void api.getDiagnostics().then(setDiagnostics)}
        >
          {t("刷新诊断")}
        </button>
        {diagnosticExport && <p className="field-hint">{t("已保存到")}: {diagnosticExport}</p>}
      </section>
        </div>
      )}

      <footer>{saving ? t("正在保存…") : t("设置会自动保存")}</footer>
    </main>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function WslConnectionSettings({
  config,
  save,
  language,
}: {
  config: AppConfig;
  save: (config: AppConfig) => Promise<void>;
  language: AppLanguage;
}) {
  const t = (text: string) => translate(language, text);
  const updateText = (field: "distribution" | "socketPath", value: string) => {
    const normalized = value.trim() || null;
    if (field === "distribution") {
      if (normalized === config.herdr.wsl.distribution) return;
      void save({
        ...config,
        herdr: {
          ...config.herdr,
          wsl: { ...config.herdr.wsl, distribution: normalized },
        },
      });
      return;
    }
    if (normalized === config.herdr.socketPath) return;
    void save({
      ...config,
      herdr: { ...config.herdr, socketPath: normalized },
    });
  };

  return (
    <div className="wsl-connection-settings">
      <Toggle
        label={t("WSL 模式")}
        checked={config.herdr.wsl.enabled}
        onChange={(enabled) => void save({
          ...config,
          herdr: {
            ...config.herdr,
            wsl: { ...config.herdr.wsl, enabled },
          },
        })}
      />
      {config.herdr.wsl.enabled && (
        <>
          <label className="field-row connection-field-row">
            <span>{t("WSL 发行版")}</span>
            <input
              key={config.herdr.wsl.distribution ?? "default-wsl-distribution"}
              type="text"
              defaultValue={config.herdr.wsl.distribution ?? ""}
              placeholder={t("留空使用默认发行版")}
              maxLength={128}
              spellCheck={false}
              onBlur={(event) => updateText("distribution", event.currentTarget.value)}
            />
          </label>
          <label className="field-row connection-field-row">
            <span>Linux Socket</span>
            <input
              key={config.herdr.socketPath ?? "automatic-wsl-socket"}
              type="text"
              defaultValue={config.herdr.socketPath ?? ""}
              placeholder={t("自动发现")}
              maxLength={1024}
              spellCheck={false}
              onBlur={(event) => updateText("socketPath", event.currentTarget.value)}
            />
          </label>
          <p className="field-hint">
            {t("Windows 应用会通过 wsl.exe 连接 Linux 内的 Herdr；发行版和 Socket 留空时自动使用默认值。WSL 内需提供支持 Unix Socket 的 nc（Ubuntu/Debian 可安装 netcat-openbsd）。")}
          </p>
        </>
      )}
    </div>
  );
}

function ObservationSettings({ config, agents, save, language }: {
  config: AppConfig;
  agents: AgentInfo[];
  save: (next: AppConfig) => Promise<void>;
  language: AppLanguage;
}) {
  const t = (text: string) => translate(language, text);
  const observation = config.herdr.observation;
  const workspaces = [...new Set(agents.map((agent) => agent.workspaceId))].sort();
  const update = (next: typeof observation) =>
    save({ ...config, herdr: { ...config.herdr, observation: next } });

  function toggleList(field: "workspaceIds" | "paneIds", id: string, checked: boolean) {
    const values = checked
      ? [...observation[field], id]
      : observation[field].filter((value) => value !== id);
    void update({ ...observation, [field]: values });
  }

  return (
    <div className="observation-settings">
      <label className="field-row">
        <span>{t("观察范围")}</span>
        <select
          value={observation.mode}
          onChange={(event) => void update({
            ...observation,
            mode: event.target.value as typeof observation.mode,
          })}
        >
          <option value="all">{t("所有 Agent（推荐）")}</option>
          <option value="current_workspace">{t("当前 Workspace")}</option>
          <option value="selected">{t("指定 Workspace / Agent")}</option>
          <option value="quiet">{t("安静模式")}</option>
        </select>
      </label>
      {observation.mode === "current_workspace" && (
        <label className="field-row">
          <span>Workspace</span>
          <select
            value={observation.currentWorkspaceId ?? ""}
            onChange={(event) => void update({
              ...observation,
              currentWorkspaceId: event.target.value || null,
            })}
          >
            <option value="">{t("请选择")}</option>
            {workspaces.map((workspace) => (
              <option key={workspace} value={workspace}>{workspace}</option>
            ))}
          </select>
        </label>
      )}
      {observation.mode === "selected" && (
        <div className="selection-list">
          {workspaces.map((workspace) => (
            <Toggle
              key={`workspace-${workspace}`}
              label={`Workspace：${workspace}`}
              checked={observation.workspaceIds.includes(workspace)}
              onChange={(checked) => toggleList("workspaceIds", workspace, checked)}
            />
          ))}
          {agents.map((agent) => (
            <Toggle
              key={`pane-${agent.sessionId}-${agent.paneId}`}
              label={`Agent：${agent.agent ?? agent.title ?? agent.paneId}`}
              checked={observation.paneIds.includes(agent.paneId)}
              onChange={(checked) => toggleList("paneIds", agent.paneId, checked)}
            />
          ))}
          {!agents.length && <p className="field-hint">{t("连接 Herdr 后可选择 Workspace 和 Agent。")}</p>}
        </div>
      )}
      {observation.mode === "quiet" && (
        <p className="field-hint">{t("仅显示完成、需要关注和断线；隐藏开始工作反馈。")}</p>
      )}
    </div>
  );
}

function BubbleRuleEditor({ label, ruleKey, config, save, language }: {
  label: string;
  ruleKey: keyof AppConfig["events"];
  config: AppConfig;
  save: (next: AppConfig) => Promise<void>;
  language: AppLanguage;
}) {
  const t = (text: string) => translate(language, text);
  const rule = config.events[ruleKey];
  const update = (patch: Partial<typeof rule>) => void save({
    ...config,
    events: { ...config.events, [ruleKey]: { ...rule, ...patch } },
  });
  const preview = rule.bubble
    .replaceAll("{agent}", "Codex")
    .replaceAll("{workspace}", "herdr-pet")
    .replaceAll("{count}", "2");
  return (
    <div className="event-rule-editor">
      <strong>{label}</strong>
      <label>
        <span>{t("气泡模板")}</span>
        <input
          key={`${ruleKey}-${rule.bubble}`}
          defaultValue={rule.bubble}
          maxLength={120}
          onBlur={(event) => update({ bubble: event.target.value })}
        />
      </label>
      <label>
        <span>{t("显示时长")}</span>
        <input
          type="number"
          min="100"
          max="30000"
          step="100"
          value={rule.durationMs}
          onChange={(event) => update({ durationMs: Number(event.target.value) })}
        />
        <small>ms</small>
      </label>
      <label>
        <span>{t("同 Agent 冷却")}</span>
        <input
          type="number"
          min="0"
          max="60000"
          step="100"
          value={rule.cooldownMs}
          onChange={(event) => update({ cooldownMs: Number(event.target.value) })}
        />
        <small>ms</small>
      </label>
      <p className="field-hint">{t("预览")}: {preview || t("（无气泡）")} · {t("支持")} {"{agent}, {workspace}, {count}"}</p>
    </div>
  );
}
