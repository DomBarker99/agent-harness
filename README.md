# agent-harness

A minimal **agent harness** in TypeScript: an LLM running in a loop with tools, pointed at a **local, OpenAI-compatible model**. No API credits, no build step, ~60 lines.

> An agent harness is the code around a model that turns a text predictor into something that takes actions. Call the model, run the tool calls it asks for, feed the results back, repeat until it's done. That loop is the whole idea. Everything else (Claude Code included) is elaboration on top of it.

## Prerequisites

- **Node 25+** runs TypeScript directly by stripping the types, so there is no build step.
- A **local OpenAI-compatible endpoint**. The defaults target `http://gemma.lan/v1` (llama.cpp serving `gemma-4-12b`). Any llama.cpp / vLLM / Ollama server works.

## Setup and run

```bash
npm install
npm start
```

`npm start` runs the default task ("list files, tell me the largest"). Pass your own:

```bash
npm start -- "read package.json and summarize the scripts"
```

Type-check it (handy while learning TS, since Node runs the code but never checks types):

```bash
npm run typecheck
```

### Switching models

It works out of the box against `gemma.lan`. To point somewhere else, copy `.env.example` to `.env` and edit it. See [Endpoints](#endpoints).

## How it works

`src/agent.ts` has three parts:

1. **`tools`** is the JSON schema of what the model is *allowed* to call. It can only request these.
2. **`execute()`** is *your* code that actually runs a tool call. The model never runs anything itself. It only asks, and you decide what happens.
3. **`agent()`** is the loop. Send the messages plus the tools. If the reply has `tool_calls`, run them and append each result as a `role: "tool"` message, then loop. If it has no tool calls, it is done, so return the text.

That `while` loop is the harness.

## Roadmap

Each step is a small lesson layered onto the loop. Tackle them in order.

- [ ] **1. Permission gate.** Confirm (or allowlist) before `run_bash` executes. The single most important real-world layer. Right now it runs whatever the model emits.
- [ ] **2. Streaming.** Set `stream: true` so you watch tokens arrive instead of waiting per turn.
- [ ] **3. Tool registry plus more tools.** Add `read_file`, `write_file`, `list_dir`. Replace the `if/else` in `execute()` with a `Map`.
- [ ] **4. Robust tool I/O.** Wrap the `JSON.parse` of the arguments and feed parse/exec errors back as tool results so the model can self-correct.
- [ ] **5. Context management.** When `messages` grows large, summarize older turns. (gemma gives you 262K tokens of context, so this comes later, but prefill cost is the real ceiling.)
- [ ] **6. Sub-agents.** A tool whose implementation calls `agent()` again with a fresh message list. This is exactly how Claude Code spawns a subagent.

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
