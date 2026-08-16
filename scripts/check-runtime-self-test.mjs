import { readFile } from "node:fs/promises";

const reportPath = process.argv[2];
if (!reportPath) throw new Error("Usage: node check-runtime-self-test.mjs <report.json>");
const report = JSON.parse(await readFile(reportPath, "utf8"));

if (report.schemaVersion !== 2) throw new Error("Unsupported runtime self-test report schema.");
if (report.runtime !== "official-avatar-lab-browser") throw new Error("Unexpected avatar runtime.");
if (!report.success) throw new Error(`Official runtime self-test failed: ${report.error ?? "unknown error"}`);
if (!report.animation) throw new Error("Runtime self-test did not play an animation.");
if (!Number.isInteger(report.availableAnimationCount) || report.availableAnimationCount < 1) {
  throw new Error("Runtime self-test found no animations.");
}
if (!Number.isInteger(report.svgElements) || report.svgElements < 1) {
  throw new Error("Runtime self-test did not render an SVG.");
}
if (
  report.window?.label !== "pet-overlay" ||
  report.window.visible !== true ||
  report.window.decorated !== false ||
  report.window.alwaysOnTopRequested !== true ||
  (report.platform === "linux"
    ? report.window.alwaysOnTopObserved !== null
    : report.window.alwaysOnTopObserved !== true) ||
  !Number.isFinite(report.window.scaleFactor) ||
  report.window.scaleFactor <= 0 ||
  !Number.isFinite(report.window.logicalWidth) ||
  Math.abs(report.window.logicalWidth - 360) > 2 ||
  !Number.isFinite(report.window.logicalHeight) ||
  Math.abs(report.window.logicalHeight - 320) > 2
) {
  throw new Error(`Overlay window self-test failed: ${JSON.stringify(report.window)}`);
}
const capabilityContract = report.platform === "linux"
  ? (
      (report.capabilities?.displayBackend === "x11-compatible" &&
        report.capabilities.globalShortcutAvailable === true &&
        report.capabilities.absolutePositionAvailable === true) ||
      (report.capabilities?.displayBackend === "wayland" &&
        report.capabilities.globalShortcutAvailable === false &&
        report.capabilities.absolutePositionAvailable === false)
    )
  : (
      report.capabilities?.displayBackend === "native" &&
      report.capabilities.globalShortcutAvailable === true &&
      report.capabilities.absolutePositionAvailable === true
    );
if (!capabilityContract) {
  throw new Error(`Display capability self-test failed: ${JSON.stringify(report.capabilities)}`);
}

console.log(JSON.stringify(report));
