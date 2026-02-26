import path from "node:path";
import type { GeminiParams, GrokParams, OpenAIParams } from "./schemas.ts";

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
  grok: {
    ".jpg": { format: "jpeg", mimeType: "image/jpeg" },
    ".jpeg": { format: "jpeg", mimeType: "image/jpeg" },
  },
} as const;

export type Provider = keyof typeof OUTPUT_FORMATS;
export type GenerateResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type ReadImageResult = { path: string; data: ArrayBuffer; name: string };

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

export type GrokResult = {
  success: true;
  path: string;
  bytes: number;
  model: GrokParams["model"];
  aspect_ratio?: GrokParams["aspect_ratio"];
  resolution?: GrokParams["resolution"];
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

export async function loadInputImages(inputImages?: string[]): Promise<GenerateResult<ReadImageResult[]>> {
  if (!inputImages?.length) {
    return { ok: true, data: [] };
  }

  const loaded: ReadImageResult[] = [];
  for (const imagePath of inputImages) {
    const result = await readImageFile(imagePath);
    if ("error" in result) {
      return { ok: false, error: result.error };
    }
    loaded.push({ path: imagePath, data: result.data, name: result.name });
  }

  return { ok: true, data: loaded };
}

export function toOpenAIUploadFiles(images: ReadImageResult[]): File[] {
  return images.map((image) => createOpenAIUploadFile(image.data, image.name));
}

export function toGeminiInlineParts(images: ReadImageResult[]) {
  return images.map((image) => ({
    inlineData: {
      mimeType: getMimeType(image.path),
      data: Buffer.from(image.data).toString("base64"),
    },
  }));
}

export async function saveImage(imageData: string, outputPath: string): Promise<{ path: string; bytes: number }> {
  const buffer = Buffer.from(imageData, "base64");
  const resolvedPath = path.resolve(outputPath);
  await Bun.write(resolvedPath, buffer);
  return { path: resolvedPath, bytes: buffer.length };
}
