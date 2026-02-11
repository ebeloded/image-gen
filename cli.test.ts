import { describe, expect, it } from "bun:test";
import { parseArgs } from "./cli.ts";
import path from "node:path";

describe("parseArgs validation", () => {
  it("returns help for top-level and command help flags", () => {
    expect(parseArgs(["--help"]).mode).toBe("help");
    expect(parseArgs(["openai", "--help"]).mode).toBe("help");
    expect(parseArgs(["gemini", "-h"]).mode).toBe("help");
  });

  it("rejects unknown commands", () => {
    const parsed = parseArgs(["stability", "--prompt", "test", "--output", "out.png"]);
    expect(parsed.mode).toBe("help");
    if (parsed.mode === "help") {
      expect(parsed.message).toBe("Unknown command: stability");
    }
  });

  it("rejects positional arguments and missing values", () => {
    const positional = parseArgs(["openai", "extra", "--prompt", "test", "--output", "out.png"]);
    expect(positional.mode).toBe("help");
    if (positional.mode === "help") {
      expect(positional.message).toBe("Unexpected argument: extra");
    }

    const missingValue = parseArgs(["openai", "--prompt", "--output", "out.png"]);
    expect(missingValue.mode).toBe("help");
    if (missingValue.mode === "help") {
      expect(missingValue.message).toBe("Missing value for --prompt");
    }
  });

  it("requires both prompt and output", () => {
    const parsed = parseArgs(["openai", "--prompt", "test"]);
    expect(parsed.mode).toBe("help");
    if (parsed.mode === "help") {
      expect(parsed.message).toBe("Missing required --prompt or --output");
    }
  });

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

  it("accepts valid OpenAI args and applies defaults", () => {
    const parsed = parseArgs(["openai", "--prompt", "test", "--output", "out.webp"]);
    expect(parsed.mode).toBe("openai");
    if (parsed.mode === "openai") {
      expect(parsed.params.model).toBe("gpt-image-1.5");
      expect(parsed.params.size).toBe("auto");
      expect(parsed.params.quality).toBe("auto");
      expect(parsed.params.background).toBe("auto");
    }
  });

  it("accepts valid Gemini args and keeps optional values", () => {
    const parsed = parseArgs([
      "gemini",
      "--prompt",
      "test",
      "--output",
      "out.png",
      "--aspect-ratio",
      "16:9",
      "--image-size",
      "2K",
    ]);
    expect(parsed.mode).toBe("gemini");
    if (parsed.mode === "gemini") {
      expect(parsed.params.aspect_ratio).toBe("16:9");
      expect(parsed.params.image_size).toBe("2K");
    }
  });
});

describe("cli executable behavior", () => {
  const cwd = path.resolve(import.meta.dir);

  const runCli = (args: string[]) => {
    const result = Bun.spawnSync(["bun", "run", "cli.ts", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    return {
      exitCode: result.exitCode,
      stdout: Buffer.from(result.stdout).toString(),
      stderr: Buffer.from(result.stderr).toString(),
    };
  };

  it("prints usage and exits 0 for help", () => {
    const result = runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("images-mcp (CLI)");
    expect(result.stdout).toContain("images-mcp openai  [args]");
    expect(result.stdout).toContain("--image-size    1K | 2K | 4K");
    expect(result.stderr).toBe("");
  });

  it("prints validation errors with usage and exits 1", () => {
    const result = runCli(["gemini", "--prompt", "test", "--output", "out.png", "--wat", "nope"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown flag(s) for gemini: --wat");
    expect(result.stderr).toContain("images-mcp (CLI)");
  });

  it("enforces provider-specific output extensions", () => {
    const openai = runCli(["openai", "--prompt", "test", "--output", "out.gif"]);
    expect(openai.exitCode).toBe(1);
    expect(openai.stderr).toContain("Error: Unsupported output extension for openai: .gif");
    expect(openai.stderr).toContain("Allowed extensions: .png, .jpg, .jpeg, .webp");

    const gemini = runCli(["gemini", "--prompt", "test", "--output", "out.jpg"]);
    expect(gemini.exitCode).toBe(1);
    expect(gemini.stderr).toContain("Error: Unsupported output extension for gemini: .jpg");
    expect(gemini.stderr).toContain("Allowed extensions: .png");
  });
});
