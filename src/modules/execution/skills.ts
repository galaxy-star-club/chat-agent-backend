import { createHash } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { maxSkillAssetBytes, maxSkillBytes } from "./execution-policy";

const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const assetPattern = /^[A-Za-z0-9._/-]+$/;

export type SkillSummary = { name: string; description: string };
export type LoadedSkillFile = SkillSummary & { contentHash: string; instructions: string };
export type SkillAsset = { path: string; mediaType: "text/markdown" | "text/plain"; text: string };
export type SkillFailureCode = "unknown_skill" | "malformed_skill" | "oversize_skill" | "unsupported_skill" | "not_loaded";

export class SkillFailure extends Error {
  constructor(readonly code: SkillFailureCode) {
    super(code);
    this.name = "SkillFailure";
  }
}

export function agentSkillsRoot(): string {
  return path.resolve(process.cwd(), "agent-skills");
}

export async function listSkillCatalog(root = agentSkillsRoot()): Promise<SkillSummary[]> {
  const resolvedRoot = await resolveRoot(root);
  if (!resolvedRoot) return [];
  const entries = await readdir(/* turbopackIgnore: true */ resolvedRoot, { withFileTypes: true });
  const catalog: SkillSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !namePattern.test(entry.name)) continue;
    const directory = await containedDirectory(resolvedRoot, entry.name);
    if (!directory) continue;
    const parsed = await readSkill(directory, entry.name);
    if (parsed.ok) catalog.push({ name: parsed.skill.name, description: parsed.skill.description });
  }
  return catalog.sort((left, right) => left.name.localeCompare(right.name));
}

export async function loadSkill(name: string, root = agentSkillsRoot()): Promise<LoadedSkillFile> {
  if (!namePattern.test(name) || name.length > 64) throw new SkillFailure("unknown_skill");
  const resolvedRoot = await resolveRoot(root);
  if (!resolvedRoot) throw new SkillFailure("unknown_skill");
  const directory = await containedDirectory(resolvedRoot, name);
  if (!directory) throw new SkillFailure("unknown_skill");
  const parsed = await readSkill(directory, name);
  if (!parsed.ok) throw new SkillFailure(parsed.code);
  return parsed.skill;
}

export async function readSkillAsset(input: {
  name: string;
  assetPath: string;
  loaded: boolean;
  root?: string;
}): Promise<SkillAsset> {
  if (!input.loaded) throw new SkillFailure("not_loaded");
  if (!namePattern.test(input.name)) throw new SkillFailure("unknown_skill");
  if (!isSafeAssetPath(input.assetPath)) throw new SkillFailure("unsupported_skill");
  const resolvedRoot = await resolveRoot(input.root ?? agentSkillsRoot());
  if (!resolvedRoot) throw new SkillFailure("unknown_skill");
  const directory = await containedDirectory(resolvedRoot, input.name);
  if (!directory) throw new SkillFailure("unknown_skill");
  const candidate = path.resolve(directory, input.assetPath);
  if (!candidate.startsWith(directory + path.sep)) throw new SkillFailure("unsupported_skill");
  let realFile: string;
  try {
    realFile = await realpath(/* turbopackIgnore: true */ candidate);
  } catch {
    throw new SkillFailure("unknown_skill");
  }
  if (realFile !== directory && !realFile.startsWith(directory + path.sep)) throw new SkillFailure("unsupported_skill");
  const extension = path.extname(realFile);
  const mediaType = extension === ".md" ? "text/markdown" : extension === ".txt" ? "text/plain" : null;
  if (!mediaType || path.basename(realFile) === "SKILL.md") throw new SkillFailure("unsupported_skill");
  const bytes = await readFile(realFile);
  if (bytes.byteLength > maxSkillAssetBytes || bytes.includes(0)) throw new SkillFailure("oversize_skill");
  const text = decodeText(bytes);
  if (text === null || text.trim().length === 0) throw new SkillFailure("unsupported_skill");
  return { path: input.assetPath, mediaType, text };
}

async function readSkill(directory: string, directoryName: string): Promise<{ ok: true; skill: LoadedSkillFile } | { ok: false; code: SkillFailureCode }> {
  const filePath = path.join(directory, "SKILL.md");
  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch {
    return { ok: false, code: "unknown_skill" };
  }
  if (bytes.byteLength > maxSkillBytes) return { ok: false, code: "oversize_skill" };
  const text = decodeText(bytes);
  if (text === null) return { ok: false, code: "malformed_skill" };
  const parsed = parseFrontmatter(text);
  if (!parsed || parsed.name !== directoryName) return { ok: false, code: "malformed_skill" };
  return {
    ok: true,
    skill: {
      name: parsed.name,
      description: parsed.description,
      instructions: parsed.instructions,
      contentHash: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

function parseFrontmatter(text: string): { name: string; description: string; instructions: string } | null {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const values: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    if (!line.trim()) continue;
    const match = /^([a-z]+): ?(.*)$/.exec(line);
    if (!match || match[1] in values) return null;
    values[match[1]] = unwrap(match[2].trim());
  }
  const keys = Object.keys(values).sort();
  if (keys.join() !== "description,name") return null;
  const name = values.name ?? "";
  const description = values.description ?? "";
  const instructions = text.slice(end + 5).trim();
  if (!namePattern.test(name) || name.length > 64) return null;
  if (description.length < 1 || description.length > 300 || instructions.length < 1 || instructions.length > 64_000) return null;
  return { name, description, instructions };
}

function unwrap(value: string): string {
  if (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) return value.slice(1, -1);
  return value;
}

function isSafeAssetPath(value: string): boolean {
  if (!assetPattern.test(value) || value.length > 200) return false;
  return value.split("/").every((segment) => segment && segment !== "." && segment !== ".." && !segment.startsWith("."));
}

function decodeText(bytes: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

async function resolveRoot(root: string): Promise<string | null> {
  try {
    return await realpath(root);
  } catch {
    return null;
  }
}

async function containedDirectory(root: string, name: string): Promise<string | null> {
  const candidate = path.resolve(root, name);
  if (!candidate.startsWith(root + path.sep)) return null;
  try {
    const real = await realpath(candidate);
    return real.startsWith(root + path.sep) ? real : null;
  } catch {
    return null;
  }
}
