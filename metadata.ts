import { homedir } from "node:os";
import { join } from "node:path";
import {
  geminiAspectRatioSchema,
  geminiImageSizeSchema,
  geminiModelSchema,
  grokAspectRatioSchema,
  grokModelSchema,
  grokResolutionSchema,
  openAIBackgroundSchema,
  openAIModelSchema,
  openAIQualitySchema,
  openAISizeSchema,
  sharedDescriptions,
} from "./schemas.ts";

export type Provider = "openai" | "gemini" | "grok";

type FlagSpec = {
  name: string;
  short?: string;
  description: string;
  required?: boolean;
  repeatable?: boolean;
  boolean?: boolean;
  defaultValue?: string;
  allowedValues?: readonly string[];
};

type ProviderSpec = {
  command: Provider;
  summary: string;
  outputExtensions: readonly string[];
  flags: readonly FlagSpec[];
};

export const commonFlags: readonly FlagSpec[] = [
  {
    name: "prompt",
    short: "-p",
    description: `${sharedDescriptions.prompt} (can be read from stdin or positionals when omitted)`,
    required: true,
  },
  {
    name: "output",
    short: "-o",
    description: sharedDescriptions.outputPath,
    required: true,
  },
  {
    name: "input",
    short: "-i",
    description: `${sharedDescriptions.inputImages}; repeatable and comma-separated values are supported`,
    repeatable: true,
  },
  {
    name: "force",
    short: "-f",
    description: "Overwrite output file if it already exists",
    boolean: true,
  },
] as const;

export const providerSpecs: Record<Provider, ProviderSpec> = {
  grok: {
    command: "grok",
    summary: "Generate/edit via xAI Grok",
    outputExtensions: [".jpg", ".jpeg"],
    flags: [
      {
        name: "model",
        description: "Model",
        defaultValue: "grok-2-image",
        allowedValues: grokModelSchema.options,
      },
      {
        name: "aspect-ratio",
        description: "Aspect ratio",
        allowedValues: grokAspectRatioSchema.options,
      },
      {
        name: "resolution",
        description: "Image resolution",
        allowedValues: grokResolutionSchema.options,
      },
    ],
  },
  openai: {
    command: "openai",
    summary: "Generate/edit via OpenAI",
    outputExtensions: [".png", ".jpg", ".jpeg", ".webp"],
    flags: [
      {
        name: "model",
        description: "Model",
        defaultValue: "gpt-image-2",
        allowedValues: openAIModelSchema.options,
      },
      {
        name: "size",
        description: "Image size",
        defaultValue: "auto",
        allowedValues: openAISizeSchema.options,
      },
      {
        name: "quality",
        description: "Image quality",
        defaultValue: "auto",
        allowedValues: openAIQualitySchema.options,
      },
      {
        name: "background",
        description: "Background type",
        defaultValue: "auto",
        allowedValues: openAIBackgroundSchema.options,
      },
    ],
  },
  gemini: {
    command: "gemini",
    summary: "Generate/edit via Gemini",
    outputExtensions: [".png"],
    flags: [
      {
        name: "model",
        description: "Model",
        defaultValue: "gemini-3-pro-image-preview",
        allowedValues: geminiModelSchema.options,
      },
      {
        name: "aspect-ratio",
        description: "Aspect ratio",
        allowedValues: geminiAspectRatioSchema.options,
      },
      {
        name: "image-size",
        description: "Image size",
        allowedValues: geminiImageSizeSchema.options,
      },
    ],
  },
} as const;

export const providerOrder: readonly Provider[] = ["openai", "gemini", "grok"] as const;

export function knownFlagsFor(provider: Provider): readonly string[] {
  return [...commonFlags.map((flag) => flag.name), ...providerSpecs[provider].flags.map((flag) => flag.name)] as const;
}

export function shortAliasToFlag(): Record<string, string> {
  const aliases: Record<string, string> = { "-h": "help" };

  for (const flag of commonFlags) {
    if (flag.short) {
      aliases[flag.short] = flag.name;
    }
  }

  for (const provider of providerOrder) {
    for (const flag of providerSpecs[provider].flags) {
      if (flag.short && !(flag.short in aliases)) {
        aliases[flag.short] = flag.name;
      }
    }
  }

  return aliases;
}

function usageLineForFlag(flag: FlagSpec): string {
  const aliases = flag.short ? `--${flag.name}, ${flag.short}` : `--${flag.name}`;
  const required = flag.required ? "required" : "optional";
  const repeatable = flag.repeatable ? "; repeatable" : "";
  const defaultText = flag.defaultValue ? `; default: ${flag.defaultValue}` : "";
  const valuesText = flag.allowedValues ? `; values: ${flag.allowedValues.join(" | ")}` : "";
  return `  ${aliases.padEnd(20)} ${flag.description} (${required}${repeatable}${defaultText}${valuesText})`;
}

export function buildCliUsageText(keyStatus?: Partial<Record<Provider, boolean>>): string {
  const lines: string[] = [
    "image-gen (CLI)",
    "",
    "Usage:",
  ];

  for (const provider of providerOrder) {
    const spec = providerSpecs[provider];
    const keyIndicator =
      keyStatus === undefined ? "" : keyStatus[provider] ? "  [key: ✓]" : "  [key: ✗]";
    lines.push(`  image-gen ${provider}  [args]  ${spec.summary}${keyIndicator}`);
  }

  lines.push("", "Common args:");
  for (const flag of commonFlags) {
    lines.push(usageLineForFlag(flag));
  }

  for (const provider of providerOrder) {
    const spec = providerSpecs[provider];
    lines.push("", `${provider.charAt(0).toUpperCase() + provider.slice(1)} args:`);
    for (const flag of spec.flags) {
      lines.push(usageLineForFlag(flag));
    }
    lines.push(`  output extensions     ${spec.outputExtensions.join(", ")}`);
  }

  lines.push(
    "",
    "Permissive input styles:",
    "  --flag value, --flag=value, short aliases (-p/-o/-i), and positional prompt fallback"
  );

  lines.push(
    "",
    "Key management:",
    "  image-gen keys [list]                Show all API key statuses",
    "  image-gen keys set <provider> [key]  Set a key (reads stdin if key omitted)",
    "  image-gen keys get <provider>        Print key value",
    "  image-gen keys delete <provider>     Remove a key",
    "  providers: openai, gemini, grok",
    `  config: ${join(homedir(), ".config", "image-gen", "config.json")}`,
  );

  return `${lines.join("\n")}\n`;
}
