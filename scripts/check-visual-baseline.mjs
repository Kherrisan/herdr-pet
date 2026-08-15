import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const manifestPath = "plans/visual-baseline/linux-x11/manifest.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const root = dirname(manifestPath);

for (const [name, expected] of Object.entries(manifest.files)) {
  const data = await readFile(join(root, name));
  const pngSignature = data.subarray(0, 8).toString("hex");
  if (pngSignature !== "89504e470d0a1a0a") throw new Error(`${name} is not a PNG file.`);

  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const sha256 = createHash("sha256").update(data).digest("hex");
  if (width !== expected.width || height !== expected.height) {
    throw new Error(`${name} is ${width}x${height}; expected ${expected.width}x${expected.height}.`);
  }
  if (sha256 !== expected.sha256) {
    throw new Error(`${name} hash differs from the reviewed visual baseline.`);
  }
}

console.log(`Visual baseline: ${Object.keys(manifest.files).length} reviewed PNG files OK`);
