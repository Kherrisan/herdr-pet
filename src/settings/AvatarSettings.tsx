import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open } from "@tauri-apps/plugin-dialog";
import { AvatarLabPet } from "../avatar-lab/AvatarLabPet";
import { builtInAvatarProject, parseAvatarProject } from "../avatar-lab/project";
import type { ActiveAvatarState } from "../avatar-lab/useActiveAvatar";
import { changedAvatarMappings, normalizeAvatarMappings } from "../overlay/animation";
import { api } from "../shared/tauri";
import type {
  AppConfig,
  AvatarInstallation,
  AvatarProjectInspection,
} from "../shared/types";
import { plural, translate, type AppLanguage } from "./i18n";

interface AvatarSettingsProps {
  config: AppConfig;
  activeAvatar: ActiveAvatarState;
  save: (config: AppConfig) => Promise<void>;
  onConfig: (config: AppConfig) => void;
  onPreview: (animation: string) => void;
  language: AppLanguage;
  paused?: boolean;
}

interface PendingImport {
  source: string;
  fileName: string;
  inspection: AvatarProjectInspection;
  avatarId: string;
}

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

export function AvatarSettings({
  config,
  activeAvatar,
  save,
  onConfig,
  onPreview,
  language,
  paused = false,
}: AvatarSettingsProps) {
  const t = (text: string) => translate(language, text);
  const [installations, setInstallations] = useState<AvatarInstallation[]>([]);
  const [pending, setPending] = useState<PendingImport>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [mappingNotice, setMappingNotice] = useState<string[]>([]);
  const animationKeys = activeAvatar.project.animationKeys;
  const pendingPreview = useMemo(() => {
    if (!pending?.avatarId) return undefined;
    try {
      return parseAvatarProject(pending.source, pending.avatarId);
    } catch {
      return undefined;
    }
  }, [pending]);

  const refresh = () =>
    api
      .listAvatarInstallations()
      .then(setInstallations)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));

  useEffect(() => {
    void refresh();
    const unlisten = listen("avatar://changed", refresh);
    return () => void unlisten.then((dispose) => dispose());
  }, []);

  async function chooseProjectFile() {
    setBusy(true);
    setError(undefined);
    try {
      const path = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Avatar Studio Project", extensions: ["json"] }],
      });
      if (!path) return;
      const selected = await api.inspectAvatarProjectFile(path);
      setPending({
        source: selected.source,
        fileName: selected.fileName,
        inspection: selected.inspection,
        avatarId: selected.inspection.avatars[0]?.id ?? "",
      });
    } catch (cause) {
      setPending(undefined);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function installPending() {
    if (!pending?.avatarId) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.installAvatarProject(pending.source, pending.avatarId);
      const selected = pending.inspection.avatars.find((avatar) => avatar.id === pending.avatarId);
      const next = normalizeAvatarMappings(await api.getConfig(), selected?.animationKeys ?? []);
      setMappingNotice(changedAvatarMappings(config, next));
      await save(next);
      setPending(undefined);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function activateBuiltIn() {
    setBusy(true);
    setError(undefined);
    try {
      const selected = await api.selectAvatar(null, null);
      const next = normalizeAvatarMappings(selected, builtInAvatarProject.animationKeys);
      setMappingNotice(changedAvatarMappings(config, next));
      await save(next);
      onConfig(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function activateInstallation(installation: AvatarInstallation, avatarId: string) {
    setBusy(true);
    setError(undefined);
    try {
      const selected = await api.selectAvatar(installation.id, avatarId);
      const avatar = installation.summary.avatars.find((candidate) => candidate.id === avatarId);
      const next = normalizeAvatarMappings(selected, avatar?.animationKeys ?? []);
      setMappingNotice(changedAvatarMappings(config, next));
      await save(next);
      onConfig(next);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function removeInstallation(installation: AvatarInstallation) {
    const confirmation = language === "en"
      ? `Delete installed project “${installation.summary.displayName}”? The original Avatar Lab file will not be deleted.`
      : `删除已安装工程“${installation.summary.displayName}”？原始 Avatar Lab 文件不会被删除。`;
    if (!window.confirm(confirmation)) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await api.removeAvatarInstallation(installation.id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function restoreAnimationDefaults() {
    const defaults = await api.getDefaultConfig();
    const candidate: AppConfig = {
      ...config,
      avatar: {
        ...config.avatar,
        stateAnimations: defaults.avatar.stateAnimations,
      },
      events: defaults.events,
    };
    const next = normalizeAvatarMappings(candidate, animationKeys);
    setMappingNotice(changedAvatarMappings(config, next));
    await save(next);
  }

  const stateMappings: Array<{
    key: keyof AppConfig["avatar"]["stateAnimations"];
    label: string;
  }> = [
    { key: "sleeping", label: t("没有 Agent") },
    { key: "idle", label: t("空闲") },
    { key: "working", label: t("工作中") },
    { key: "needsAttention", label: t("需要关注") },
    { key: "offline", label: t("Herdr 离线") },
  ];

  return (
    <>
      <section className="settings-card">
        <div className="section-title">
          <div>
            <h2>{t("Avatar Lab 角色")}</h2>
            <p className="section-description">
              {t("当前")}: {activeAvatar.project.avatarName} · {activeAvatar.source === "built-in" ? t("内置") : t("已安装工程")}
            </p>
          </div>
          {activeAvatar.loading && <span className="status-pill status-pill--connecting">{t("加载中")}</span>}
        </div>
        {activeAvatar.error && <p className="error-message">{t("角色加载失败，已回退 Strobi")}: {activeAvatar.error}</p>}
        {error && <p className="error-message">{error}</p>}
        {mappingNotice.length > 0 && (
          <div className="mapping-notice">
            <strong>{t("切换角色时已修复缺失映射")}</strong>
            <ul>{mappingNotice.map((change) => {
              const [label, mapping] = change.split("：");
              return <li key={change}>{t(label)}: {mapping}</li>;
            })}</ul>
          </div>
        )}

        <div className={`avatar-installation ${config.avatar.installationId === null ? "is-active" : ""}`}>
          <div>
            <strong>Strobi</strong>
            <small>{t("官方内置恢复角色")} · {plural(language, builtInAvatarProject.animationKeys.length, "动画", "animation")}</small>
          </div>
          <button className="secondary-button" disabled={busy || config.avatar.installationId === null} onClick={() => void activateBuiltIn()}>
            {t("使用")}
          </button>
        </div>

        {installations.map((installation) => {
          const active = config.avatar.installationId === installation.id;
          const selectedAvatarId = active
            ? config.avatar.avatarId ?? installation.selectedAvatarId
            : installation.selectedAvatarId;
          return (
            <div className={`avatar-installation ${active ? "is-active" : ""}`} key={installation.id}>
              <div>
                <strong>{installation.summary.displayName}</strong>
                <small>
                  Studio v{installation.summary.version} · importer v{installation.importerVersion} · {plural(language, installation.summary.avatars.length, "角色", "character")} · {formatBytes(installation.summary.sizeBytes)} · {new Date(installation.importedAtMs).toLocaleDateString(language)}
                </small>
                <select
                  value={selectedAvatarId}
                  disabled={busy}
                  onChange={(event) => void activateInstallation(installation, event.target.value)}
                >
                  {installation.summary.avatars.map((avatar) => (
                    <option key={avatar.id} value={avatar.id}>{avatar.name} ({plural(language, avatar.animationKeys.length, "动画", "animation")})</option>
                  ))}
                </select>
              </div>
              <div className="installation-actions">
                <button className="secondary-button" disabled={busy || active} onClick={() => void activateInstallation(installation, selectedAvatarId)}>{t("使用")}</button>
                <button className="danger-button" disabled={busy || active} onClick={() => void removeInstallation(installation)}>{t("删除")}</button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          className="file-picker"
          disabled={busy}
          onClick={() => void chooseProjectFile()}
        >
          <span>{busy ? t("正在处理…") : t("导入 Avatar Studio Project v2")}</span>
        </button>

        <button
          className="secondary-button external-editor-button"
          onClick={() => void openUrl("https://avatars.bible-strong.app/")}
        >
          {t("在 Avatar Lab 中创作或编辑")}
        </button>

        {pending && (
          <div className="import-preview">
            <strong>{pending.fileName}</strong>
            <p>
              {plural(language, pending.inspection.avatars.length, "角色", "character")} · {plural(language, pending.inspection.animationCount, "动画", "animation")} · {plural(language, pending.inspection.totalSteps, "步骤", "step")} · {formatBytes(pending.inspection.sizeBytes)}
            </p>
            <div className="avatar-choice-grid">
              {pending.inspection.avatars.map((avatar) => (
                <label className={pending.avatarId === avatar.id ? "is-selected" : ""} key={avatar.id}>
                  <input
                    type="radio"
                    name="import-avatar"
                    value={avatar.id}
                    checked={pending.avatarId === avatar.id}
                    onChange={() => setPending({ ...pending, avatarId: avatar.id })}
                  />
                  <span>{avatar.name}</span>
                  <small>{plural(language, avatar.animationKeys.length, "动画", "animation")}</small>
                </label>
              ))}
            </div>
            {pendingPreview && (
              <div className="import-avatar-preview">
                <AvatarLabPet
                  state="idle"
                  animation={pendingPreview.animationKeys.includes("idle") ? "idle" : pendingPreview.animationKeys[0] ?? "idle"}
                  payload={pendingPreview.payload}
                  paused={paused}
                />
                <span>{t("实时预览")}: {pendingPreview.avatarName}</span>
              </div>
            )}
            <div className="installation-actions">
              <button className="secondary-button" disabled={busy} onClick={() => setPending(undefined)}>{t("取消")}</button>
              <button className="primary-button" disabled={busy || !pending.avatarId} onClick={() => void installPending()}>{t("安装并启用")}</button>
            </div>
          </div>
        )}
      </section>

      <section className="settings-card">
        <div className="section-title">
          <h2>{t("持续状态动画")}</h2>
          <button className="secondary-button" onClick={() => void restoreAnimationDefaults()}>
            {t("恢复全部默认映射")}
          </button>
        </div>
        <p className="section-description">{t("动画列表来自当前角色；播放按钮只影响设置页预览。")}</p>
        {stateMappings.map(({ key, label }) => (
          <AnimationMappingRow
            key={key}
            label={label}
            value={config.avatar.stateAnimations[key]}
            animations={animationKeys}
            onPreview={onPreview}
            language={language}
            onChange={(animation) => void save({
              ...config,
              avatar: {
                ...config.avatar,
                stateAnimations: { ...config.avatar.stateAnimations, [key]: animation },
              },
            })}
          />
        ))}
      </section>

      <section className="settings-card">
        <h2>{t("事件动画映射")}</h2>
        <AnimationMappingRow
          label={t("Agent 检出")}
          value={config.events.agentDetected.animation}
          animations={animationKeys}
          onPreview={onPreview}
          language={language}
          onChange={(animation) => void save({
            ...config,
            events: { ...config.events, agentDetected: { ...config.events.agentDetected, animation } },
          })}
        />
        <AnimationMappingRow
          label={t("Turn 完成")}
          value={config.events.turnCompleted.animation}
          animations={animationKeys}
          onPreview={onPreview}
          language={language}
          onChange={(animation) => void save({
            ...config,
            events: { ...config.events, turnCompleted: { ...config.events.turnCompleted, animation } },
          })}
        />
        <AnimationMappingRow
          label={t("请求关注")}
          value={config.events.attentionRequested.animation}
          animations={animationKeys}
          onPreview={onPreview}
          language={language}
          onChange={(animation) => void save({
            ...config,
            events: { ...config.events, attentionRequested: { ...config.events.attentionRequested, animation } },
          })}
        />
        <AnimationMappingRow
          label={t("Agent 开始")}
          value={config.events.agentStarted.animation}
          animations={animationKeys}
          onPreview={onPreview}
          language={language}
          onChange={(animation) => void save({
            ...config,
            events: { ...config.events, agentStarted: { ...config.events.agentStarted, animation } },
          })}
        />
        <AnimationMappingRow
          label={t("Agent 退出")}
          value={config.events.agentExited.animation}
          animations={animationKeys}
          onPreview={onPreview}
          language={language}
          onChange={(animation) => void save({
            ...config,
            events: { ...config.events, agentExited: { ...config.events.agentExited, animation } },
          })}
        />
        <AnimationMappingRow
          label={t("Herdr 重连")}
          value={config.events.reconnected.animation}
          animations={animationKeys}
          onPreview={onPreview}
          language={language}
          onChange={(animation) => void save({
            ...config,
            events: { ...config.events, reconnected: { ...config.events.reconnected, animation } },
          })}
        />
      </section>
    </>
  );
}

function AnimationMappingRow({
  label,
  value,
  animations,
  onChange,
  onPreview,
  language,
}: {
  label: string;
  value: string;
  animations: readonly string[];
  onChange: (animation: string) => void;
  onPreview: (animation: string) => void;
  language: AppLanguage;
}) {
  const resolved = animations.includes(value) ? value : animations[0] ?? "";
  return (
    <div className="animation-mapping-row">
      <span>{label}</span>
      <select value={resolved} disabled={!animations.length} onChange={(event) => onChange(event.target.value)}>
        {animations.map((animation) => <option key={animation} value={animation}>{animation}</option>)}
      </select>
      <button className="preview-button" disabled={!resolved} onClick={() => onPreview(resolved)} aria-label={language === "en" ? `Preview ${label}` : `试听${label}`}>▶</button>
    </div>
  );
}
