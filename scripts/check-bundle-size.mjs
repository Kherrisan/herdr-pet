import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const limitBytes = 400 * 1024;
const assets = join(process.cwd(), "dist", "assets");
const files = await readdir(assets);
const scripts = files.filter((file) => file.endsWith(".js"));
if (!scripts.length) throw new Error("No production JavaScript bundle found; run npm run build first.");

let total = 0;
for (const file of scripts) total += (await stat(join(assets, file))).size;
if (total > limitBytes) {
  throw new Error(`Production JavaScript is ${total} bytes, over the ${limitBytes}-byte budget.`);
}
console.log(`Production JavaScript: ${total} / ${limitBytes} bytes`);
