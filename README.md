# agent-harness

A minimal **agent harness** in TypeScript: an LLM running in a loop with tools, wrapped in an [Ink](https://github.com/vadimdemedes/ink) terminal UI, pointed at a **local, OpenAI-compatible model**. No API credits, no build step.

> An agent harness is the code around a model that turns a text predictor into something that takes actions. Call the model, run the tool calls it asks for, feed the results back, repeat until it's done. That loop is the whole idea. Everything else (Claude Code included) is elaboration on top of it.

## Prerequisites

- **Node 22+**. The UI is JSX, which Node's built-in type stripping can't handle, so `tsx` runs it (installed as a dev dependency — still no build step).
- A **local OpenAI-compatible endpoint**. The defaults target `http://gemma.lan/v1` (llama.cpp serving `gemma-4-12b`). Any llama.cpp / vLLM / Ollama server works.

## Setup and run

```bash
npm install
npm start
```

`npm start` launches the TUI. Type a prompt, watch the model call tools (green) and answer (blue).

Type-check it (handy while learning TS, since `tsx` runs the code but never checks types):

```bash
npm run typecheck
```

### Switching models

It works out of the box against `gemma.lan`. To point somewhere else, copy `.env.example` to `.env` and edit it. See [Endpoints](#endpoints).

## How it works

| File | Role |
| --- | --- |
| `src/harness.ts` | **The loop.** `runTurn()` sends the conversation, executes any `tool_calls` in the reply, appends each result as a `role: "tool"` message, and re-prompts until the model answers with plain text. |
| `src/tools.ts` | **The tool registry.** Each entry pairs the JSON schema the model sees with the `run()` function that actually executes the call. The model only *asks*; your code decides what happens. |
| `src/prompts.ts` | System prompts. |
| `src/main.tsx` | The Ink TUI. Renders the message history and feeds user input into `runTurn()`. |

That `while` loop in `runTurn` is the harness.

> Why Chat Completions and not OpenAI's newer Responses API? Short version: Chat Completions is the universal standard, it's what our llama.cpp server speaks natively, and it isn't deprecated.

## Roadmap

Each step is a small lesson layered onto the loop. Tackle them in order.

- [ ] **1. Permission gate.** Confirm (or allowlist) before `run_bash` executes. The single most important real-world layer. Right now it runs whatever the model emits.
- [ ] **2. Streaming.** Set `stream: true` so you watch tokens arrive instead of waiting per turn.
- [ ] **3. More tools.** Add `read_file`, `write_file`, `list_dir` entries to the `toolset` registry.
- [ ] **4. Robust tool I/O.** Wrap the `JSON.parse` of the arguments and feed parse/exec errors back as tool results so the model can self-correct.
- [ ] **5. Context management.** When `messages` grows large, summarize older turns. (gemma gives you 262K tokens of context, so this comes later, but prefill cost is the real ceiling.)
- [ ] **6. Sub-agents.** A tool whose implementation calls the loop again with a fresh message list. This is exactly how Claude Code spawns a subagent.

Finish step 6 and you have rebuilt a small Claude Code.

## Endpoints

| Endpoint | Model | Use it for |
| --- | --- | --- |
| `http://gemma.lan/v1` (default) | `gemma-4-12b` (llama.cpp) | Day-to-day dev. Always up, no GPU juggling. |
| `http://llm.lan/v1` | Qwen3 (vLLM) | Heavier multi-tool chains. Faster prefill, sturdier tool use. |

> Hitting `llm.lan` triggers a GPU swap via your arbiter, which preempts gemma. Develop on gemma and switch to qwen3 only when you need it.

## Graduating to a framework

Once the raw loop clicks, the natural TS home is the **Vercel AI SDK** (`ai` plus `@ai-sdk/openai-compatible`). It is provider-agnostic, points at your local endpoint, and runs the tool loop for you (you just set a step cap). The **OpenAI Agents SDK** (`@openai/agents`) is the alternative. Adopt one *after* hand-rolling the loop, not before, or the abstraction hides the thing you are trying to learn.

Skip the **Claude Agent SDK** for this. It is Claude-only, needs a paid Anthropic key, and abstracts the loop away. You already run it daily as Claude Code, so study that as the reference implementation instead.
