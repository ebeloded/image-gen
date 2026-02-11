#!/usr/bin/env bun
import { Command, CommanderError } from "commander";
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

const formatEnumError = (flag: string, value: string, allowed: readonly string[]) =>
  `Invalid value for --${flag}: "${value}". Allowed values: ${allowed.join(", ")}`;
const isAllowedEnumValue = (value: string, allowed: readonly string[]) => allowed.includes(value);

const formatUnknownFlagsError = (command: "openai" | "gemini", flags: string[]) =>
  `Unknown flag(s) for ${command}: ${flags.map((flag) => `--${flag}`).join(", ")}`;

const collectRepeatedOption = (value: string, previous: string[] = []) => [...previous, value];
const uniqueInOrder = (values: string[]) => [...new Set(values)];

const parseInputImages = (input: string[] | undefined, inputs: string[] | undefined) => {
  const all = [...(input ?? []), ...(inputs ?? [])];
  return all.length > 0 ? all : undefined;
};

function createProgram() {
  const configure = (command: Command) =>
    command
      .allowUnknownOption(true)
      .allowExcessArguments(true)
      .exitOverride()
      .configureOutput({
        writeOut: () => undefined,
        writeErr: () => undefined,
        outputError: () => undefined,
      });

  const program = configure(new Command("images-mcp"))
    .helpCommand(false)
    .addHelpCommand(false);

  const openai = configure(new Command("openai"))
    .option("--prompt <text>")
    .option("--output <path>")
    .option("--input <path>", "Input image path", collectRepeatedOption, [])
    .option("--inputs <path>", "Backward-compatible alias for --input", collectRepeatedOption, [])
    .option("--model <model>")
    .option("--size <size>")
    .option("--quality <quality>")
    .option("--background <background>");

  const gemini = configure(new Command("gemini"))
    .option("--prompt <text>")
    .option("--output <path>")
    .option("--input <path>", "Input image path", collectRepeatedOption, [])
    .option("--inputs <path>", "Backward-compatible alias for --input", collectRepeatedOption, [])
    .option("--model <model>")
    .option("--aspect-ratio <ratio>")
    .option("--image-size <size>");

  program.addCommand(openai);
  program.addCommand(gemini);

  return program;
}

function structuralErrorForArgs(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token) break;
    if (token === "--help" || token === "-h") return undefined;
    if (!token.startsWith("--")) return `Unexpected argument: ${token}`;

    const key = token.slice(2);
    const value = args[i + 1];
    if (!value || value.startsWith("--")) return `Missing value for --${key}`;
    i += 1;
  }
}

type ParsedCommandOptions = {
  opts: Record<string, unknown>;
  operands: string[];
  unknownFlags: string[];
};

function parseCommandOptions(commandName: "openai" | "gemini", args: string[]): ParsedCommandOptions | ParsedArgs {
  const program = createProgram();
  const command = program.commands.find((candidate) => candidate.name() === commandName);
  if (!command) return { mode: "help", message: `Unknown command: ${commandName}` };

  try {
    const parsed = command.parseOptions(args);
    const unknownFlags = uniqueInOrder(
      parsed.unknown
        .filter((token) => token.startsWith("--"))
        .map((flag) => flag.slice(2)),
    );
    return {
      opts: command.opts<Record<string, unknown>>(),
      operands: parsed.operands,
      unknownFlags,
    };
  } catch (error) {
    if (error instanceof CommanderError && error.code === "commander.optionMissingArgument") {
      const flag = error.message.match(/--([a-z-]+)/)?.[1];
      if (flag) return { mode: "help", message: `Missing value for --${flag}` };
      return { mode: "help", message: "Missing value for option" };
    }
    return { mode: "help", message: error instanceof Error ? error.message : String(error) };
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) return { mode: "help" };

  const command = argv[0];
  const rest = argv.slice(1);

  if (!command) return { mode: "help" };
  if (command === "--help" || command === "-h") return { mode: "help" };
  if (command !== "openai" && command !== "gemini") {
    return { mode: "help", message: `Unknown command: ${command}` };
  }

  const structuralError = structuralErrorForArgs(rest);
  if (rest.includes("--help") || rest.includes("-h")) return { mode: "help" };
  if (structuralError) {
    return { mode: "help", message: structuralError };
  }

  const parsed = parseCommandOptions(command, rest);
  if ("mode" in parsed) return parsed;

  if (parsed.operands.length > 0) {
    return { mode: "help", message: `Unexpected argument: ${parsed.operands[0]}` };
  }

  if (parsed.unknownFlags.length > 0) {
    return { mode: "help", message: formatUnknownFlagsError(command, parsed.unknownFlags) };
  }

  const prompt = typeof parsed.opts.prompt === "string" ? parsed.opts.prompt : undefined;
  const output_path = typeof parsed.opts.output === "string" ? parsed.opts.output : undefined;
  const input_images = parseInputImages(
    Array.isArray(parsed.opts.input) ? parsed.opts.input as string[] : undefined,
    Array.isArray(parsed.opts.inputs) ? parsed.opts.inputs as string[] : undefined,
  );

  if (!prompt || !output_path) {
    return { mode: "help", message: "Missing required --prompt or --output" };
  }

  if (command === "openai") {
    const model = typeof parsed.opts.model === "string" ? parsed.opts.model : "gpt-image-1.5";
    const size = typeof parsed.opts.size === "string" ? parsed.opts.size : "auto";
    const quality = typeof parsed.opts.quality === "string" ? parsed.opts.quality : "auto";
    const background = typeof parsed.opts.background === "string" ? parsed.opts.background : "auto";

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

  const model = typeof parsed.opts.model === "string" ? parsed.opts.model : "gemini-3-pro-image-preview";
  const aspectRatio = typeof parsed.opts.aspectRatio === "string" ? parsed.opts.aspectRatio : undefined;
  const imageSize = typeof parsed.opts.imageSize === "string" ? parsed.opts.imageSize : undefined;
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
