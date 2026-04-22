---
name: image-gen
description: "Generate and edit images using the image-gen CLI. Use when the user asks to generate an image, create a picture, edit an image, or do anything involving AI image generation via OpenAI, Gemini, or Grok."
allowed-tools: "Bash(image-gen *), Read"
---

# image-gen CLI

Generate and edit AI images from the command line using OpenAI, Gemini, or Grok.

## Quick start

```bash
image-gen <provider> --prompt "..." --output /path/to/image.png
```

## Providers

| Provider | Command  | Output formats         | API key env var                       |
|----------|----------|------------------------|---------------------------------------|
| OpenAI   | `openai` | .png, .jpg, .jpeg, .webp | `OPENAI_API_KEY`                    |
| Gemini   | `gemini` | .png                   | `GEMINI_API_KEY` or `GOOGLE_API_KEY`  |
| Grok     | `grok`   | .jpg, .jpeg            | `XAI_API_KEY`                         |

## Common flags (all providers)

| Flag             | Short | Required | Description                                      |
|------------------|-------|----------|--------------------------------------------------|
| `--prompt`       | `-p`  | Yes      | Image description or editing instructions         |
| `--output`       | `-o`  | Yes      | Output file path (extension must match provider)  |
| `--input`        | `-i`  | No       | Input image(s) for editing; repeatable, comma-separated |
| `--force`        | `-f`  | No       | Overwrite output file if it already exists               |

The prompt can also be passed as positional args or piped via stdin.

## Provider-specific flags

### OpenAI

| Flag             | Default         | Values                                |
|------------------|-----------------|---------------------------------------|
| `--model`        | gpt-image-2     | gpt-image-2, gpt-image-1.5            |
| `--size`         | auto            | auto, 1024x1024, 1536x1024, 1024x1536, 2048x2048, 2048x1152, 3840x2160, 2160x3840 |
| `--quality`      | auto            | auto, high, medium, low               |
| `--background`   | auto            | auto, transparent, opaque (transparent not supported on gpt-image-2) |

### Gemini

| Flag             | Default                          | Values                                                       |
|------------------|----------------------------------|--------------------------------------------------------------|
| `--model`        | gemini-3.1-flash-image-preview   | gemini-2.5-flash-image, gemini-3-pro-image-preview, gemini-3.1-flash-image-preview |
| `--aspect-ratio` | (none)                           | 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9       |
| `--image-size`   | (none)                           | 1K, 2K, 4K                                                  |

### Grok

| Flag             | Default        | Values                                                                                         |
|------------------|----------------|------------------------------------------------------------------------------------------------|
| `--model`        | grok-2-image   | grok-2-image                                                                                   |
| `--aspect-ratio` | (none)         | 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 2:1, 1:2, 19.5:9, 9:19.5, 20:9, 9:20                   |
| `--resolution`   | (none)         | 1k, 2k                                                                                        |

## Examples

Generate with OpenAI:
```bash
image-gen openai --prompt "a cat in a spacesuit" --output ./cat.png
```

Generate with Gemini at 16:9:
```bash
image-gen gemini -p "sunset over mountains" -o ./sunset.png --aspect-ratio 16:9
```

Generate with Grok at 2k:
```bash
image-gen grok -p "neon city street" -o ./city.jpg --resolution 2k
```

Edit an existing image:
```bash
image-gen openai -p "add a rainbow" -o ./edited.png --input ./original.png
```

Pipe prompt from stdin:
```bash
echo "a peaceful garden" | image-gen gemini -o ./garden.png
```

High quality transparent PNG:
```bash
image-gen openai -p "logo of a rocket" -o ./logo.png --quality high --background transparent
```

## Key management

```bash
image-gen keys list                     # Show all API key statuses
image-gen keys set openai sk-...        # Set a key directly
echo "sk-..." | image-gen keys set openai  # Set a key via stdin
image-gen keys get openai               # Print key value
image-gen keys delete openai            # Remove a key
```

Keys are stored in `~/.config/image-gen/config.json`.

## Output

On success, the CLI prints JSON:
```json
{
  "success": true,
  "path": "/absolute/path/to/image.png",
  "bytes": 123456
}
```

On failure it prints an error to stderr and exits with code 1.

## Instructions for Claude

When the user asks to generate an image:

1. Pick the provider based on user preference, or default to OpenAI if no preference stated.
2. Choose an appropriate output path -- use the current working directory unless the user specifies otherwise. Match the file extension to the provider's supported formats.
3. Run the `image-gen` command directly (it is installed globally).
4. After generation, read the output image file to show it to the user.
