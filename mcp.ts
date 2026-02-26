#!/usr/bin/env bun
import fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  generateGeminiImage,
  generateGrokImage,
  generateOpenAIImage,
} from "./core.ts";
import { providerSpecs } from "./metadata.ts";
import { geminiInputShape, geminiParamsSchema, grokInputShape, grokParamsSchema, openAIInputShape, openAIParamsSchema } from "./schemas.ts";

const textContent = (text: string) => ({ content: [{ type: "text" as const, text }] });
const errorResponse = (message: string) => textContent(`Error: ${message}`);
const successResponse = (data: object) => textContent(JSON.stringify(data, null, 2));
const formatValidationError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
const packageVersion = (() => {
  try {
    const raw = fs.readFileSync(new URL("./package.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

type ParamsShape = Record<string, unknown>;
type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

function registerImageTool<TParams extends ParamsShape, TResult extends object>(
  server: McpServer,
  config: {
    name: string;
    title: string;
    description: string;
    inputSchema: any;
    parse: (input: ParamsShape) => SafeParseResult<TParams>;
    invalidPrefix: string;
    run: (params: TParams) => Promise<{ ok: true; data: TResult } | { ok: false; error: string }>;
  }
) {
  server.registerTool(
    config.name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
    },
    async (input: any) => {
      try {
        const parsed = config.parse(input as ParamsShape);
        if (!parsed.success) {
          return errorResponse(`${config.invalidPrefix}: ${formatValidationError(parsed.error)}`);
        }

        const result = await config.run(parsed.data);
        if (!result.ok) return errorResponse(result.error);
        return successResponse(result.data);
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : String(error));
      }
    }
  );
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "image-gen",
    version: packageVersion,
  });

  registerImageTool(server, {
    name: providerSpecs.openai.toolName,
    title: providerSpecs.openai.toolTitle,
    description: providerSpecs.openai.toolDescription,
    inputSchema: openAIInputShape,
    parse: (input) => openAIParamsSchema.safeParse(input),
    invalidPrefix: "Invalid OpenAI parameters",
    run: generateOpenAIImage,
  });

  registerImageTool(server, {
    name: providerSpecs.gemini.toolName,
    title: providerSpecs.gemini.toolTitle,
    description: providerSpecs.gemini.toolDescription,
    inputSchema: geminiInputShape,
    parse: (input) => geminiParamsSchema.safeParse(input),
    invalidPrefix: "Invalid Gemini parameters",
    run: generateGeminiImage,
  });

  registerImageTool(server, {
    name: providerSpecs.grok.toolName,
    title: providerSpecs.grok.toolTitle,
    description: providerSpecs.grok.toolDescription,
    inputSchema: grokInputShape,
    parse: (input) => grokParamsSchema.safeParse(input),
    invalidPrefix: "Invalid Grok parameters",
    run: generateGrokImage,
  });

  server.registerPrompt(
    "create-image",
    {
      description: "Generate an image using AI with professional prompting guidance",
      argsSchema: {
        description: z.string().describe("What image to create"),
      },
    },
    async ({ description }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `# Generate Image

Create an image based on this request: **${description}**

## Your Task

1. **Analyze the request** - Understand what the user wants and its intended use
2. **Choose the model**:
   - **OpenAI (gpt-image-1.5)**: Best for text rendering, photorealistic, precise control
   - **Gemini (gemini-2.5-flash-image)**: Fast, artistic, good for iteration
   - **Gemini (gemini-3-pro-image-preview)**: Higher quality, complex artistic styles
3. **Craft a professional prompt** using the framework below
4. **Generate the image** with appropriate parameters
5. **Report the output path** to the user

## Prompt Crafting Framework

Transform the user's request into a structured prompt addressing these 6 factors:

### 1. Subject
Be specific about what's in the image.

### 2. Composition
Specify framing, aspect ratio, positioning, negative space.

### 3. Action
What is happening in the scene (if applicable).

### 4. Location
Environmental context and setting.

### 5. Style
Artistic medium, aesthetic references, color palette (use hex codes).

### 6. Constraints
What to explicitly exclude.

## Prompt Template

\`\`\`
[Quality buzzword] for [use case].

SUBJECT:
- [Primary element with details]
- [Secondary elements]

COMPOSITION:
- [Format/aspect ratio]
- [Positioning/framing]
- [Depth layers]

STYLE:
- [Aesthetic reference]
- [Color palette with hex codes: #XXXXXX]

LIGHTING:
- [Light source and quality]

MUST NOT include:
- [Unwanted elements]
\`\`\`

## Advanced Techniques to Apply

- **Quality buzzwords**: "Award-winning", "Behance-featured", "Premium editorial"
- **Hex colors**: Specify exact colors like \`#0f172a\` instead of "dark blue"
- **ALL CAPS**: Use \`MUST\` and \`MUST NOT\` for strict requirements
- **Style fusion**: Combine artist references (e.g., "Victo Ngai meets Art Deco")
- **Photography terms**: "Rule of thirds", "shallow depth of field", "golden hour lighting"

## Parameters

### OpenAI
- \`size\`: "1024x1024", "1536x1024" (landscape), "1024x1536" (portrait)
- \`quality\`: "high" for important images
- \`background\`: "transparent" for icons/logos

### Gemini
- \`aspect_ratio\`: "1:1", "16:9", "9:16", "4:3", etc.
- \`image_size\`: "2K" or "4K" for high quality

## Output

Save to the current directory with a descriptive filename based on the content.`,
          },
        },
      ],
    })
  );

  return server;
}

export async function startMcpServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Images MCP server running on stdio");
  return server;
}

if (import.meta.main) {
  await startMcpServer();
}
