# images-mcp

Generate and edit images from the command line (`images-mcp`) or as an MCP server.

## Requirements

- Bun `>=1.0.0`

## CLI (Primary Interface)

### Quick Start

```bash
bun install
```

Set API keys (use one or both providers):

```bash
export OPENAI_API_KEY="..."
export GEMINI_API_KEY="..."   # or GOOGLE_API_KEY
export XAI_API_KEY="..."
```

### API Key Management

Store keys persistently in `~/.config/image-gen/config.json`:

```bash
image-gen keys set openai sk-proj-...
image-gen keys set gemini AIza...
image-gen keys set grok xai-...
```

Or pipe the key to avoid it appearing in shell history:

```bash
echo "sk-proj-..." | image-gen keys set openai
```

View and manage keys:

```bash
image-gen keys           # show all key statuses (masked)
image-gen keys get openai  # print raw key value
image-gen keys delete openai  # remove a key
```

Environment variables (`OPENAI_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`, `XAI_API_KEY`) still work alongside the config file. Both are shown in `image-gen keys list`.

A local `.image-gen.json` in the working directory takes precedence over the user config (for project-level overrides).

Run directly from this repo:

```bash
bun run cli.ts --help
```

If `images-mcp` is on your `PATH`, you can run:

```bash
images-mcp --help
```

### Install/Run Modes

1. Source checkout mode (always works in this repo):
   - `bun run cli.ts <command> [flags]`
2. Binary-on-path mode (after package/global install or linking):
   - `images-mcp <command> [flags]`
3. MCP server mode (for MCP clients, stdio transport):
   - `bun run start` (same as `bun run mcp.ts`)

### Commands

```bash
images-mcp openai [flags]
images-mcp gemini [flags]
images-mcp grok [flags]
images-mcp keys [subcommand]
images-mcp --help
```

### CLI Flags (Full Reference)

Common flags (both commands):

| Flag | Required | Default | Notes |
|---|---|---|---|
| `--prompt <text>`, `-p <text>` | yes* | - | Prompt or edit instructions (`*` can be read from stdin or positional args when `--prompt`/`-p` is omitted) |
| `--output <path>`, `-o <path>` | yes | - | Output file path |
| `--input <path>`, `-i <path>` | no | - | Repeatable input image path (`--input=a.png,b.png` also supported) |
| `--help`, `-h` | no | - | Print usage |

Permissive CLI input forms:

- `--flag value`
- `--flag=value`
- short aliases (`-p`, `-o`, `-i`)
- positional prompt fallback when `--prompt`/`-p` is omitted

OpenAI flags (`images-mcp openai`):

| Flag | Required | Default | Allowed values |
|---|---|---|---|
| `--model <value>` | no | `gpt-image-1.5` | `gpt-image-1.5` |
| `--size <value>` | no | `auto` | `auto`, `1024x1024`, `1536x1024`, `1024x1536` |
| `--quality <value>` | no | `auto` | `auto`, `high`, `medium`, `low` |
| `--background <value>` | no | `auto` | `auto`, `transparent`, `opaque` |

OpenAI output file extensions:

- `.png`, `.jpg`, `.jpeg`, `.webp`

Gemini flags (`images-mcp gemini`):

| Flag | Required | Default | Allowed values |
|---|---|---|---|
| `--model <value>` | no | `gemini-3-pro-image-preview` | `gemini-3-pro-image-preview`, `gemini-2.5-flash-image` |
| `--aspect-ratio <value>` | no | unset | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` |
| `--image-size <value>` | no | unset | `1K`, `2K`, `4K` |

Gemini output file extensions:

- `.png`

Grok flags (`images-mcp grok`):

| Flag | Required | Default | Allowed values |
|---|---|---|---|
| `--model <value>` | no | `grok-2-image` | `grok-2-image` |
| `--aspect-ratio <value>` | no | unset | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` |
| `--resolution <value>` | no | unset | `HD`, `FHD` |

Grok output file extensions:

- `.jpg`, `.jpeg`

### CLI Examples

Generate with OpenAI:

```bash
bun run cli.ts openai \
  --prompt "A neon cat in rainy Tokyo, cinematic lighting" \
  --output ./cat.png
```

Generate with OpenAI by piping prompt from stdin:

```bash
cat prompt.txt | bun run cli.ts openai --output ./cat.png
```

Or with stdin redirection:

```bash
bun run cli.ts openai --output ./cat.png < prompt.txt
```

Edit with OpenAI:

```bash
bun run cli.ts openai \
  --prompt "Add snow and keep the cat centered" \
  --output ./cat-snow.png \
  --input ./cat.png
```

Generate with Gemini:

```bash
bun run cli.ts gemini \
  --prompt "A ceramic teapot product photo on white background" \
  --output ./teapot.png \
  --aspect-ratio 4:3 \
  --image-size 2K
```

Edit with Gemini and multiple references:

```bash
bun run cli.ts gemini \
  --prompt "Combine both references into one consistent illustration" \
  --output ./combined.png \
  --input ./ref-1.png \
  --input ./ref-2.png
```

### JSON Output Behavior

Successful runs print formatted JSON to stdout. Shape:

```json
{
  "success": true,
  "path": "/absolute/path/to/output.png",
  "bytes": 123456,
  "...provider_fields": "..."
}
```

Provider-specific success fields:

- OpenAI: `model`, `size`, `quality`, `input_images_count`
- Gemini: `model`, `aspect_ratio`, `image_size`, `input_images_count`

### Errors and Exit Codes

- Exit `0`: Help (`--help`) or successful generation.
- Exit `1`: Argument parsing/validation errors, runtime errors, API/auth errors, file errors.
- Parse/validation errors are written to `stderr` as `<message>` followed by usage.
- Runtime errors are written to `stderr` as `Error: <message>`.

Common parse failures:

- Missing required flags (when neither `--prompt` nor non-empty piped stdin prompt is provided):
  - `Missing required --prompt or --output`
- Missing value for a flag:
  - `Missing value for --output`
- Unknown flags:
  - `Unknown flag(s) for openai: --foo`
- Unexpected positional argument:
  - `Unexpected argument: value`
- Invalid enum value:
  - `Invalid value for --size: "500x500". Allowed values: auto, 1024x1024, 1536x1024, 1024x1536`

## Troubleshooting

### Missing API Key

OpenAI command without `OPENAI_API_KEY` fails in the OpenAI SDK.

Gemini command without both `GEMINI_API_KEY` and `GOOGLE_API_KEY` fails with:

```text
Error: Missing GEMINI_API_KEY or GOOGLE_API_KEY environment variable
```

Grok command without `XAI_API_KEY` fails with:

```text
Error: Missing XAI_API_KEY environment variable
```

Fix -- set keys via config (preferred) or environment variables:

```bash
image-gen keys set openai sk-proj-...
image-gen keys set gemini AIza...
image-gen keys set grok xai-...
```

Or via environment:

```bash
export OPENAI_API_KEY="..."
export GEMINI_API_KEY="..."   # or GOOGLE_API_KEY
export XAI_API_KEY="..."
```

### Invalid or Unsupported Flags

If you pass a flag not supported by the selected command, the CLI exits with code `1` and prints a command-specific unknown-flag message.

If you pass an unsupported value, the CLI prints the allowed values for that flag.

## MCP Server (Also Supported)

The same image functionality is available over MCP/stdin-stdout transport.

Start server:

```bash
bun run start
```

Registered MCP tools:

1. `openai_generate_image`
2. `gemini_generate_image`

Tool parameter defaults/options mirror the same schemas used by the CLI:

OpenAI tool params:

| Parameter | Default | Allowed values |
|---|---|---|
| `prompt` | required | text |
| `output_path` | required | path |
| `model` | `gpt-image-1.5` | `gpt-image-1.5` |
| `input_images` | unset | string[] |
| `size` | `auto` | `auto`, `1024x1024`, `1536x1024`, `1024x1536` |
| `quality` | `auto` | `auto`, `high`, `medium`, `low` |
| `background` | `auto` | `auto`, `transparent`, `opaque` |

Gemini tool params:

| Parameter | Default | Allowed values |
|---|---|---|
| `prompt` | required | text |
| `output_path` | required | path |
| `model` | `gemini-3-pro-image-preview` | `gemini-3-pro-image-preview`, `gemini-2.5-flash-image` |
| `input_images` | unset | string[] |
| `aspect_ratio` | unset | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` |
| `image_size` | unset | `1K`, `2K`, `4K` |
