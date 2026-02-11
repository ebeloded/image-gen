import type { GoogleClient } from "./gemini.ts";
import { generateGeminiImage, setGoogleClientForTests } from "./gemini.ts";
import type { OpenAIClient } from "./openai.ts";
import { generateOpenAIImage, setOpenAIClientForTests } from "./openai.ts";

export type { GeminiParams, OpenAIParams } from "./schemas.ts";
export {
  createOpenAIUploadFile,
  getMimeType,
  readImageFile,
  resolveOutputFormat,
  saveImage,
  type GeminiResult,
  type GenerateResult,
  type OpenAIResult,
} from "./core-utils.ts";

export { generateOpenAIImage, generateGeminiImage };

export function setClientsForTests(clients: { openai?: OpenAIClient | null; google?: GoogleClient | null }) {
  if ("openai" in clients) {
    setOpenAIClientForTests(clients.openai ?? null);
  }
  if ("google" in clients) {
    setGoogleClientForTests(clients.google ?? null);
  }
}
