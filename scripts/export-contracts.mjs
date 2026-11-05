import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(process.argv[2] ?? resolve(root, "dist/contracts"));
const source = await readFile(resolve(root, "src/contracts/health.ts"), "utf8");
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const schemaVersion = source.match(/CONTRACT_VERSION = "([^"]+)"/)?.[1];
if (!schemaVersion) throw new Error("Health contract version is missing");

await mkdir(target, { recursive: true });
await writeFile(resolve(target, "health.ts"), source);
await writeFile(resolve(target, "manifest.json"), JSON.stringify({
  schemaVersion,
  sourceRepository: "backend",
  sourceRevision: revision,
  files: { "health.ts": createHash("sha256").update(source).digest("hex") },
}, null, 2) + "\n");
console.log(`Exported contracts from backend revision ${revision}`);
