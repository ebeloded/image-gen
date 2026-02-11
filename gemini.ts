import { GoogleGenAI } from "@google/genai";
import type { GeminiParams } from "./schemas.ts";
import {
  type GeminiResult,
  type GenerateResult,
  loadInputImages,
  resolveOutputFormat,
  saveImage,
  toGeminiInlineParts,
} from "./core-utils.ts";

export type GoogleClient = {
  models: {
    generateContent: (params: {
      model: string;
      contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
      config: { responseModalities: string[]; imageConfig?: { aspectRatio?: string; imageSize?: string } };
    }) => Promise<{
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { data?: string } }> } }>;
    }>;
  };
};

let googleClient: GoogleClient | null = null;

export function setGoogleClientForTests(client: GoogleClient | null) {
  googleClient = client;
}

function getGoogle(): GoogleClient {
  if (!googleClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY or GOOGLE_API_KEY environment variable");
    }
    googleClient = new GoogleGenAI({ apiKey }) as GoogleClient;
  }
  return googleClient;
}

export async function generateGeminiImage({
  prompt,
  output_path,
  model,
  input_images,
  aspect_ratio,
  image_size,
}: GeminiParams): Promise<GenerateResult<GeminiResult>> {
  const outputFormat = resolveOutputFormat("gemini", output_path);
  if (!outputFormat.ok) {
    return { ok: false, error: outputFormat.error };
  }

  const loadedImages = await loadInputImages(input_images);
  if (!loadedImages.ok) {
    return loadedImages;
  }
  const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt },
    ...toGeminiInlineParts(loadedImages.data),
  ];

  const config: { responseModalities: string[]; imageConfig?: { aspectRatio?: string; imageSize?: string } } = {
    responseModalities: ["IMAGE", "TEXT"],
  };

  if (aspect_ratio || image_size) {
    config.imageConfig = {
      ...(aspect_ratio && { aspectRatio: aspect_ratio }),
      ...(image_size && { imageSize: image_size }),
    };
  }

  const response = await getGoogle().models.generateContent({ model, contents, config });
  const parts = response.candidates?.[0]?.content?.parts;
  const imagePart = parts?.find((part) => part.inlineData?.data);

  if (!imagePart?.inlineData?.data) {
    const textPart = parts?.find((part) => part.text);
    return { ok: false, error: textPart?.text || "No image data received from Google" };
  }

  const saved = await saveImage(imagePart.inlineData.data, output_path);
  return {
    ok: true,
    data: {
      success: true,
      ...saved,
      model,
      aspect_ratio,
      image_size,
      input_images_count: input_images?.length ?? 0,
    },
  };
}
