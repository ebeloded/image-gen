import { describe, expect, it } from "bun:test";
import path from "node:path";
import { createMcpServer, startMcpServer } from "./mcp.ts";

describe("mcp startup safety", () => {
  it("exports startup helpers", () => {
    expect(typeof createMcpServer).toBe("function");
    expect(typeof startMcpServer).toBe("function");
  });

  it("does not auto-start server on import", () => {
    const result = Bun.spawnSync([
      "bun",
      "-e",
      'import "./mcp.ts"; console.log("imported");',
    ], {
      cwd: path.resolve(import.meta.dir),
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    const stdout = Buffer.from(result.stdout).toString();
    const stderr = Buffer.from(result.stderr).toString();

    expect(stdout).toContain("imported");
    expect(stderr).not.toContain("Images MCP server running on stdio");
  });
});
