import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { OverlayApp } from "./overlay/OverlayApp";
import { AgentBubbleApp } from "./overlay/AgentBubbleApp";
import { SettingsApp } from "./settings/SettingsApp";
import "./styles/global.css";

async function mount() {
  const label = getCurrentWindow().label;
  document.documentElement.dataset.window = label;
  const Root = label === "pet-overlay"
    ? OverlayApp
    : label === "agent-bubbles"
      ? AgentBubbleApp
      : SettingsApp;
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}

void mount();
