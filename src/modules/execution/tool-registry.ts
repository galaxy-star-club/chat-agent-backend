import { z } from "zod";
import { jsonValueSchema, type JsonValue } from "@/contracts/json";
import {
  MagicaFailure,
  getMagicaModelPricing,
  getMagicaModelSchema,
  getMagicaRun,
  listMagicaModels,
  magicaConfigured,
  magicaVideoConfigured,
  runMagicaVideoTool,
  startMagicaModel,
} from "./magica.provider";
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
const videoUrl = z.url().refine((value) => value.startsWith("https://"));
const removeVideoBackgroundInput = z.strictObject({ video_url: videoUrl });
const upscaleVideoInput = z.strictObject({
  video_url: videoUrl,
  resolution: z.enum(["1080p", "2160p"]).optional(),
});
const videoOutput = z.strictObject({ runId: z.string().min(1), video_url: videoUrl });
const magicaIdentifier = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/);
const magicaModelInput = z.strictObject({ modelId: magicaIdentifier });
const magicaRunInput = z.strictObject({
  nodeType: magicaIdentifier,
  subModelId: magicaIdentifier.optional(),
  input: z.record(z.string().min(1).max(100), jsonValueSchema),
});
const magicaRunOutput = z.strictObject({ runId: z.string().min(1) });

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
  available: () => boolean;
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
  tool_not_configured: "That media tool is not configured yet.",
  provider_unauthorized: "The media provider rejected the server credentials.",
  provider_rate_limited: "The media provider is busy. Try again later.",
  provider_timeout: "The media provider took too long. Try again later.",
  provider_failed: "The media provider could not finish this request.",
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
  available?: () => boolean;
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
    available: definition.available ?? (() => true),
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
        if (error instanceof SkillFailure || error instanceof ToolInputError || error instanceof MagicaFailure) throw error;
        throw new Error("tool_failed");
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
  defineTool({
    name: "list_magica_models",
    description: "List the Magica model catalog before selecting a model for a requested generation task.",
    rendering: { label: "List Magica models" },
    input: z.strictObject({}),
    output: jsonValueSchema,
    available: magicaConfigured,
    eligible: () => true,
    execute: () => listMagicaModels(),
    effect: () => null,
  }),
  defineTool({
    name: "get_magica_model_schema",
    description: "Get a Magica model's required input schema, defaults, and limits before executing it.",
    rendering: { label: "Get Magica schema" },
    input: magicaModelInput,
    output: jsonValueSchema,
    available: magicaConfigured,
    eligible: () => true,
    execute: ({ modelId }) => getMagicaModelSchema(modelId),
    effect: () => null,
  }),
  defineTool({
    name: "get_magica_model_pricing",
    description: "Get current Magica pricing for one model before starting a generation.",
    rendering: { label: "Get Magica pricing" },
    input: magicaModelInput,
    output: jsonValueSchema,
    available: magicaConfigured,
    eligible: () => true,
    execute: ({ modelId }) => getMagicaModelPricing(modelId),
    effect: () => null,
  }),
  defineTool({
    name: "run_magica_model",
    description: "Start one Magica model run after inspecting its schema and pricing. Returns a run ID for status checks.",
    rendering: { label: "Run Magica model" },
    input: magicaRunInput,
    output: magicaRunOutput,
    available: magicaConfigured,
    eligible: () => true,
    execute: ({ nodeType, subModelId, input }) => startMagicaModel({ nodeType, subModelId, input }),
    effect: () => null,
  }),
  defineTool({
    name: "get_magica_run",
    description: "Get the status and output for a Magica model run.",
    rendering: { label: "Get Magica run" },
    input: z.strictObject({ runId: magicaIdentifier }),
    output: jsonValueSchema,
    available: magicaConfigured,
    eligible: () => true,
    execute: ({ runId }) => getMagicaRun(runId),
    effect: () => null,
  }),
  defineTool({
    name: "remove_video_background",
    description: "Remove the background from one HTTPS video URL when the user asks for a transparent-background video.",
    rendering: { label: "Remove video background" },
    input: removeVideoBackgroundInput,
    output: videoOutput,
    available: () => magicaVideoConfigured("videoBackgroundRemoverNode"),
    eligible: () => true,
    execute: async (input) => {
      const result = await runMagicaVideoTool({ node: "videoBackgroundRemoverNode", payload: input });
      return { runId: result.runId, video_url: result.videoUrl };
    },
    effect: () => null,
  }),
  defineTool({
    name: "upscale_video",
    description: "Upscale one HTTPS video URL when the user explicitly asks for higher resolution.",
    rendering: { label: "Upscale video" },
    input: upscaleVideoInput,
    output: videoOutput,
    available: () => magicaVideoConfigured("videoUpscalerNode"),
    eligible: () => true,
    execute: async (input) => {
      const result = await runMagicaVideoTool({ node: "videoUpscalerNode", payload: input });
      return { runId: result.runId, video_url: result.videoUrl };
    },
    effect: () => null,
  }),
];

export function toolByName(name: string): RegisteredTool | undefined {
  return tools.find((tool) => tool.name === name);
}

export function providerTools(): Array<{ type: "function"; function: { name: string; description: string; parameters: JsonValue } }> {
  return tools.filter((tool) => tool.available()).map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

export function failureFromTool(error: unknown): { code: ToolFailureCode; message: string } {
  if (error instanceof ToolInputError) return toolFailure("invalid_tool_input");
  if (error instanceof SkillFailure) return toolFailure(error.code);
  if (error instanceof MagicaFailure) return toolFailure(error.code);
  return toolFailure("tool_failed");
}

export async function skillCatalog(): Promise<SkillSummary[]> {
  return listSkillCatalog();
}
