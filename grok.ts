import { getGrokApiKey } from "./config.ts";
import type { GrokParams } from "./schemas.ts";
import {
  type GenerateResult,
  type GrokResult,
  getMimeType,
  loadInputImages,
  resolveOutputFormat,
  saveImage,
} from "./core-utils.ts";

type GrokImageRequest = {
  model: string;
  prompt: string;
  response_format: "b64_json";
  aspect_ratio?: string;
  resolution?: string;
};

type GrokEditRequest = GrokImageRequest & {
  image?: { url: string; type: "image_url" };
  images?: Array<{ url: string; type: "image_url" }>;
};

type GrokResponse = { data?: Array<{ b64_json?: string }> };

export type GrokClient = {
  generate: (params: GrokImageRequest) => Promise<GrokResponse>;
  edit: (params: GrokEditRequest) => Promise<GrokResponse>;
};

let grokClient: GrokClient | null = null;

export function setGrokClientForTests(client: GrokClient | null) {
  grokClient = client;
}

function createFetchClient(apiKey: string): GrokClient {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  async function post(url: string, body: object): Promise<GrokResponse> {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`xAI API error (${response.status}): ${text}`);
    }
    return response.json() as Promise<GrokResponse>;
  }

  return {
    generate: (params) => post("https://api.x.ai/v1/images/generations", params),
    edit: (params) => post("https://api.x.ai/v1/images/edits", params),
  };
}

function getGrok(): GrokClient {
  if (!grokClient) {
    const apiKey = getGrokApiKey();
    if (!apiKey) {
      throw new Error("Missing XAI_API_KEY environment variable or xai_api_key in config");
    }
    grokClient = createFetchClient(apiKey);
  }
  return grokClient;
}

export async function generateGrokImage({
  prompt,
  output_path,
  model,
  input_images,
  aspect_ratio,
  resolution,
}: GrokParams): Promise<GenerateResult<GrokResult>> {
  const outputFormat = resolveOutputFormat("grok", output_path);
  if (!outputFormat.ok) {
    return { ok: false, error: outputFormat.error };
  }

  const loadedImages = await loadInputImages(input_images);
  if (!loadedImages.ok) {
    return loadedImages;
  }

  let imageData: string | undefined;

  if (loadedImages.data.length > 0) {
    const imageRefs = loadedImages.data.map((img) => ({
      url: `data:${getMimeType(img.path)};base64,${Buffer.from(img.data).toString("base64")}`,
      type: "image_url" as const,
    }));

    const editRequest: GrokEditRequest = {
      model: "grok-imagine-image",
      prompt,
      response_format: "b64_json",
      ...(aspect_ratio && { aspect_ratio }),
      ...(resolution && { resolution }),
      ...(imageRefs.length === 1 ? { image: imageRefs[0] } : { images: imageRefs }),
    };

    const response = await getGrok().edit(editRequest);
    imageData = response.data?.[0]?.b64_json;
  } else {
    const generateRequest: GrokImageRequest = {
      model,
      prompt,
      response_format: "b64_json",
      ...(aspect_ratio && { aspect_ratio }),
      ...(resolution && { resolution }),
    };

    const response = await getGrok().generate(generateRequest);
    imageData = response.data?.[0]?.b64_json;
  }

  if (!imageData) {
    return { ok: false, error: "No image data received from xAI" };
  }

  const saved = await saveImage(imageData, output_path);
  return {
    ok: true,
    data: {
      success: true,
      ...saved,
      model,
      aspect_ratio,
      resolution,
      input_images_count: input_images?.length ?? 0,
    },
  };
}
