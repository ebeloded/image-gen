import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import path from "node:path";
import type { GeminiParams, OpenAIParams } from "./schemas.ts";
export type { GeminiParams, OpenAIParams } from "./schemas.ts";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const OUTPUT_FORMATS = {
  openai: {
    ".png": { format: "png", mimeType: "image/png" },
    ".jpg": { format: "jpeg", mimeType: "image/jpeg" },
    ".jpeg": { format: "jpeg", mimeType: "image/jpeg" },
    ".webp": { format: "webp", mimeType: "image/webp" },
  },
  gemini: {
    ".png": { format: "png", mimeType: "image/png" },
  },
} as const;

type Provider = keyof typeof OUTPUT_FORMATS;
type GenerateResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type OpenAIResult = {
  success: true;
  path: string;
  bytes: number;
  model: OpenAIParams["model"];
  size: OpenAIParams["size"];
  quality: OpenAIParams["quality"];
  input_images_count: number;
};

export type GeminiResult = {
  success: true;
  path: string;
  bytes: number;
  model: GeminiParams["model"];
  aspect_ratio?: GeminiParams["aspect_ratio"];
  image_size?: GeminiParams["image_size"];
  input_images_count: number;
};

export function getMimeType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "image/png";
}

export function createOpenAIUploadFile(imageData: ArrayBuffer, imagePathOrName: string): File {
  return new File([imageData], path.basename(imagePathOrName), { type: getMimeType(imagePathOrName) });
}

export function resolveOutputFormat(provider: Provider, outputPath: string):
  | { ok: true; format: "png" | "jpeg" | "webp"; mimeType: string }
  | { ok: false; error: string } {
  const ext = path.extname(outputPath).toLowerCase();
  const providerFormats = OUTPUT_FORMATS[provider] as Record<string, { format: "png" | "jpeg" | "webp"; mimeType: string }>;
  const resolved = providerFormats[ext];

  if (!resolved) {
    const allowed = Object.keys(providerFormats).join(", ");
    const shown = ext || "(none)";
    return {
      ok: false,
      error: `Unsupported output extension for ${provider}: ${shown}. Allowed extensions: ${allowed}`,
    };
  }

  return { ok: true, ...resolved };
}

export async function readImageFile(imagePath: string): Promise<{ data: ArrayBuffer; name: string } | { error: string }> {
  const file = Bun.file(imagePath);
  if (!(await file.exists())) {
    return { error: `Input image not found: ${imagePath}` };
  }
  return { data: await file.arrayBuffer(), name: path.basename(imagePath) };
}

export async function saveImage(imageData: string, outputPath: string): Promise<{ path: string; bytes: number }> {
  const buffer = Buffer.from(imageData, "base64");
  const resolvedPath = path.resolve(outputPath);
  await Bun.write(resolvedPath, buffer);
  return { path: resolvedPath, bytes: buffer.length };
}

let openaiClient: OpenAI | null = null;
let googleClient: GoogleGenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

function getGoogle(): GoogleGenAI {
  if (!googleClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY or GOOGLE_API_KEY environment variable");
    }
    googleClient = new GoogleGenAI({ apiKey });
  }
  return googleClient;
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

  if (input_images?.length) {
    const imageFiles: File[] = [];
    for (const imagePath of input_images) {
      const result = await readImageFile(imagePath);
      if ("error" in result) {
        return { ok: false, error: result.error };
      }
      imageFiles.push(createOpenAIUploadFile(result.data, imagePath));
    }

    const response = await getOpenAI().images.edit({
      model,
      prompt,
      image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
      size: size === "auto" ? undefined : size,
      background,
      output_format: outputFormat.format,
    } as Parameters<OpenAI["images"]["edit"]>[0]);

    imageData = (response as OpenAI.ImagesResponse).data?.[0]?.b64_json;
  } else {
    const response = await getOpenAI().images.generate({
      model,
      prompt,
      n: 1,
      size: size === "auto" ? undefined : size,
      quality,
      background,
      output_format: outputFormat.format,
    } as Parameters<OpenAI["images"]["generate"]>[0]);

    imageData = (response as OpenAI.ImagesResponse).data?.[0]?.b64_json;
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

  const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: prompt }];

  if (input_images?.length) {
    for (const imagePath of input_images) {
      const result = await readImageFile(imagePath);
      if ("error" in result) {
        return { ok: false, error: result.error };
      }
      contents.push({
        inlineData: {
          mimeType: getMimeType(imagePath),
          data: Buffer.from(result.data).toString("base64"),
        },
      });
    }
  }

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
