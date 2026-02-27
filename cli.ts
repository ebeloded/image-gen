#!/usr/bin/env bun
import tty from "node:tty";
import { getGeminiApiKey, getGrokApiKey, getOpenAIApiKey } from "./config.ts";
import {
  generateGeminiImage,
  generateGrokImage,
  generateOpenAIImage,
} from "./core.ts";
import { setKey, getKey, deleteKey, listKeys, configFilePath, type KeyProvider } from "./keys.ts";
import {
  buildCliUsageText,
  commonFlags,
  knownFlagsFor,
  providerSpecs,
  shortAliasToFlag,
  type Provider,
} from "./metadata.ts";
import {
  geminiAspectRatioSchema,
  geminiImageSizeSchema,
  geminiModelSchema,
  geminiParamsSchema,
  grokAspectRatioSchema,
  grokModelSchema,
  grokParamsSchema,
  grokResolutionSchema,
  openAIBackgroundSchema,
  openAIModelSchema,
  openAIParamsSchema,
  openAIQualitySchema,
  openAISizeSchema,
  type GeminiParams,
  type GrokParams,
  type OpenAIParams,
} from "./schemas.ts";

export type ParsedArgs =
  | { mode: "openai"; params: OpenAIParams }
  | { mode: "gemini"; params: GeminiParams }
  | { mode: "grok"; params: GrokParams }
  | { mode: "keys"; action: "list" | "set" | "get" | "delete"; provider?: KeyProvider; value?: string }
  | { mode: "help"; message?: string };

type ParseState = {
  values: Map<string, string[]>;
  positionals: string[];
};

const SHORT_ALIASES = shortAliasToFlag();

function printUsage(message?: string) {
  if (message) {
    console.error(message);
  }
  const write = message ? console.error : console.log;
  const keyStatus = {
    openai: !!getOpenAIApiKey(),
    gemini: !!getGeminiApiKey(),
    grok: !!getGrokApiKey(),
  };
  write(buildCliUsageText(keyStatus));
}

const formatEnumError = (flag: string, value: string, allowed: readonly string[]) =>
  `Invalid value for --${flag}: "${value}". Allowed values: ${allowed.join(", ")}`;
const isAllowedEnumValue = <T extends string>(value: string, allowed: readonly T[]): value is T => allowed.includes(value as T);

function levenshteinDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0]![j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }

  return dp[a.length]![b.length]!;
}

function suggestFlag(flag: string, knownFlags: readonly string[]): string | undefined {
  let best: { flag: string; distance: number } | undefined;

  for (const knownFlag of knownFlags) {
    const distance = levenshteinDistance(flag, knownFlag);
    if (!best || distance < best.distance) {
      best = { flag: knownFlag, distance };
    }
  }

  if (!best || best.distance > 3) return undefined;
  return best.flag;
}

function formatUnknownFlagsError(command: Provider, unknownFlags: string[], knownFlags: readonly string[]) {
  const parts = unknownFlags.map((rawFlag) => {
    const clean = rawFlag.replace(/^-+/, "");
    const suggestion = suggestFlag(clean, knownFlags);
    return suggestion ? `${rawFlag} (did you mean --${suggestion}?)` : rawFlag;
  });

  return `Unknown flag(s) for ${command}: ${parts.join(", ")}`;
}

function splitLongFlag(token: string): { flag: string; inlineValue?: string } {
  const equalsIndex = token.indexOf("=");
  if (equalsIndex === -1) {
    return { flag: token.slice(2) };
  }

  return {
    flag: token.slice(2, equalsIndex),
    inlineValue: token.slice(equalsIndex + 1),
  };
}

function pushValue(state: ParseState, key: string, value: string) {
  const existing = state.values.get(key);
  if (existing) {
    existing.push(value);
    return;
  }
  state.values.set(key, [value]);
}

function parseInputValues(values: string[]): string[] {
  return values
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function isLikelyAnotherFlag(token: string, knownFlags: Set<string>): boolean {
  if (token === "--help" || token === "-h") return true;
  if (token.startsWith("--")) {
    const { flag } = splitLongFlag(token);
    return knownFlags.has(flag);
  }
  return token.length === 2 && token.startsWith("-") && token in SHORT_ALIASES;
}

function parseCommandArgs(command: Provider, args: string[]): ParsedArgs | { state: ParseState } {
  const knownFlagNames = knownFlagsFor(command);
  const knownFlags = new Set(knownFlagNames);
  const state: ParseState = { values: new Map(), positionals: [] };
  const unknownFlags: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token) continue;

    if (token === "--help" || token === "-h") {
      return { mode: "help" };
    }

    if (token === "--") {
      state.positionals.push(...args.slice(i + 1));
      break;
    }

    if (token.startsWith("--")) {
      const { flag, inlineValue } = splitLongFlag(token);
      if (!flag) {
        return { mode: "help", message: `Unexpected argument: ${token}` };
      }

      if (!knownFlags.has(flag)) {
        unknownFlags.push(`--${flag}`);
        continue;
      }

      let value = inlineValue;
      if (value === undefined) {
        value = args[i + 1];
        if (value === undefined || isLikelyAnotherFlag(value, knownFlags)) {
          return { mode: "help", message: `Missing value for --${flag}` };
        }
        i += 1;
      }

      pushValue(state, flag, value);
      continue;
    }

    if (token.startsWith("-") && token.length === 2) {
      const alias = SHORT_ALIASES[token];
      if (!alias) {
        unknownFlags.push(token);
        continue;
      }

      if (alias === "help") {
        return { mode: "help" };
      }

      if (!knownFlags.has(alias)) {
        unknownFlags.push(token);
        continue;
      }

      const value = args[i + 1];
      if (value === undefined || isLikelyAnotherFlag(value, knownFlags)) {
        return { mode: "help", message: `Missing value for --${alias}` };
      }
      i += 1;
      pushValue(state, alias, value);
      continue;
    }

    state.positionals.push(token);
  }

  if (unknownFlags.length > 0) {
    return {
      mode: "help",
      message: formatUnknownFlagsError(command, [...new Set(unknownFlags)], knownFlagNames),
    };
  }

  return { state };
}

function lastValue(state: ParseState, key: string): string | undefined {
  return state.values.get(key)?.at(-1);
}

function toPrompt(state: ParseState): string | undefined {
  const promptFromFlag = lastValue(state, "prompt");
  if (promptFromFlag !== undefined) {
    const trimmed = promptFromFlag.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  const positionalPrompt = state.positionals.join(" ").trim();
  return positionalPrompt.length > 0 ? positionalPrompt : undefined;
}

function formatSchemaError(messagePrefix: string, issue: { message: string }): string {
  return `${messagePrefix}: ${issue.message || "Unknown error"}`;
}

function parseOpenAIArgs(state: ParseState): ParsedArgs {
  const prompt = toPrompt(state);
  const output_path = lastValue(state, "output")?.trim();
  const rawInputImages = state.values.get("input") ?? [];
  const parsedInputImages = parseInputValues(rawInputImages);
  const input_images = parsedInputImages.length > 0 ? parsedInputImages : undefined;

  if (!prompt || !output_path) {
    return { mode: "help", message: "Missing required --prompt or --output" };
  }

  const model = lastValue(state, "model");
  const size = lastValue(state, "size");
  const quality = lastValue(state, "quality");
  const background = lastValue(state, "background");

  if (model !== undefined && !isAllowedEnumValue(model, openAIModelSchema.options)) {
    return { mode: "help", message: formatEnumError("model", model, openAIModelSchema.options) };
  }
  if (size !== undefined && !isAllowedEnumValue(size, openAISizeSchema.options)) {
    return { mode: "help", message: formatEnumError("size", size, openAISizeSchema.options) };
  }
  if (quality !== undefined && !isAllowedEnumValue(quality, openAIQualitySchema.options)) {
    return { mode: "help", message: formatEnumError("quality", quality, openAIQualitySchema.options) };
  }
  if (background !== undefined && !isAllowedEnumValue(background, openAIBackgroundSchema.options)) {
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
    return {
      mode: "help",
      message: formatSchemaError("Invalid OpenAI parameters", validated.error.issues[0] ?? { message: "Unknown error" }),
    };
  }

  return { mode: "openai", params: validated.data };
}

function parseGeminiArgs(state: ParseState): ParsedArgs {
  const prompt = toPrompt(state);
  const output_path = lastValue(state, "output")?.trim();
  const rawInputImages = state.values.get("input") ?? [];
  const parsedInputImages = parseInputValues(rawInputImages);
  const input_images = parsedInputImages.length > 0 ? parsedInputImages : undefined;

  if (!prompt || !output_path) {
    return { mode: "help", message: "Missing required --prompt or --output" };
  }

  const model = lastValue(state, "model");
  const aspectRatio = lastValue(state, "aspect-ratio");
  const imageSize = lastValue(state, "image-size");

  if (model !== undefined && !isAllowedEnumValue(model, geminiModelSchema.options)) {
    return { mode: "help", message: formatEnumError("model", model, geminiModelSchema.options) };
  }
  if (aspectRatio !== undefined && !isAllowedEnumValue(aspectRatio, geminiAspectRatioSchema.options)) {
    return { mode: "help", message: formatEnumError("aspect-ratio", aspectRatio, geminiAspectRatioSchema.options) };
  }
  if (imageSize !== undefined && !isAllowedEnumValue(imageSize, geminiImageSizeSchema.options)) {
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
    return {
      mode: "help",
      message: formatSchemaError("Invalid Gemini parameters", validated.error.issues[0] ?? { message: "Unknown error" }),
    };
  }

  return { mode: "gemini", params: validated.data };
}

function parseGrokArgs(state: ParseState): ParsedArgs {
  const prompt = toPrompt(state);
  const output_path = lastValue(state, "output")?.trim();
  const rawInputImages = state.values.get("input") ?? [];
  const parsedInputImages = parseInputValues(rawInputImages);
  const input_images = parsedInputImages.length > 0 ? parsedInputImages : undefined;

  if (!prompt || !output_path) {
    return { mode: "help", message: "Missing required --prompt or --output" };
  }

  const model = lastValue(state, "model");
  const aspectRatio = lastValue(state, "aspect-ratio");
  const resolution = lastValue(state, "resolution");

  if (model !== undefined && !isAllowedEnumValue(model, grokModelSchema.options)) {
    return { mode: "help", message: formatEnumError("model", model, grokModelSchema.options) };
  }
  if (aspectRatio !== undefined && !isAllowedEnumValue(aspectRatio, grokAspectRatioSchema.options)) {
    return { mode: "help", message: formatEnumError("aspect-ratio", aspectRatio, grokAspectRatioSchema.options) };
  }
  if (resolution !== undefined && !isAllowedEnumValue(resolution, grokResolutionSchema.options)) {
    return { mode: "help", message: formatEnumError("resolution", resolution, grokResolutionSchema.options) };
  }

  const validated = grokParamsSchema.safeParse({
    prompt,
    output_path,
    model,
    input_images,
    aspect_ratio: aspectRatio,
    resolution,
  });

  if (!validated.success) {
    return {
      mode: "help",
      message: formatSchemaError("Invalid Grok parameters", validated.error.issues[0] ?? { message: "Unknown error" }),
    };
  }

  return { mode: "grok", params: validated.data };
}

const VALID_KEY_PROVIDERS: KeyProvider[] = ["openai", "gemini", "grok"];

function isKeyProvider(value: string): value is KeyProvider {
  return VALID_KEY_PROVIDERS.includes(value as KeyProvider);
}

function parseKeysArgs(rest: string[]): ParsedArgs {
  if (rest.length === 0 || rest[0] === "list") {
    return { mode: "keys", action: "list" };
  }

  const subcommand = rest[0]!;
  if (subcommand !== "set" && subcommand !== "get" && subcommand !== "delete") {
    return { mode: "help", message: `Unknown keys subcommand: ${subcommand}. Use list, set, get, or delete` };
  }

  const provider = rest[1];
  if (!provider) {
    return { mode: "help", message: `Missing provider for 'keys ${subcommand}'. Allowed: openai, gemini, grok` };
  }

  if (!isKeyProvider(provider)) {
    return { mode: "help", message: `Unknown provider: "${provider}". Allowed: openai, gemini, grok` };
  }

  if (subcommand === "set") {
    const value = rest[2];
    return { mode: "keys", action: "set", provider, value };
  }

  return { mode: "keys", action: subcommand, provider };
}

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) return { mode: "help" };

  const command = argv[0];
  const rest = argv.slice(1);

  if (!command) return { mode: "help" };
  if (command === "--help" || command === "-h") return { mode: "help" };
  if (command !== "openai" && command !== "gemini" && command !== "grok" && command !== "keys") {
    return { mode: "help", message: `Unknown command: ${command}` };
  }

  if (command === "keys") return parseKeysArgs(rest);

  const parsed = parseCommandArgs(command, rest);
  if ("mode" in parsed) {
    return parsed;
  }

  return command === "openai"
    ? parseOpenAIArgs(parsed.state)
    : command === "gemini"
    ? parseGeminiArgs(parsed.state)
    : parseGrokArgs(parsed.state);
}

function hasPromptArg(argv: string[]): boolean {
  const promptLong = commonFlags.find((flag) => flag.name === "prompt");
  const promptShort = promptLong?.short;
  return argv.some((token) => token === "--prompt" || token.startsWith("--prompt=") || token === promptShort);
}

async function runKeysCommand(parsed: Extract<ParsedArgs, { mode: "keys" }>): Promise<void> {
  if (parsed.action === "list") {
    listKeys();
    return;
  }

  if (parsed.action === "set") {
    let value = parsed.value;
    if (value === undefined) {
      value = (await Bun.stdin.text()).trim();
      if (!value) {
        console.error("Error: no key provided (pass as argument or pipe via stdin)");
        process.exit(1);
      }
    }
    await setKey(parsed.provider!, value);
    console.log(`${parsed.provider!} key saved to ${configFilePath()}`);
    return;
  }

  if (parsed.action === "get") {
    const value = getKey(parsed.provider!);
    if (value !== undefined) {
      console.log(value);
    } else {
      console.error(`No ${parsed.provider!} key found in config`);
      process.exit(1);
    }
    return;
  }

  if (parsed.action === "delete") {
    const removed = await deleteKey(parsed.provider!);
    if (removed) {
      console.log(`${parsed.provider!} key removed from ${configFilePath()}`);
    } else {
      console.error(`No ${parsed.provider!} key found in config`);
      process.exit(1);
    }
    return;
  }
}

async function run() {
  const argv = process.argv.slice(2);
  let parsed = parseArgs(argv);

  const isMissingPromptOrOutput = parsed.mode === "help" && parsed.message === "Missing required --prompt or --output";
  const promptPassedInArgs = hasPromptArg(argv);
  const stdinIsTTY = tty.isatty(0);

  if (isMissingPromptOrOutput && !promptPassedInArgs && !stdinIsTTY) {
    const promptFromStdin = (await Bun.stdin.text()).trim();
    if (promptFromStdin) {
      const command = argv[0];
      if (command === "openai" || command === "gemini" || command === "grok") {
        parsed = parseArgs([command, "--prompt", promptFromStdin, ...argv.slice(1)]);
      }
    }
  }

  if (parsed.mode === "keys") {
    await runKeysCommand(parsed);
    return;
  }

  if (parsed.mode === "help") {
    printUsage(parsed.message);
    process.exit(parsed.message ? 1 : 0);
  }

  try {
    const result =
      parsed.mode === "openai"
        ? await generateOpenAIImage(parsed.params)
        : parsed.mode === "gemini"
        ? await generateGeminiImage(parsed.params)
        : await generateGrokImage(parsed.params);

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
