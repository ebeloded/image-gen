import { describe, expect, it } from "bun:test";
import { parseArgs } from "./cli.ts";

describe("parseArgs validation", () => {
  it("rejects unknown flags for openai", () => {
    const parsed = parseArgs(["openai", "--prompt", "test", "--output", "out.png", "--foo", "bar"]);
    expect(parsed.mode).toBe("help");
    if (parsed.mode === "help") {
      expect(parsed.message).toContain("Unknown flag(s) for openai: --foo");
    }
  });

  it("rejects invalid openai enum values with clear error", () => {
    const parsed = parseArgs(["openai", "--prompt", "test", "--output", "out.png", "--size", "500x500"]);
    expect(parsed.mode).toBe("help");
    if (parsed.mode === "help") {
      expect(parsed.message).toContain('Invalid value for --size: "500x500"');
      expect(parsed.message).toContain("Allowed values: auto, 1024x1024, 1536x1024, 1024x1536");
    }
  });

  it("rejects invalid gemini aspect-ratio with clear error", () => {
    const parsed = parseArgs(["gemini", "--prompt", "test", "--output", "out.png", "--aspect-ratio", "7:5"]);
    expect(parsed.mode).toBe("help");
    if (parsed.mode === "help") {
      expect(parsed.message).toContain('Invalid value for --aspect-ratio: "7:5"');
    }
  });

  it("keeps backward compatibility for --inputs alias", () => {
    const parsed = parseArgs(["openai", "--prompt", "test", "--output", "out.png", "--inputs", "img.png"]);
    expect(parsed.mode).toBe("openai");
    if (parsed.mode === "openai") {
      expect(parsed.params.input_images).toEqual(["img.png"]);
    }
  });
});
