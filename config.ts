import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type ConfigFile = {
  openai_api_key?: string;
  gemini_api_key?: string;
  xai_api_key?: string;
};

function tryReadConfigFile(path: string): ConfigFile | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ConfigFile;
  } catch {
    return null;
  }
}

function loadConfig(): ConfigFile {
  return (
    tryReadConfigFile(join(process.cwd(), ".image-gen.json")) ??
    tryReadConfigFile(join(homedir(), ".image-gen.json")) ??
    {}
  );
}

let cachedConfig: ConfigFile | null = null;

function getConfig(): ConfigFile {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function getOpenAIApiKey(): string | undefined {
  return getConfig().openai_api_key ?? process.env.OPENAI_API_KEY;
}

export function getGeminiApiKey(): string | undefined {
  return getConfig().gemini_api_key ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
}

export function getGrokApiKey(): string | undefined {
  return getConfig().xai_api_key ?? process.env.XAI_API_KEY;
}
