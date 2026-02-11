import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import path from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

type GenerateResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type OpenAIParams = {
  prompt: string;
  output_path: string;
  model: "gpt-image-1.5";
  input_images?: string[];
  size: "auto" | "1024x1024" | "1536x1024" | "1024x1536";
  quality: "auto" | "high" | "medium" | "low";
  background: "auto" | "transparent" | "opaque";
};

export type GeminiParams = {
  prompt: string;
  output_path: string;
  model: "gemini-2.5-flash-image" | "gemini-3-pro-image-preview";
  input_images?: string[];
  aspect_ratio?: "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9";
  image_size?: "1K" | "2K" | "4K";
};

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
  let imageData: string | undefined;

  if (input_images?.length) {
    const imageFiles: File[] = [];
    for (const imagePath of input_images) {
      const result = await readImageFile(imagePath);
      if ("error" in result) {
        return { ok: false, error: result.error };
      }
      imageFiles.push(new File([result.data], result.name, { type: "image/png" }));
    }

    const response = await getOpenAI().images.edit({
      model,
      prompt,
      image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
      size: size === "auto" ? undefined : size,
      background,
      output_format: "png",
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
      output_format: "png",
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
