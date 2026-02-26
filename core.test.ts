import { describe, expect, it } from "bun:test";
import {
  createOpenAIUploadFile,
  generateGeminiImage,
  generateOpenAIImage,
  getMimeType,
  resolveOutputFormat,
  setClientsForTests,
} from "./core.ts";

function tempPath(name: string): string {
  return `/tmp/image-gen-${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`;
}

describe("core mime and output format handling", () => {
  it("detects upload MIME type from extension for OpenAI edits", () => {
    const data = new Uint8Array([1, 2, 3]).buffer;
    const file = createOpenAIUploadFile(data, "sample.webp");
    expect(file.type).toBe("image/webp");
    expect(file.name).toBe("sample.webp");
  });

  it("keeps MIME lookup behavior for known and unknown extensions", () => {
    expect(getMimeType("photo.JPG")).toBe("image/jpeg");
    expect(getMimeType("photo.unknown")).toBe("image/png");
  });

  it("infers OpenAI output format from extension", () => {
    const resolved = resolveOutputFormat("openai", "out.jpg");
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.format).toBe("jpeg");
      expect(resolved.mimeType).toBe("image/jpeg");
    }
  });

  it("rejects unsupported extension/provider combinations", () => {
    const openai = resolveOutputFormat("openai", "out.gif");
    expect(openai.ok).toBe(false);
    if (!openai.ok) {
      expect(openai.error).toContain("Unsupported output extension for openai");
      expect(openai.error).toContain(".png, .jpg, .jpeg, .webp");
    }

    const gemini = resolveOutputFormat("gemini", "out.jpg");
    expect(gemini.ok).toBe(false);
    if (!gemini.ok) {
      expect(gemini.error).toContain("Unsupported output extension for gemini");
      expect(gemini.error).toContain(".png");
    }
  });
});

describe("core provider request mapping", () => {
  it("maps OpenAI generate args and writes output", async () => {
    const outputPath = tempPath("openai-generate.png");
    let generateArgs: Record<string, unknown> | undefined;

    setClientsForTests({
      openai: {
        images: {
          edit: async () => ({ data: [{ b64_json: "" }] }),
          generate: async (params) => {
            generateArgs = params as unknown as Record<string, unknown>;
            return { data: [{ b64_json: Buffer.from("openai").toString("base64") }] };
          },
        },
      },
      google: null,
    });

    const result = await generateOpenAIImage({
      prompt: "test prompt",
      output_path: outputPath,
      model: "gpt-image-1.5",
      size: "auto",
      quality: "high",
      background: "transparent",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.path).toBe(outputPath);
      expect(result.data.input_images_count).toBe(0);
      expect(result.data.bytes).toBeGreaterThan(0);
    }

    expect(generateArgs).toBeTruthy();
    expect(generateArgs?.model).toBe("gpt-image-1.5");
    expect(generateArgs?.prompt).toBe("test prompt");
    expect(generateArgs?.size).toBeUndefined();
    expect(generateArgs?.quality).toBe("high");
    expect(generateArgs?.background).toBe("transparent");
    expect(generateArgs?.output_format).toBe("png");
  });

  it("maps OpenAI edit args with image uploads", async () => {
    const inputPath = tempPath("openai-edit-input.png");
    const outputPath = tempPath("openai-edit-output.webp");
    await Bun.write(inputPath, new Uint8Array([1, 2, 3, 4]));

    let editArgs: Record<string, unknown> | undefined;

    setClientsForTests({
      openai: {
        images: {
          edit: async (params) => {
            editArgs = params as unknown as Record<string, unknown>;
            return { data: [{ b64_json: Buffer.from("edited").toString("base64") }] };
          },
          generate: async () => ({ data: [{ b64_json: "" }] }),
        },
      },
      google: null,
    });

    const result = await generateOpenAIImage({
      prompt: "edit prompt",
      output_path: outputPath,
      model: "gpt-image-1.5",
      input_images: [inputPath],
      size: "1024x1024",
      quality: "auto",
      background: "opaque",
    });

    expect(result.ok).toBe(true);
    expect(editArgs?.output_format).toBe("webp");
    expect(editArgs?.size).toBe("1024x1024");
    expect(editArgs?.prompt).toBe("edit prompt");

    const upload = editArgs?.image as File | File[] | undefined;
    if (upload && Array.isArray(upload)) {
      expect(upload.length).toBeGreaterThan(0);
      expect(upload[0]?.name.endsWith(".png")).toBe(true);
    } else {
      expect(upload instanceof File).toBe(true);
      if (upload instanceof File) {
        expect(upload.name.endsWith(".png")).toBe(true);
      }
    }
  });

  it("maps Gemini content/config and writes output", async () => {
    const inputPath = tempPath("gemini-input.jpg");
    const outputPath = tempPath("gemini-output.png");
    await Bun.write(inputPath, new Uint8Array([9, 8, 7]));

    let request: Record<string, unknown> | undefined;

    setClientsForTests({
      openai: null,
      google: {
        models: {
          generateContent: async (params) => {
            request = params as unknown as Record<string, unknown>;
            return {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        inlineData: {
                          data: Buffer.from("gemini").toString("base64"),
                        },
                      },
                    ],
                  },
                },
              ],
            };
          },
        },
      },
    });

    const result = await generateGeminiImage({
      prompt: "gemini prompt",
      output_path: outputPath,
      model: "gemini-3-pro-image-preview",
      input_images: [inputPath],
      aspect_ratio: "16:9",
      image_size: "2K",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.path).toBe(outputPath);
      expect(result.data.input_images_count).toBe(1);
    }

    expect(request?.model).toBe("gemini-3-pro-image-preview");
    const contents = request?.contents as Array<Record<string, unknown>>;
    expect(Array.isArray(contents)).toBe(true);
    expect(contents.length).toBe(2);
    expect(contents[0]?.text).toBe("gemini prompt");

    const second = contents[1];
    expect(second?.inlineData).toBeTruthy();
    const inline = second?.inlineData as Record<string, unknown>;
    expect(inline?.mimeType).toBe("image/jpeg");

    const config = request?.config as Record<string, unknown>;
    expect(config?.responseModalities).toEqual(["IMAGE", "TEXT"]);
    expect(config?.imageConfig).toEqual({ aspectRatio: "16:9", imageSize: "2K" });
  });
});
