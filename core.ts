import type { GoogleClient } from "./gemini.ts";
import { generateGeminiImage, setGoogleClientForTests } from "./gemini.ts";
import type { GrokClient } from "./grok.ts";
import { generateGrokImage, setGrokClientForTests } from "./grok.ts";
import type { OpenAIClient } from "./openai.ts";
import { generateOpenAIImage, setOpenAIClientForTests } from "./openai.ts";

export type { GeminiParams, GrokParams, OpenAIParams } from "./schemas.ts";
export {
  createOpenAIUploadFile,
  getMimeType,
  readImageFile,
  resolveOutputFormat,
  saveImage,
  type GeminiResult,
  type GenerateResult,
  type GrokResult,
  type OpenAIResult,
} from "./core-utils.ts";

export { generateGeminiImage, generateGrokImage, generateOpenAIImage };

export function setClientsForTests(clients: { openai?: OpenAIClient | null; google?: GoogleClient | null; grok?: GrokClient | null }) {
  if ("openai" in clients) {
    setOpenAIClientForTests(clients.openai ?? null);
  }
  if ("google" in clients) {
    setGoogleClientForTests(clients.google ?? null);
  }
  if ("grok" in clients) {
    setGrokClientForTests(clients.grok ?? null);
  }
}
