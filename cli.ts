#!/usr/bin/env bun
import {
  generateGeminiImage,
  generateOpenAIImage,
} from "./core.ts";
import {
  geminiAspectRatioSchema,
  geminiImageSizeSchema,
  geminiModelSchema,
  geminiParamsSchema,
  openAIBackgroundSchema,
  openAIModelSchema,
  openAIParamsSchema,
  openAIQualitySchema,
  openAISizeSchema,
  type GeminiParams,
  type OpenAIParams,
} from "./schemas.ts";

export type ParsedArgs =
  | { mode: "openai"; params: OpenAIParams }
  | { mode: "gemini"; params: GeminiParams }
  | { mode: "help"; message?: string };

function printUsage(message?: string) {
  if (message) {
    console.error(message);
  }
  console.error(`images-mcp (CLI)

Usage:
  images-mcp openai  [args]  Generate/edit via OpenAI
  images-mcp gemini  [args]  Generate/edit via Gemini

Common args:
  --prompt        Text prompt (required)
  --output        Output file path (required)
  --input         Input image path (repeatable)

OpenAI args:
  --model         gpt-image-1.5 (default)
  --size          auto | 1024x1024 | 1536x1024 | 1024x1536
  --quality       auto | high | medium | low
  --background    auto | transparent | opaque

Gemini args:
  --model         gemini-3-pro-image-preview (default) | gemini-2.5-flash-image
  --aspect-ratio  1:1 | 2:3 | 3:2 | 3:4 | 4:3 | 4:5 | 5:4 | 9:16 | 16:9 | 21:9
  --image-size    1K | 2K | 4K
`);
}

const COMMON_FLAGS = new Set(["prompt", "output", "input", "inputs"]);
const OPENAI_FLAGS = new Set(["model", "size", "quality", "background"]);
const GEMINI_FLAGS = new Set(["model", "aspect-ratio", "image-size"]);

const formatEnumError = (flag: string, value: string, allowed: readonly string[]) =>
  `Invalid value for --${flag}: "${value}". Allowed values: ${allowed.join(", ")}`;
const isAllowedEnumValue = (value: string, allowed: readonly string[]) => allowed.includes(value);

const formatUnknownFlagsError = (command: "openai" | "gemini", flags: string[]) =>
  `Unknown flag(s) for ${command}: ${flags.map((flag) => `--${flag}`).join(", ")}`;

const firstValue = (flags: Record<string, string[]>, key: string) => flags[key]?.[0];

const parseInputImages = (flags: Record<string, string[]>) => {
  const input = flags.input ?? [];
  const inputs = flags.inputs ?? [];
  const all = [...input, ...inputs];
  return all.length > 0 ? all : undefined;
};

const allowedFlagsForCommand = (command: "openai" | "gemini") =>
  new Set([...COMMON_FLAGS, ...(command === "openai" ? OPENAI_FLAGS : GEMINI_FLAGS)]);

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) return { mode: "help" };

  const command = argv[0];
  const rest = argv.slice(1);

  if (!command) return { mode: "help" };
  if (command === "--help" || command === "-h") return { mode: "help" };
  if (command !== "openai" && command !== "gemini") {
    return { mode: "help", message: `Unknown command: ${command}` };
  }

  const flags: Record<string, string[]> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token) break;
    if (token === "--help" || token === "-h") return { mode: "help" };
    if (!token.startsWith("--")) {
      return { mode: "help", message: `Unexpected argument: ${token}` };
    }
    const key = token.slice(2);
    const value = rest[i + 1];
    if (!value || value.startsWith("--")) {
      return { mode: "help", message: `Missing value for --${key}` };
    }
    if (!flags[key]) flags[key] = [];
    flags[key].push(value);
    i += 1;
  }

  const allowedFlags = allowedFlagsForCommand(command);
  const unknownFlags = Object.keys(flags).filter((flag) => !allowedFlags.has(flag));
  if (unknownFlags.length > 0) {
    return { mode: "help", message: formatUnknownFlagsError(command, unknownFlags) };
  }

  const prompt = firstValue(flags, "prompt");
  const output_path = firstValue(flags, "output");
  const input_images = parseInputImages(flags);

  if (!prompt || !output_path) {
    return { mode: "help", message: "Missing required --prompt or --output" };
  }

  if (command === "openai") {
    const model = firstValue(flags, "model") ?? "gpt-image-1.5";
    const size = firstValue(flags, "size") ?? "auto";
    const quality = firstValue(flags, "quality") ?? "auto";
    const background = firstValue(flags, "background") ?? "auto";

    if (!isAllowedEnumValue(model, openAIModelSchema.options)) {
      return { mode: "help", message: formatEnumError("model", model, openAIModelSchema.options) };
    }
    if (!isAllowedEnumValue(size, openAISizeSchema.options)) {
      return { mode: "help", message: formatEnumError("size", size, openAISizeSchema.options) };
    }
    if (!isAllowedEnumValue(quality, openAIQualitySchema.options)) {
      return { mode: "help", message: formatEnumError("quality", quality, openAIQualitySchema.options) };
    }
    if (!isAllowedEnumValue(background, openAIBackgroundSchema.options)) {
      return { mode: "help", message: formatEnumError("background", background, openAIBackgroundSchema.options) };
    }

    const validated = openAIParamsSchema.safeParse({
      prompt,
      output_path,
      model,
      input_images,
      size,
      quality,
      background,
    });
    if (!validated.success) {
      return { mode: "help", message: `Invalid OpenAI parameters: ${validated.error.issues[0]?.message ?? "Unknown error"}` };
    }

    const params: OpenAIParams = {
      ...validated.data,
    };
    return { mode: "openai", params };
  }

  const model = firstValue(flags, "model") ?? "gemini-3-pro-image-preview";
  const aspectRatio = firstValue(flags, "aspect-ratio");
  const imageSize = firstValue(flags, "image-size");
  if (!isAllowedEnumValue(model, geminiModelSchema.options)) {
    return { mode: "help", message: formatEnumError("model", model, geminiModelSchema.options) };
  }
  if (aspectRatio && !isAllowedEnumValue(aspectRatio, geminiAspectRatioSchema.options)) {
    return { mode: "help", message: formatEnumError("aspect-ratio", aspectRatio, geminiAspectRatioSchema.options) };
  }
  if (imageSize && !isAllowedEnumValue(imageSize, geminiImageSizeSchema.options)) {
    return { mode: "help", message: formatEnumError("image-size", imageSize, geminiImageSizeSchema.options) };
  }

  const validated = geminiParamsSchema.safeParse({
    prompt,
    output_path,
    model,
    input_images,
    aspect_ratio: aspectRatio,
    image_size: imageSize,
  });
  if (!validated.success) {
    return { mode: "help", message: `Invalid Gemini parameters: ${validated.error.issues[0]?.message ?? "Unknown error"}` };
  }

  const params: GeminiParams = {
    ...validated.data,
  };
  return { mode: "gemini", params };
}

async function run() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.mode === "help") {
    printUsage(parsed.message);
    process.exit(parsed.message ? 1 : 0);
  }

  try {
    const result =
      parsed.mode === "openai"
        ? await generateOpenAIImage(parsed.params)
        : await generateGeminiImage(parsed.params);

    if (!result.ok) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    console.log(JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  await run();
}
