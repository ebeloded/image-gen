# images-mcp

An MCP server for AI image generation.

## Tools

### `openai_generate_image`
Generate or edit images using OpenAI GPT Image or DALL-E.

| Parameter | Default | Options |
|-----------|---------|---------|
| `prompt` | required | Text description or editing instructions |
| `output_path` | required | File path to save (.png) |
| `model` | `gpt-image-1.5` | `gpt-image-1.5`, `gpt-image-1`, `gpt-image-1-mini`, `dall-e-3`, `dall-e-2` |
| `input_images` | - | Array of image file paths for editing/reference |
| `size` | `auto` | `auto`, `1024x1024`, `1536x1024`, `1024x1536` |
| `quality` | `auto` | `auto`, `high`, `medium`, `low` |
| `background` | `auto` | `auto`, `transparent`, `opaque` |

### `gemini_generate_image`
Generate or edit images using Google Gemini.

| Parameter | Default | Options |
|-----------|---------|---------|
| `prompt` | required | Text description or editing instructions |
| `output_path` | required | File path to save (.png) |
| `model` | `gemini-2.5-flash-image` | `gemini-2.5-flash-image`, `gemini-3-pro-image-preview` |
| `input_images` | - | Array of image file paths for editing/reference |
| `aspect_ratio` | - | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` |
| `image_size` | - | `1K`, `2K`, `4K` |

## Environment Variables

- `OPENAI_API_KEY` - Required for OpenAI
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` - Required for Gemini

## Usage

```bash
bun install
bun run start
```
