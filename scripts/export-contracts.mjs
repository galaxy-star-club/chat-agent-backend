import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(process.argv[2] ?? resolve(root, "dist/contracts"));
const contractFiles = ["auth.ts", "database-readiness.ts", "health.ts"];
const sources = Object.fromEntries(await Promise.all(contractFiles.map(async (file) => [
  file,
  await readFile(resolve(root, "src/contracts", file), "utf8"),
])));
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
for (const file of contractFiles) {
  const committedSource = execFileSync("git", ["show", `${revision}:src/contracts/${file}`], {
    cwd: root,
    encoding: "utf8",
  });
  if (sources[file] !== committedSource) {
    throw new Error("Commit the authoritative contracts before exporting so their revision is reproducible.");
  }
}
const schemaVersion = sources["health.ts"].match(/CONTRACT_VERSION = "([^"]+)"/)?.[1];
if (!schemaVersion) throw new Error("Health contract version is missing");

await mkdir(target, { recursive: true });
for (const file of contractFiles) await writeFile(resolve(target, file), sources[file]);
await writeFile(resolve(target, "manifest.json"), JSON.stringify({
  schemaVersion,
  sourceRepository: "backend",
  sourceRevision: revision,
  files: Object.fromEntries(contractFiles.map((file) => [
    file,
    createHash("sha256").update(sources[file]).digest("hex"),
  ])),
}, null, 2) + "\n");
console.log(`Exported contracts from backend revision ${revision}`);
