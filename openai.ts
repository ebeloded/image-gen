import OpenAI from "openai";
import { getOpenAIApiKey } from "./config.ts";
import type { OpenAIParams } from "./schemas.ts";
import {
  type GenerateResult,
  type OpenAIResult,
  loadInputImages,
  resolveOutputFormat,
  saveImage,
  toOpenAIUploadFiles,
} from "./core-utils.ts";

export type OpenAIClient = {
  images: {
    edit: (params: Parameters<OpenAI["images"]["edit"]>[0]) => Promise<{ data?: Array<{ b64_json?: string }> }>;
    generate: (params: Parameters<OpenAI["images"]["generate"]>[0]) => Promise<{ data?: Array<{ b64_json?: string }> }>;
  };
};

let openaiClient: OpenAIClient | null = null;

export function setOpenAIClientForTests(client: OpenAIClient | null) {
  openaiClient = client;
}

function getOpenAI(): OpenAIClient {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: getOpenAIApiKey() }) as OpenAIClient;
  }
  return openaiClient;
}

export async function generateOpenAIImage({
  prompt,
  output_path,
  model,
  input_images,
  size,
  quality,
  background,
}: OpenAIParams): Promise<GenerateResult<OpenAIResult>> {
  const outputFormat = resolveOutputFormat("openai", output_path);
  if (!outputFormat.ok) {
    return { ok: false, error: outputFormat.error };
  }

  let imageData: string | undefined;

  const loadedImages = await loadInputImages(input_images);
  if (!loadedImages.ok) {
    return loadedImages;
  }
  const imageFiles = toOpenAIUploadFiles(loadedImages.data);

  if (imageFiles.length > 0) {
    const imagePayload = imageFiles.length === 1 ? imageFiles[0]! : imageFiles;
    const response = await getOpenAI().images.edit({
      model,
      prompt,
      image: imagePayload,
      size: size === "auto" ? undefined : size,
      background,
      output_format: outputFormat.format,
    });

    imageData = response.data?.[0]?.b64_json;
  } else {
    const response = await getOpenAI().images.generate({
      model,
      prompt,
      n: 1,
      size: size === "auto" ? undefined : size,
      quality,
      background,
      output_format: outputFormat.format,
    });

    imageData = response.data?.[0]?.b64_json;
  }

  if (!imageData) {
    return { ok: false, error: "No image data received from OpenAI" };
  }

  const saved = await saveImage(imageData, output_path);
  return {
    ok: true,
    data: {
      success: true,
      ...saved,
      model,
      size,
      quality,
      input_images_count: input_images?.length ?? 0,
    },
  };
}
