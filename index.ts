import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import path from "node:path";

const server = new McpServer({
  name: "images-mcp",
  version: "1.0.0",
});

// Lazy-loaded clients
let openaiClient: OpenAI | null = null;
let googleClient: GoogleGenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

function getGoogle(): GoogleGenAI {
  if (!googleClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY or GOOGLE_API_KEY environment variable");
    }
    googleClient = new GoogleGenAI({ apiKey });
  }
  return googleClient;
}

// OpenAI image generation
server.registerTool(
  "openai_generate_image",
  {
    title: "OpenAI Image Generator",
    description: "Generate an image using OpenAI and save it to a file. Can accept input images for editing.",
    inputSchema: {
      prompt: z.string().describe("Description of the image to generate, or editing instructions if input_images provided"),
      output_path: z.string().describe("Path where the image should be saved (e.g., /path/to/image.png)"),
      model: z
        .enum(["gpt-image-1.5"])
        .default("gpt-image-1.5")
        .describe("Model: gpt-image-1.5"),
      input_images: z
        .array(z.string())
        .optional()
        .describe("Optional array of image file paths to use as input for editing/reference"),
      size: z
        .enum(["auto", "1024x1024", "1536x1024", "1024x1536"])
        .default("auto")
        .describe("Image size: auto (default), 1024x1024 (square), 1536x1024 (landscape), 1024x1536 (portrait)"),
      quality: z
        .enum(["auto", "high", "medium", "low"])
        .default("auto")
        .describe("Image quality: auto (default), high, medium, low"),
      background: z
        .enum(["auto", "transparent", "opaque"])
        .default("auto")
        .describe("Background: auto (default), transparent, opaque"),
    },
  },
  async ({ prompt, output_path, model, input_images, size, quality, background }) => {
    try {
      let imageData: string | undefined;

      if (input_images && input_images.length > 0) {
        // Use edit endpoint when input images are provided
        const imageFiles: File[] = [];
        for (const imagePath of input_images) {
          const file = Bun.file(imagePath);
          if (!(await file.exists())) {
            return { content: [{ type: "text", text: `Error: Input image not found: ${imagePath}` }] };
          }
          const buffer = await file.arrayBuffer();
          const fileName = path.basename(imagePath);
          imageFiles.push(new File([buffer], fileName, { type: "image/png" }));
        }

        const response = await getOpenAI().images.edit({
          model,
          prompt,
          image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
          size: size === "auto" ? undefined : size,
        } as Parameters<OpenAI["images"]["edit"]>[0]);

        imageData = (response as OpenAI.ImagesResponse).data?.[0]?.b64_json;
      } else {
        // Use generate endpoint for new images
        const response = await getOpenAI().images.generate({
          model,
          prompt,
          n: 1,
          size: size === "auto" ? undefined : size,
          quality,
          background,
          output_format: "png",
        } as Parameters<OpenAI["images"]["generate"]>[0]);

        imageData = (response as OpenAI.ImagesResponse).data?.[0]?.b64_json;
      }

      if (!imageData) {
        return { content: [{ type: "text", text: "Error: No image data received from OpenAI" }] };
      }

      const buffer = Buffer.from(imageData, "base64");
      const resolvedPath = path.resolve(output_path);
      await Bun.write(resolvedPath, buffer);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                path: resolvedPath,
                bytes: buffer.length,
                model,
                size,
                quality,
                input_images_count: input_images?.length || 0,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error: ${message}` }] };
    }
  }
);

// Helper to get mime type from file extension
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return mimeTypes[ext] || "image/png";
}

// Google Gemini image generation
server.registerTool(
  "gemini_generate_image",
  {
    title: "Gemini Image Generator",
    description: "Generate or edit an image using Google Gemini and save it to a file. Can accept input images for editing.",
    inputSchema: {
      prompt: z.string().describe("Description of the image to generate, or editing instructions if input_images provided"),
      output_path: z.string().describe("Path where the image should be saved (e.g., /path/to/image.png)"),
      model: z
        .enum(["gemini-2.5-flash-image", "gemini-3-pro-image-preview"])
        .default("gemini-2.5-flash-image")
        .describe("Model: gemini-2.5-flash-image (default, fast), gemini-3-pro-image-preview (advanced)"),
      input_images: z
        .array(z.string())
        .optional()
        .describe("Optional array of image file paths to use as input for editing/reference"),
      aspect_ratio: z
        .enum(["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"])
        .optional()
        .describe("Aspect ratio: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9"),
      image_size: z
        .enum(["1K", "2K", "4K"])
        .optional()
        .describe("Image size: 1K, 2K, 4K"),
    },
  },
  async ({ prompt, output_path, model, input_images, aspect_ratio, image_size }) => {
    try {
      // Build contents array with text and optional images
      const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      // Add text prompt
      contents.push({ text: prompt });

      // Add input images if provided
      if (input_images && input_images.length > 0) {
        for (const imagePath of input_images) {
          const file = Bun.file(imagePath);
          if (!(await file.exists())) {
            return { content: [{ type: "text", text: `Error: Input image not found: ${imagePath}` }] };
          }
          const imageBuffer = await file.arrayBuffer();
          const base64Data = Buffer.from(imageBuffer).toString("base64");
          contents.push({
            inlineData: {
              mimeType: getMimeType(imagePath),
              data: base64Data,
            },
          });
        }
      }

      // Build config
      const config: {
        responseModalities: string[];
        imageConfig?: { aspectRatio?: string; imageSize?: string };
      } = {
        responseModalities: ["IMAGE", "TEXT"],
      };

      if (aspect_ratio || image_size) {
        config.imageConfig = {};
        if (aspect_ratio) config.imageConfig.aspectRatio = aspect_ratio;
        if (image_size) config.imageConfig.imageSize = image_size;
      }

      const response = await getGoogle().models.generateContent({
        model,
        contents,
        config,
      });

      const parts = response.candidates?.[0]?.content?.parts;
      const imagePart = parts?.find((part) => part.inlineData?.data);

      if (!imagePart?.inlineData?.data) {
        const textPart = parts?.find((part) => part.text);
        const errorMsg = textPart?.text || "No image data received from Google";
        return { content: [{ type: "text", text: `Error: ${errorMsg}` }] };
      }

      const buffer = Buffer.from(imagePart.inlineData.data, "base64");
      const resolvedPath = path.resolve(output_path);
      await Bun.write(resolvedPath, buffer);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                path: resolvedPath,
                bytes: buffer.length,
                model,
                aspect_ratio,
                image_size,
                input_images_count: input_images?.length || 0,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error: ${message}` }] };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Images MCP server running on stdio");
}

main().catch(console.error);
