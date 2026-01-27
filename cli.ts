#!/usr/bin/env bun
import {
  generateGeminiImage,
  generateOpenAIImage,
  type GeminiParams,
  type OpenAIParams,
} from "./core.ts";

type ParsedArgs =
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

function parseArgs(argv: string[]): ParsedArgs {
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

  const prompt = flags.prompt?.[0];
  const output_path = flags.output?.[0];
  const input_images = flags.input ?? flags.inputs;

  if (!prompt || !output_path) {
    return { mode: "help", message: "Missing required --prompt or --output" };
  }

  if (command === "openai") {
    const params: OpenAIParams = {
      prompt,
      output_path,
      model: (flags.model?.[0] as OpenAIParams["model"]) ?? "gpt-image-1.5",
      input_images,
      size: (flags.size?.[0] as OpenAIParams["size"]) ?? "auto",
      quality: (flags.quality?.[0] as OpenAIParams["quality"]) ?? "auto",
      background: (flags.background?.[0] as OpenAIParams["background"]) ?? "auto",
    };
    return { mode: "openai", params };
  }

  const params: GeminiParams = {
    prompt,
    output_path,
    model: (flags.model?.[0] as GeminiParams["model"]) ?? "gemini-3-pro-image-preview",
    input_images,
    aspect_ratio: flags["aspect-ratio"]?.[0] as GeminiParams["aspect_ratio"],
    image_size: flags["image-size"]?.[0] as GeminiParams["image_size"],
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

await run();
