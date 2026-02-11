import { z } from "zod";

export const sharedDescriptions = {
  prompt: "Description of the image to generate, or editing instructions if input_images provided",
  outputPath: "Path where the image should be saved (e.g., /path/to/image.png)",
  inputImages: "Optional array of image file paths for editing/reference",
} as const;

export const toolMetadata = {
  openai: {
    name: "openai_generate_image",
    title: "OpenAI Image Generator",
    description: "Generate an image using OpenAI and save it to a file. Can accept input images for editing.",
  },
  gemini: {
    name: "gemini_generate_image",
    title: "Gemini Image Generator",
    description: "Generate or edit an image using Google Gemini and save it to a file. Can accept input images for editing.",
  },
} as const;

export const openAIModelSchema = z.enum(["gpt-image-1.5"]);
export const openAISizeSchema = z.enum(["auto", "1024x1024", "1536x1024", "1024x1536"]);
export const openAIQualitySchema = z.enum(["auto", "high", "medium", "low"]);
export const openAIBackgroundSchema = z.enum(["auto", "transparent", "opaque"]);

export const geminiModelSchema = z.enum(["gemini-2.5-flash-image", "gemini-3-pro-image-preview"]);
export const geminiAspectRatioSchema = z.enum(["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]);
export const geminiImageSizeSchema = z.enum(["1K", "2K", "4K"]);

export const openAIInputShape = {
  prompt: z.string().describe(sharedDescriptions.prompt),
  output_path: z.string().describe(sharedDescriptions.outputPath),
  model: openAIModelSchema.default("gpt-image-1.5").describe("Model: gpt-image-1.5"),
  input_images: z.array(z.string()).optional().describe(sharedDescriptions.inputImages),
  size: openAISizeSchema.default("auto").describe("Image size"),
  quality: openAIQualitySchema.default("auto").describe("Image quality"),
  background: openAIBackgroundSchema.default("auto").describe("Background type"),
} as const;

export const geminiInputShape = {
  prompt: z.string().describe(sharedDescriptions.prompt),
  output_path: z.string().describe(sharedDescriptions.outputPath),
  model: geminiModelSchema.default("gemini-3-pro-image-preview").describe("Model"),
  input_images: z.array(z.string()).optional().describe(sharedDescriptions.inputImages),
  aspect_ratio: geminiAspectRatioSchema.optional().describe("Aspect ratio"),
  image_size: geminiImageSizeSchema.optional().describe("Image size"),
} as const;

export const openAIParamsSchema = z.object(openAIInputShape).strict();
export const geminiParamsSchema = z.object(geminiInputShape).strict();

export type OpenAIParams = z.infer<typeof openAIParamsSchema>;
export type GeminiParams = z.infer<typeof geminiParamsSchema>;
