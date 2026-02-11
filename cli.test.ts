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

  it("rejects missing values", () => {
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

  it("rejects unknown flags for openai with suggestions", () => {
    const parsed = parseArgs(["openai", "--prompt", "test", "--output", "out.png", "--qulity", "high"]);
    expect(parsed.mode).toBe("help");
    if (parsed.mode === "help") {
      expect(parsed.message).toContain("Unknown flag(s) for openai: --qulity");
      expect(parsed.message).toContain("did you mean --quality?");
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

  it("accepts --flag=value style", () => {
    const parsed = parseArgs(["openai", "--prompt=test", "--output=out.webp", "--quality=high"]);
    expect(parsed.mode).toBe("openai");
    if (parsed.mode === "openai") {
      expect(parsed.params.prompt).toBe("test");
      expect(parsed.params.output_path).toBe("out.webp");
      expect(parsed.params.quality).toBe("high");
    }
  });

  it("accepts short aliases", () => {
    const parsed = parseArgs(["gemini", "-p", "test", "-o", "out.png", "-i", "a.png"]);
    expect(parsed.mode).toBe("gemini");
    if (parsed.mode === "gemini") {
      expect(parsed.params.prompt).toBe("test");
      expect(parsed.params.output_path).toBe("out.png");
      expect(parsed.params.input_images).toEqual(["a.png"]);
    }
  });

  it("accepts positional prompt fallback", () => {
    const parsed = parseArgs(["openai", "--output", "out.webp", "A", "cat", "in", "Tokyo"]);
    expect(parsed.mode).toBe("openai");
    if (parsed.mode === "openai") {
      expect(parsed.params.prompt).toBe("A cat in Tokyo");
    }
  });

  it("supports comma-separated and repeated input flags", () => {
    const parsed = parseArgs([
      "openai",
      "--prompt",
      "test",
      "--output",
      "out.webp",
      "--input",
      "a.png,b.png",
      "--input",
      "c.png",
    ]);
    expect(parsed.mode).toBe("openai");
    if (parsed.mode === "openai") {
      expect(parsed.params.input_images).toEqual(["a.png", "b.png", "c.png"]);
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

  const runCli = (args: string[], stdinText?: string) => {
    const result = Bun.spawnSync(["bun", "run", "cli.ts", ...args], {
      cwd,
      stdin: stdinText === undefined ? "ignore" : new TextEncoder().encode(stdinText),
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
    expect(result.stdout).toContain("--prompt, -p");
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

  it("reads prompt from stdin when prompt is missing", () => {
    const result = runCli(["openai", "--output", "out.gif"], "  prompt from stdin  \n");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Error: Unsupported output extension for openai: .gif");
    expect(result.stderr).not.toContain("Missing required --prompt or --output");
  });

  it("treats empty trimmed stdin prompt as missing", () => {
    const result = runCli(["openai", "--output", "out.gif"], "   \n\t  ");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Missing required --prompt or --output");
  });

  it("prioritizes --prompt over stdin", () => {
    const result = runCli(["openai", "--prompt", "from-flag", "--output", "out.gif"], "from-stdin");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Error: Unsupported output extension for openai: .gif");
    expect(result.stderr).not.toContain("Missing required --prompt or --output");
  });

  it("accepts positional prompt from executable path", () => {
    const result = runCli(["openai", "--output", "out.gif", "prompt", "from", "positionals"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Error: Unsupported output extension for openai: .gif");
    expect(result.stderr).not.toContain("Missing required --prompt or --output");
  });
});
