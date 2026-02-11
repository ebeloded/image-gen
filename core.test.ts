import { describe, expect, it } from "bun:test";
import { createOpenAIUploadFile, getMimeType, resolveOutputFormat } from "./core.ts";

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
