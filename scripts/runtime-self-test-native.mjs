import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

if (process.platform === "linux") {
  throw new Error("Linux requires a display wrapper; use npm run runtime:self-test:linux.");
}

const fixtureRoot = await mkdtemp(join(tmpdir(), "herdr-pet-runtime-"));
const reportPath = join(fixtureRoot, "runtime-self-test.json");
const binaryPath = process.env.HERDR_PET_SELF_TEST_BINARY ?? resolve(
  "src-tauri",
  "target",
  "release",
  process.platform === "win32" ? "herdr-pet.exe" : "herdr-pet",
);

const run = (command, args, options = {}) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error(`Timed out while running ${command}.`));
  }, 20_000);
  child.on("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });
  child.on("exit", (code, signal) => {
    clearTimeout(timer);
    if (code === 0) resolveRun();
    else reject(new Error(`${command} exited with ${code ?? signal}.`));
  });
});

try {
  await run(binaryPath, ["--runtime-self-test", reportPath], {
    env: {
      ...process.env,
      HERDR_SOCKET_PATH: process.platform === "win32"
        ? `\\\\.\\pipe\\herdr-pet-self-test-missing-${process.pid}`
        : join(fixtureRoot, "missing-herdr.sock"),
    },
  });
  await run(process.execPath, [resolve("scripts/check-runtime-self-test.mjs"), reportPath]);
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
