import { mkdirSync, readFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type ConfigFile = {
  openai_api_key?: string;
  gemini_api_key?: string;
  xai_api_key?: string;
};

export type KeyProvider = "openai" | "gemini" | "grok";

const CONFIG_PATH = join(homedir(), ".config", "image-gen", "config.json");

const PROVIDER_TO_KEY: Record<KeyProvider, keyof ConfigFile> = {
  openai: "openai_api_key",
  gemini: "gemini_api_key",
  grok: "xai_api_key",
};

const PROVIDER_ENV_VARS: Record<KeyProvider, string[]> = {
  openai: ["OPENAI_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  grok: ["XAI_API_KEY"],
};

const PROVIDER_ORDER: KeyProvider[] = ["openai", "gemini", "grok"];

export function configFilePath(): string {
  return CONFIG_PATH;
}

function readConfigFile(): ConfigFile {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as ConfigFile;
  } catch {
    return {};
  }
}

async function writeConfigFile(config: ConfigFile): Promise<void> {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  const tmpPath = CONFIG_PATH + ".tmp";
  await Bun.write(tmpPath, JSON.stringify(config, null, 2));
  renameSync(tmpPath, CONFIG_PATH);
}

function maskKey(key: string): string {
  if (key.length > 8) {
    return key.slice(0, 4) + "..." + key.slice(-4);
  }
  return "***";
}

export async function setKey(provider: KeyProvider, value: string): Promise<void> {
  const config = readConfigFile();
  config[PROVIDER_TO_KEY[provider]] = value;
  await writeConfigFile(config);
}

export function getKey(provider: KeyProvider): string | undefined {
  const config = readConfigFile();
  return config[PROVIDER_TO_KEY[provider]];
}

export async function deleteKey(provider: KeyProvider): Promise<boolean> {
  const config = readConfigFile();
  const key = PROVIDER_TO_KEY[provider];
  if (config[key] === undefined) {
    return false;
  }
  delete config[key];
  await writeConfigFile(config);
  return true;
}

export function listKeys(): void {
  console.log(`API Keys  (~/.config/image-gen/config.json)\n`);

  for (const provider of PROVIDER_ORDER) {
    const config = readConfigFile();
    const configKey = PROVIDER_TO_KEY[provider];
    const configValue = config[configKey];
    const envVars = PROVIDER_ENV_VARS[provider];

    const parts: string[] = [];

    if (configValue) {
      parts.push(`${maskKey(configValue)}  [config]`);
    }

    for (const envVar of envVars) {
      if (process.env[envVar]) {
        parts.push(`[env: ${envVar}]`);
      }
    }

    const status = parts.length > 0 ? parts.join("  ") : "(not set)";
    console.log(`  ${provider.padEnd(9)}${status}`);
  }
}
