import { readFile } from "node:fs/promises";

const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const packageJson = await json("package.json");
const tauriConfig = await json("src-tauri/tauri.conf.json");
const cargo = await readFile("src-tauri/Cargo.toml", "utf8");
const rustMain = await readFile("src-tauri/src/main.rs", "utf8");
const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
const versions = [packageJson.version, tauriConfig.version, cargoVersion];
if (new Set(versions).size !== 1) throw new Error(`Project versions differ: ${versions.join(", ")}`);
if (
  process.env.GITHUB_REF_TYPE === "tag" &&
  process.env.GITHUB_REF_NAME !== `v${packageJson.version}`
) {
  throw new Error(`Build tag ${process.env.GITHUB_REF_NAME} does not match v${packageJson.version}.`);
}

const capabilityDocument = await json("src-tauri/capabilities/default.json");
const capabilities = capabilityDocument.permissions.map((permission) =>
  typeof permission === "string" ? permission : permission.identifier,
);
for (const forbidden of ["shell:", "fs:", "http:"]) {
  if (capabilities.some((permission) => permission.startsWith(forbidden))) {
    throw new Error(`Broad ${forbidden} capability is forbidden.`);
  }
}
const csp = tauriConfig.app?.security?.csp ?? "";
if (/script-src[^;]*https?:/i.test(csp)) throw new Error("Remote script origins are forbidden by project policy.");
const overlayWindow = tauriConfig.app?.windows?.find((window) => window.label === "pet-overlay");
if (
  !overlayWindow ||
  overlayWindow.alwaysOnTop !== true ||
  overlayWindow.decorations !== false ||
  overlayWindow.transparent !== true ||
  overlayWindow.skipTaskbar !== true ||
  overlayWindow.width !== 320 ||
  overlayWindow.height !== 320
) {
  throw new Error("The pet-overlay startup window contract has changed.");
}
if (tauriConfig.bundle?.active !== false) {
  throw new Error("Tauri bundling must remain disabled while only raw executables are in scope.");
}
if (!rustMain.includes('#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]')) {
  throw new Error("Windows Release builds must use the GUI subsystem.");
}

const resources = tauriConfig.bundle?.resources ?? {};
if (
  !tauriConfig.bundle?.licenseFile ||
  !resources["../LICENSE"] ||
  !resources["../THIRD_PARTY_NOTICES.md"] ||
  !resources["../third-party/avatar-lab/LICENSE"] ||
  !resources["../third-party/herdr/LICENSE"]
) {
  throw new Error("Project metadata must retain project and third-party license references.");
}
console.log(`Project metadata ${packageJson.version}: versions, executable scope, CSP, capabilities and licenses OK`);
