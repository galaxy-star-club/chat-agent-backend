import { z } from "zod";
import { jsonValueSchema, type JsonValue } from "@/contracts/json";
import { listSkillCatalog, loadSkill, readSkillAsset, SkillFailure, type SkillSummary } from "./skills";

const skillName = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64);
const loadInput = z.strictObject({ name: skillName });
const assetInput = z.strictObject({
  name: skillName,
  path: z.string().min(1).max(200),
});
const loadOutput = z.strictObject({
  name: skillName,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  description: z.string().min(1).max(300),
  instructions: z.string().min(1).max(64_000),
});
const assetOutput = z.strictObject({
  path: z.string().min(1).max(200),
  mediaType: z.enum(["text/markdown", "text/plain"]),
  text: z.string().min(1).max(32_000),
});

export type ToolContext = {
  loadedSkills: Array<{ name: string; contentHash: string; instructions: string }>;
  catalog: SkillSummary[];
};

export type SkillEffect = {
  type: "skill";
  name: string;
  contentHash: string;
  instructions: string;
};

type RegisteredTool = {
  name: string;
  description: string;
  rendering: { label: string };
  idempotent: boolean;
  parameters: JsonValue;
  eligible: (input: unknown, context: ToolContext) => boolean;
  estimateCredits: (input: unknown) => bigint;
  execute: (input: unknown, context: ToolContext) => Promise<JsonValue>;
  effect: (output: JsonValue) => SkillEffect | null;
};

const toolMessages = {
  unknown_tool: "That tool is not available.",
  invalid_tool_input: "The tool input was not valid.",
  not_eligible: "That tool cannot be used for this run.",
  unknown_skill: "That skill is not available.",
  malformed_skill: "That skill file is not valid.",
  oversize_skill: "That skill file is too large.",
  unsupported_skill: "That skill file is not a supported format.",
  not_loaded: "Load the skill before reading its files.",
  tool_interrupted: "The tool did not finish. It was not run again.",
  tool_failed: "The tool failed.",
  tool_limit: "The model asked for more tools than this run can run.",
  credit_policy_missing: "That tool does not have an approved credit policy.",
} as const;

export type ToolFailureCode = keyof typeof toolMessages;

export function toolFailure(code: ToolFailureCode): { code: ToolFailureCode; message: string } {
  return { code, message: toolMessages[code] };
}

function defineTool<Input, Output extends JsonValue>(definition: {
  name: string;
  description: string;
  rendering: { label: string };
  input: z.ZodType<Input>;
  output: z.ZodType<Output>;
  eligible: (input: Input, context: ToolContext) => boolean;
  execute: (input: Input, context: ToolContext) => Promise<Output>;
  effect: (output: Output) => SkillEffect | null;
}): RegisteredTool {
  const generated = z.toJSONSchema(definition.input, { target: "draft-07" });
  const parameters = { ...generated };
  delete parameters.$schema;
  return {
    name: definition.name,
    description: definition.description,
    rendering: definition.rendering,
    idempotent: true,
    parameters: jsonValueSchema.parse(parameters),
    eligible: (input, context) => {
      const parsed = definition.input.safeParse(input);
      return parsed.success ? definition.eligible(parsed.data, context) : false;
    },
    estimateCredits: () => BigInt(0),
    execute: async (input, context) => {
      const parsed = definition.input.safeParse(input);
      if (!parsed.success) throw new ToolInputError();
      try {
        return definition.output.parse(await definition.execute(parsed.data, context));
      } catch (error) {
        if (error instanceof SkillFailure || error instanceof ToolInputError) throw error;
        throw new SkillFailure("malformed_skill");
      }
    },
    effect: (output) => {
      const parsed = definition.output.safeParse(output);
      return parsed.success ? definition.effect(parsed.data) : null;
    },
  };
}

class ToolInputError extends Error {
  constructor() {
    super("invalid_tool_input");
    this.name = "ToolInputError";
  }
}

const tools: readonly RegisteredTool[] = [
  defineTool({
    name: "load_skill",
    description: "Load one approved skill by name and return its saved instructions.",
    rendering: { label: "Load skill" },
    input: loadInput,
    output: loadOutput,
    eligible: (input, context) => context.catalog.some((skill) => skill.name === input.name),
    execute: async (input, context) => {
      const saved = context.loadedSkills.find((skill) => skill.name === input.name);
      if (saved) {
        const description = context.catalog.find((skill) => skill.name === input.name)?.description ?? "Loaded skill.";
        return { name: saved.name, contentHash: saved.contentHash, description, instructions: saved.instructions };
      }
      return loadSkill(input.name);
    },
    effect: (output) => ({ type: "skill", name: output.name, contentHash: output.contentHash, instructions: output.instructions }),
  }),
  defineTool({
    name: "read_skill_asset",
    description: "Read one markdown or text file from a skill that is already loaded.",
    rendering: { label: "Read skill file" },
    input: assetInput,
    output: assetOutput,
    eligible: (input, context) => context.loadedSkills.some((skill) => skill.name === input.name),
    execute: (input, context) => readSkillAsset({
      name: input.name,
      assetPath: input.path,
      loaded: context.loadedSkills.some((skill) => skill.name === input.name),
    }),
    effect: () => null,
  }),
];

export function toolByName(name: string): RegisteredTool | undefined {
  return tools.find((tool) => tool.name === name);
}

export function providerTools(): Array<{ type: "function"; function: { name: string; description: string; parameters: JsonValue } }> {
  return tools.map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

export function failureFromTool(error: unknown): { code: ToolFailureCode; message: string } {
  if (error instanceof ToolInputError) return toolFailure("invalid_tool_input");
  if (error instanceof SkillFailure) return toolFailure(error.code);
  return toolFailure("tool_failed");
}

export async function skillCatalog(): Promise<SkillSummary[]> {
  return listSkillCatalog();
}
