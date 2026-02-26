import { describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import path from "node:path";
import { createMcpServer, startMcpServer } from "./mcp.ts";
import { providerSpecs } from "./metadata.ts";

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

describe("mcp tools contract", () => {
  async function connectClientServer() {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const server = createMcpServer();
    await server.connect(serverTransport);

    const client = new Client({ name: "image-gen-test-client", version: "1.0.0" });
    await client.connect(clientTransport);

    return { client, clientTransport, serverTransport };
  }

  it("registers tool names and descriptions from shared metadata", async () => {
    const { client, clientTransport, serverTransport } = await connectClientServer();

    const tools = await client.listTools();
    const byName = new Map(tools.tools.map((tool) => [tool.name, tool]));

    expect(byName.get(providerSpecs.openai.toolName)?.title).toBe(providerSpecs.openai.toolTitle);
    expect(byName.get(providerSpecs.openai.toolName)?.description).toBe(providerSpecs.openai.toolDescription);

    expect(byName.get(providerSpecs.gemini.toolName)?.title).toBe(providerSpecs.gemini.toolTitle);
    expect(byName.get(providerSpecs.gemini.toolName)?.description).toBe(providerSpecs.gemini.toolDescription);

    await clientTransport.close();
    await serverTransport.close();
  });

  it("returns protocol validation errors when required params are missing", async () => {
    const { client, clientTransport, serverTransport } = await connectClientServer();

    const openaiResult = await client.callTool({
      name: providerSpecs.openai.toolName,
      arguments: { output_path: "./out.png" },
    });

    const openaiContent = openaiResult.content as Array<{ type: string; text?: string }>;
    const openaiText = openaiContent.find((item) => item.type === "text");
    expect(openaiText?.type).toBe("text");
    if (openaiText?.type === "text") {
      expect(openaiText.text).toContain("MCP error -32602");
      expect(openaiText.text).toContain("prompt");
    }

    const geminiResult = await client.callTool({
      name: providerSpecs.gemini.toolName,
      arguments: { output_path: "./out.png" },
    });

    const geminiContent = geminiResult.content as Array<{ type: string; text?: string }>;
    const geminiText = geminiContent.find((item) => item.type === "text");
    expect(geminiText?.type).toBe("text");
    if (geminiText?.type === "text") {
      expect(geminiText.text).toContain("MCP error -32602");
      expect(geminiText.text).toContain("prompt");
    }

    await clientTransport.close();
    await serverTransport.close();
  });
});
