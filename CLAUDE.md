# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install          # Install dependencies
bun run start        # Run the MCP server
bun run index.ts     # Run directly
```

## Environment Variables

- `OPENAI_API_KEY` - Required for OpenAI tools
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` - Required for Gemini tools

## Architecture

This is an MCP (Model Context Protocol) server that provides AI image generation tools via stdio transport.

**Single file structure**: All server logic is in `index.ts`:
- Uses `@modelcontextprotocol/sdk` for MCP server setup
- Lazy-loads API clients (OpenAI, GoogleGenAI) on first use
- Registers two tools: `openai_generate_image` and `gemini_generate_image`
- Both tools support generation and editing (via `input_images` parameter)
- OpenAI uses `images.generate()` for new images, `images.edit()` when input images provided
- Gemini builds a contents array with text prompt + optional inline image data

**Tool response format**: Returns JSON with `success`, `path`, `bytes`, and provider-specific metadata.

## Bun

Use Bun instead of Node.js. Prefer `Bun.file()` and `Bun.write()` over node:fs.
