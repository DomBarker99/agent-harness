# Chat Completions vs Responses API

**Why this repo uses the Chat Completions API, and whether that's still the right call.**

*Last reviewed: June 2026. This landscape moves fast — re-check the dated claims before relying on them.*

## TL;DR

This harness talks to its local model through the **Chat Completions API** (`POST /v1/chat/completions`), via the `openai` SDK call `client.chat.completions.create(...)` in [`src/agent.ts`](../src/agent.ts). That is the correct choice and needs no change:

- Chat Completions is **not deprecated** — it's the universal, cross-provider standard.
- Our server (`gemma.lan`, llama.cpp) speaks Chat Completions **natively** and does **not** natively serve the newer Responses API.
- The Responses API offers no benefit on llama.cpp today (no native path), and switching would cost portability.

Only revisit this if you point the harness at OpenAI's own servers (to use their hosted tools / server-side state) or need to drive a Responses-only client like Codex CLI — in which case use a translation proxy rather than rewriting the harness.

## The two APIs

| | Chat Completions | Responses |
| --- | --- | --- |
| Endpoint | `/v1/chat/completions` | `/v1/responses` |
| SDK call | `client.chat.completions.create(...)` | `client.responses.create(...)` |
| Input | `messages` array | `input` (string or list) + `instructions` |
| Output | `choices[0].message.content` | `output` array / `output_text` |
| State | Stateless — you resend history each turn | Optional server-side (`previous_response_id`) |
| Tools | Function calling (you execute) | Hosted tools (OpenAI runs web search / code interpreter) + function calling |
| Portability | Universal standard | OpenAI-proprietary protocol |
| Status | Supported, not deprecated | OpenAI's recommended default for new projects |

The harness's loop in `agent.ts` *is* the stateless + you-execute-the-tools model: it keeps appending to `messages` and runs each tool call itself. That maps directly onto Chat Completions.

## Findings (deep research, June 2026)

Each finding notes a confidence level and a verification vote (independent adversarial verifiers; e.g. `3-0` = unanimous).

### 1. Chat Completions is not deprecated — *high (3-0)*
It appears in no deprecation table, has no shutdown date, and no LTS label. OpenAI's migration guide says *"While Chat Completions remains supported, Responses is recommended for all new projects"* — a recommendation, not a mandate. Responses is the replacement for the **sunsetting Assistants API** (shuts down Aug 26, 2026), **not** for Chat Completions.
Sources: [deprecations](https://developers.openai.com/api/docs/deprecations), [migrate-to-responses](https://developers.openai.com/api/docs/guides/migrate-to-responses)

### 2. Chat Completions is the universal standard — *high (3-0)*
Implemented by every major OSS inference server (llama.cpp, vLLM, Ollama, SGLang, TGI, LM Studio, LocalAI) and every rival provider (Anthropic, Gemini, DeepSeek, Grok). Point `base_url` at any of them and the official OpenAI client works.
Sources: [vLLM](https://docs.vllm.ai/en/v0.18.0/serving/openai_compatible_server/), [Ollama](https://docs.ollama.com/api/openai-compatibility), [TGI](https://huggingface.co/docs/text-generation-inference/en/messages_api), [SGLang](https://docs.sglang.ai/basic_usage/openai_api_completions.html)

### 3. Responses API in open-source: real but uneven
| Server | Native `/v1/responses` | Notes |
| --- | --- | --- |
| **vLLM** | ✅ Yes (Oct 2025) | Text-gen only; streaming/stateful still WIP — *3-0* |
| **Ollama** | ✅ Yes (v0.13.3, Dec 2025) | **Non-stateful only** (no `previous_response_id`) — *3-0* |
| **SGLang** | ⚠️ Partial | Built-in + MCP tools, **no custom function tools** (matters for agents) — *3-0* |
| **llama.cpp** (ours) | ❌ No | Open feature request only — *medium* |

Sources: [vLLM #14721](https://github.com/vllm-project/vllm/issues/14721), [Ollama #13595](https://github.com/ollama/ollama/issues/13595), [SGLang #13292](https://github.com/sgl-project/sglang/issues/13292), [llama.cpp #19138](https://github.com/ggml-org/llama.cpp/issues/19138)

### 4. Translation proxies exist — *high (3-0)*
If you ever need to bridge the two protocols:
- **LiteLLM** — bidirectional `/responses ↔ /chat/completions` bridge; can front a chat-only backend with a Responses interface (`use_chat_completions_api: true`).
- **codex-relay** — a small Rust proxy translating Responses → Chat Completions so Codex CLI can use any OpenAI-compatible backend.

Sources: [LiteLLM response_api](https://docs.litellm.ai/docs/response_api), [codex-relay](https://github.com/MetaFARS/codex-relay)

### 5. One real signal toward Responses
OpenAI's own **Codex CLI fully removed Chat Completions support in Feb 2026** — it now *requires* Responses (*3-0*). This is a product decision for that one tool, not a platform-wide API deprecation.
Source: [codex #7782](https://github.com/openai/codex/discussions/7782)

## Recommendation for this harness

**Target Chat Completions** (status quo). It's what `llama-server` natively speaks, it's the cross-provider standard, and it's not deprecated. Responses brings no benefit on llama.cpp.

If a Responses-only consumer must be supported later, put a translation proxy (LiteLLM or codex-relay) **in front of** llama.cpp rather than waiting for native `/v1/responses` or rewriting `agent.ts`.

## Caveats

- **Time-sensitive.** Ollama and vLLM both shipped Responses support *after* the main reference discussion called it missing. Treat every "X doesn't support Y" as having a sell-by date.
- The **llama.cpp** finding is the softest — no source shows native `/v1/responses`, but the precise issue/PR status is murky (two strongly-worded negative claims were refuted in verification).
- Partial ≠ parity: vLLM (text-only) and Ollama (non-stateful) "support Responses" with real gaps.
- No solid data surfaced on **LangChain / LlamaIndex** Responses adoption — unverified here.

## Appendix: how to research an API like this

The three documentation tiers, shallow to deep — useful for any well-documented API:

1. **Guides / `/docs`** — task-oriented prose. *"How does function calling work?"* → [Function calling guide](https://developers.openai.com/api/docs/guides/function-calling)
2. **API Reference / `/docs/api-reference`** — exhaustive per-endpoint parameter spec. *"What exactly does `tools` accept?"* → [Chat reference](https://platform.openai.com/docs/api-reference/chat/create)
3. **SDK source of truth** — the `openai-node` repo: [`api.md`](https://github.com/openai/openai-node/blob/main/api.md) lists every method/type for `client.chat.completions`; the linked [`completions.ts`](https://github.com/openai/openai-node/blob/main/src/resources/chat/completions/completions.ts) holds the precise `ChatCompletionCreateParams` type. These same types live locally in `node_modules/openai/` — use "Go to Definition" in your editor.

Rule of thumb: **Guides to understand a feature, Reference for exact parameters, SDK types for precise shapes.**

### Inspecting the live server

Our llama.cpp server self-describes over plain HTTP (read-only GETs):

```bash
curl -s http://gemma.lan/v1/models | jq   # standard: model id + some meta
curl -s http://gemma.lan/props    | jq    # llama.cpp-specific: context size, sampling defaults, capabilities
curl -s http://gemma.lan/health           # is it up
```

`/props` is the rich one — it reports `n_ctx` (context window), every tunable generation parameter with its default, and capability flags (`supports_tool_calls`, vision/audio modalities). Pipe through `jq` to pretty-print, or `jq '.some.path'` to extract one field.
