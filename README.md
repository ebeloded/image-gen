# image-gen

Command-line tool for generating and editing images with OpenAI (GPT Image), Google Gemini, and xAI Grok.

## Requirements

- Bun `>=1.0.0`

## Quick Start

```bash
bun install
```

Set API keys (use whichever providers you need):

```bash
export OPENAI_API_KEY="..."
export GEMINI_API_KEY="..."   # or GOOGLE_API_KEY
export XAI_API_KEY="..."
```

## API Key Management

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
image-gen keys               # show all key statuses (masked)
image-gen keys get openai    # print raw key value
image-gen keys delete openai # remove a key
```

Environment variables (`OPENAI_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`, `XAI_API_KEY`) still work alongside the config file. Both are shown in `image-gen keys list`.

A local `.image-gen.json` in the working directory takes precedence over the user config (for project-level overrides).

## Running

Run directly from this repo:

```bash
bun run cli.ts --help
```

After a package install or link, the `image-gen` binary is on your `PATH`:

```bash
image-gen --help
```

## Commands

```bash
image-gen openai [flags]
image-gen gemini [flags]
image-gen grok   [flags]
image-gen keys   [subcommand]
image-gen --help
```

## CLI Flags (Full Reference)

Common flags (all generation commands):

| Flag | Required | Default | Notes |
|---|---|---|---|
| `--prompt <text>`, `-p <text>` | yes* | - | Prompt or edit instructions (`*` can be read from stdin or positional args when `--prompt`/`-p` is omitted) |
| `--output <path>`, `-o <path>` | yes | - | Output file path |
| `--input <path>`, `-i <path>` | no | - | Repeatable input image path (`--input=a.png,b.png` also supported) |
| `--force`, `-f` | no | - | Overwrite output file if it already exists |
| `--help`, `-h` | no | - | Print usage |

Permissive CLI input forms:

- `--flag value`
- `--flag=value`
- short aliases (`-p`, `-o`, `-i`, `-f`)
- positional prompt fallback when `--prompt`/`-p` is omitted

OpenAI flags (`image-gen openai`):

| Flag | Required | Default | Allowed values |
|---|---|---|---|
| `--model <value>` | no | `gpt-image-2` | `gpt-image-2`, `gpt-image-1.5` |
| `--size <value>` | no | `auto` | `auto`, `1024x1024`, `1536x1024`, `1024x1536`, `2048x2048`, `2048x1152`, `3840x2160`, `2160x3840` |
| `--quality <value>` | no | `auto` | `auto`, `high`, `medium`, `low` |
| `--background <value>` | no | `auto` | `auto`, `transparent`, `opaque` (note: `transparent` is not supported on `gpt-image-2`) |

OpenAI output file extensions: `.png`, `.jpg`, `.jpeg`, `.webp`

Gemini flags (`image-gen gemini`):

| Flag | Required | Default | Allowed values |
|---|---|---|---|
| `--model <value>` | no | `gemini-3.1-flash-image-preview` | `gemini-2.5-flash-image`, `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview` |
| `--aspect-ratio <value>` | no | unset | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` |
| `--image-size <value>` | no | unset | `1K`, `2K`, `4K` |

Gemini output file extensions: `.png`

Grok flags (`image-gen grok`):

| Flag | Required | Default | Allowed values |
|---|---|---|---|
| `--model <value>` | no | `grok-2-image` | `grok-2-image` |
| `--aspect-ratio <value>` | no | unset | `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `2:1`, `1:2`, `19.5:9`, `9:19.5`, `20:9`, `9:20` |
| `--resolution <value>` | no | unset | `1k`, `2k` |

Grok output file extensions: `.jpg`, `.jpeg`

## CLI Examples

Generate with OpenAI:

```bash
image-gen openai \
  --prompt "A neon cat in rainy Tokyo, cinematic lighting" \
  --output ./cat.png
```

Generate with OpenAI by piping prompt from stdin:

```bash
cat prompt.txt | image-gen openai --output ./cat.png
```

Or with stdin redirection:

```bash
image-gen openai --output ./cat.png < prompt.txt
```

Edit with OpenAI:

```bash
image-gen openai \
  --prompt "Add snow and keep the cat centered" \
  --output ./cat-snow.png \
  --input ./cat.png
```

Generate with Gemini:

```bash
image-gen gemini \
  --prompt "A ceramic teapot product photo on white background" \
  --output ./teapot.png \
  --aspect-ratio 4:3 \
  --image-size 2K
```

Edit with Gemini and multiple references:

```bash
image-gen gemini \
  --prompt "Combine both references into one consistent illustration" \
  --output ./combined.png \
  --input ./ref-1.png \
  --input ./ref-2.png
```

## JSON Output Behavior

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
- Grok: `model`, `aspect_ratio`, `resolution`, `input_images_count`

## Errors and Exit Codes

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
  - `Invalid value for --size: "500x500". Allowed values: auto, 1024x1024, ...`

## Troubleshooting

### Missing API Key

Each provider command requires its key to be set either in the config file or as an environment variable:

```text
Error: Missing GEMINI_API_KEY or GOOGLE_API_KEY environment variable
Error: Missing XAI_API_KEY environment variable
```

Fix — set keys via config (preferred) or environment variables:

```bash
image-gen keys set openai sk-proj-...
image-gen keys set gemini AIza...
image-gen keys set grok xai-...
```

### Invalid or Unsupported Flags

If you pass a flag not supported by the selected command, the CLI exits with code `1` and prints a command-specific unknown-flag message with a suggestion when a close match exists.

If you pass an unsupported value, the CLI prints the allowed values for that flag.
