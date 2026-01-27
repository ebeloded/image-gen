#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  generateGeminiImage,
  generateOpenAIImage,
  type GeminiParams,
  type OpenAIParams,
} from "./core.ts";

const textContent = (text: string) => ({ content: [{ type: "text" as const, text }] });
const errorResponse = (message: string) => textContent(`Error: ${message}`);
const successResponse = (data: object) => textContent(JSON.stringify(data, null, 2));

const server = new McpServer({
  name: "images-mcp",
  version: "1.0.0",
});

server.registerTool(
  "openai_generate_image",
  {
    title: "OpenAI Image Generator",
    description: "Generate an image using OpenAI and save it to a file. Can accept input images for editing.",
    inputSchema: {
      prompt: z.string().describe("Description of the image to generate, or editing instructions if input_images provided"),
      output_path: z.string().describe("Path where the image should be saved (e.g., /path/to/image.png)"),
      model: z.enum(["gpt-image-1.5"]).default("gpt-image-1.5").describe("Model: gpt-image-1.5"),
      input_images: z.array(z.string()).optional().describe("Optional array of image file paths for editing/reference"),
      size: z.enum(["auto", "1024x1024", "1536x1024", "1024x1536"]).default("auto").describe("Image size"),
      quality: z.enum(["auto", "high", "medium", "low"]).default("auto").describe("Image quality"),
      background: z.enum(["auto", "transparent", "opaque"]).default("auto").describe("Background type"),
    },
  },
  async ({ prompt, output_path, model, input_images, size, quality, background }) => {
    try {
      const result = await generateOpenAIImage({
        prompt,
        output_path,
        model,
        input_images,
        size,
        quality,
        background,
      } as OpenAIParams);
      if (!result.ok) return errorResponse(result.error);
      return successResponse(result.data);
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : String(error));
    }
  }
);

server.registerTool(
  "gemini_generate_image",
  {
    title: "Gemini Image Generator",
    description: "Generate or edit an image using Google Gemini and save it to a file. Can accept input images for editing.",
    inputSchema: {
      prompt: z.string().describe("Description of the image to generate, or editing instructions if input_images provided"),
      output_path: z.string().describe("Path where the image should be saved (e.g., /path/to/image.png)"),
      model: z.enum(["gemini-2.5-flash-image", "gemini-3-pro-image-preview"]).default("gemini-3-pro-image-preview").describe("Model"),
      input_images: z.array(z.string()).optional().describe("Optional array of image file paths for editing/reference"),
      aspect_ratio: z
        .enum(["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"])
        .optional()
        .describe("Aspect ratio"),
      image_size: z.enum(["1K", "2K", "4K"]).optional().describe("Image size"),
    },
  },
  async ({ prompt, output_path, model, input_images, aspect_ratio, image_size }) => {
    try {
      const result = await generateGeminiImage({
        prompt,
        output_path,
        model,
        input_images,
        aspect_ratio,
        image_size,
      } as GeminiParams);
      if (!result.ok) return errorResponse(result.error);
      return successResponse(result.data);
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : String(error));
    }
  }
);

server.prompt(
  "create-image",
  {
    description: "Generate an image using AI with professional prompting guidance",
    arguments: [
      {
        name: "description",
        description: "What image to create",
        required: true,
      },
    ],
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

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Images MCP server running on stdio");
