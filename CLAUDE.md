# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install          # Install dependencies
bun run start        # Run the MCP server
bun run cli.ts --help  # Show CLI help
bun test             # Run tests
bun run typecheck    # Type-check
```

## Environment Variables

- `OPENAI_API_KEY` - Required for OpenAI tools
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` - Required for Gemini tools

## Architecture

This is an MCP (Model Context Protocol) server that provides AI image generation tools via stdio transport.

**Current file structure**:
- `cli.ts`: CLI argument parsing, usage/help output, command dispatch.
- `mcp.ts`: MCP server setup and tool registration (`openai_generate_image`, `gemini_generate_image`).
- `core.ts`: Shared image generation logic, client initialization, output format checks, file I/O.
- `schemas.ts`: Zod schemas and shared parameter constraints/defaults.

Behavior highlights:
- Both providers support generation and editing (via `input_images` / CLI `--input`).
- OpenAI uses `images.generate()` for new images and `images.edit()` when input images are provided.
- Gemini builds a `contents` array with text prompt + optional inline image data.
- Output extension validation is provider-specific:
  - OpenAI: `.png`, `.jpg`, `.jpeg`, `.webp`
  - Gemini: `.png`

**Tool response format**: Returns JSON with `success`, `path`, `bytes`, and provider-specific metadata.

## Bun

Use Bun instead of Node.js. Prefer `Bun.file()` and `Bun.write()` over node:fs.
