# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install            # Install dependencies
bun run cli.ts --help  # Show CLI help
bun test               # Run tests
bun run typecheck      # Type-check
```

## Environment Variables

- `OPENAI_API_KEY` - Required for the `openai` command
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` - Required for the `gemini` command
- `XAI_API_KEY` - Required for the `grok` command

Keys can also be stored via `image-gen keys set <provider> <value>` in `~/.config/image-gen/config.json`.

## Architecture

This is a CLI for AI image generation across three providers (OpenAI, Google Gemini, xAI Grok).

**File structure**:
- `cli.ts`: CLI argument parsing, usage/help output, command dispatch.
- `core.ts`: Re-exports provider generate functions and shared utilities.
- `openai.ts` / `gemini.ts` / `grok.ts`: Per-provider image generation.
- `core-utils.ts`: Shared utilities — client helpers, output format resolution, file I/O.
- `schemas.ts`: Zod schemas and shared parameter constraints/defaults.
- `metadata.ts`: CLI flag/provider metadata and usage text.
- `keys.ts` / `config.ts`: API key management and config file handling.

Behavior highlights:
- CLI prompt input supports `--prompt "...text..."` or piped stdin when `--prompt` is omitted.
- All providers support generation and editing (via `--input` for reference images).
- OpenAI uses `images.generate()` for new images and `images.edit()` when input images are provided.
- Gemini builds a `contents` array with text prompt + optional inline image data.
- Output extension validation is provider-specific:
  - OpenAI: `.png`, `.jpg`, `.jpeg`, `.webp`
  - Gemini: `.png`
  - Grok: `.jpg`, `.jpeg`

**Output format**: On success the CLI prints formatted JSON with `success`, `path`, `bytes`, and provider-specific metadata.

## Bun

Use Bun instead of Node.js. Prefer `Bun.file()` and `Bun.write()` over node:fs.
