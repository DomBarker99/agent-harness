# agent-harness

An experimental TypeScript agent loop with tools and an [Ink](https://github.com/vadimdemedes/ink) terminal interface. It uses [OpenRouter](https://openrouter.ai) for model access, keeps conversation history during a session, streams responses and dispatches tool calls.

## Setup

Requires **Node.js 22.12 or newer**, npm and a terminal. Shell tools use `/bin/bash`. Media-processing tasks may also need FFmpeg/ffprobe installed on your machine.

```bash
git clone https://github.com/DomBarker99/agent-harness.git
cd agent-harness
npm ci
cp .env.example .env
```

Edit `.env` before running:

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Required. Your OpenRouter API key. |
| `OPENROUTER_MODEL` | Required. A text model ID with tool-calling support that your account can access. Choose one from the [OpenRouter model catalog](https://openrouter.ai/models). |
| `OPENROUTER_BASE_URL` | Optional. Defaults to `https://openrouter.ai/api/v1`. An explicit override applies to chat, model lookup, media-model discovery and media generation. Include the complete API base path when using a development proxy. |

Model capabilities and prices vary. The `.env` file is ignored by Git, and values already set in your environment take precedence over that file.

Check configuration without sending an API request:

```bash
npm start -- --check
```

## Interactive chat

```bash
npm start
```

This opens the chat input and waits for your message. Type a prompt and press Enter. Press Ctrl+C to exit. An interactive terminal is required for this mode.

For a small first turn, try: `Explain what an agent harness does in three sentences. Do not call any tools.` This sends a model request and may incur charges, but does not ask the agent to modify files or generate media.

## One explicit prompt

```bash
npm start -- --prompt "Explain what an agent harness does in three sentences. Do not call any tools."
```

This uses the existing noninteractive terminal renderer and submits only the prompt you provide. It is not a JSON-output or stdin-pipeline interface. Empty prompts, unknown flags and non-terminal startup without `--prompt` fail with an actionable message.

```bash
npm start -- --help
```

Help works without credentials. The experimental helper functions retained in `src/main.ts` are inactive unless deliberately wired up in source.

## Tools and limits

The registry includes shell execution, system information, web search and experimental image/video tools. Shell commands run as your user from the harness's working directory. The harness is **not a sandbox** and does not ask for confirmation before each tool call. Use an appropriate scratch directory when trying tasks that can write files.

This is a learning prototype, not a production agent service. Session history is in memory. Media behavior and availability depend on the selected model/API. The unfinished transcription prototype is inactive and is not registered as a tool.

## Verification

```bash
npm run typecheck
npm test
```

Tests cover startup/configuration errors, offline help and configuration checks, a one-shot turn and media-model discovery against local mock HTTP servers. The mocks verify the configured endpoint/model and exact supplied prompt without real credentials, paid model calls or generated media. Passing these checks does not establish live-provider or end-to-end media compatibility.

## Layout

```text
src/main.ts          CLI startup and retained experimental helpers
src/config.ts        argument parsing and shared OpenRouter configuration
src/TUI.tsx          terminal UI
src/chatSession.ts   session and conversation history
src/turnRunners.ts   streamed responses and tool-call loop
src/tools/           shell, web search, system info and media tools
test/                offline startup and local mock-server checks
```
