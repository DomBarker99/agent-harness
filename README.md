# agent-harness

Minimal TypeScript agent loop with tools, wrapped in an [Ink](https://github.com/vadimdemedes/ink) TUI. Talks to [OpenRouter](https://openrouter.ai) (OpenAI-compatible).

## Run

```bash
npm install
cp .env.example .env   # set OPENROUTER_API_KEY
npm start
```

`npm run typecheck` — `tsc --noEmit`.

## Layout

```
src/main.ts          entry
src/TUI.tsx          terminal UI
src/chatSession.ts   session / history
src/tools/           bash, web search, system info, image/video generation
```
