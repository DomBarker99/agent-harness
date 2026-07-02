# Creating the OpenAI client object

**Where the `new OpenAI({ ... })` constructor and its options are actually documented — and why they're so hard to find.**

*Last reviewed: June 2026 (openai SDK `^6.42.0`).*

## TL;DR

The client constructor options live in **none of the obvious places**. The source of truth is:

1. The **README** of [`openai-node`](https://github.com/openai/openai-node#configuring-the-client) — prose + examples.
2. The **`ClientOptions` interface** shipped with the package: [`node_modules/openai/client.d.ts`](../node_modules/openai/client.d.ts) (line 41). This is the exact, version-matched list of every option. Use "Go to Definition" on `OpenAI` in [`src/agent.ts`](../src/agent.ts) to jump straight to it.

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: process.env.MODEL_BASE_URL ?? "http://gemma.lan/v1",
  apiKey:  process.env.MODEL_API_KEY  ?? "local",
});
```

## Why you couldn't find it

You looked in the two natural spots and both came up empty — that's expected, not you missing something:

| Where you looked | What it actually covers | Why the constructor isn't there |
| --- | --- | --- |
| **platform.openai.com → API Reference** | The HTTP **endpoints** (`/v1/chat/completions`, …) | There is no HTTP endpoint for "construct a client." The constructor is pure client-side SDK code, so it's outside the API reference's scope entirely. |
| **`api.md`** in the `openai-node` repo | Auto-generated list of **resource methods + param/response types** (`client.chat.completions.create`, `ChatCompletionCreateParams`, …) | `api.md` is generated from the OpenAI API spec. The constructor and `ClientOptions` are hand-written SDK plumbing that has no spec entry, so the generator never emits them. |

Rule of thumb: **per-request params** (model, messages, tools, temperature…) are documented in the API reference and `api.md`. **Per-client options** (apiKey, baseURL, timeout, retries…) are only in the README and the `ClientOptions` type.

## The options (`ClientOptions`)

Read straight from `node_modules/openai/client.d.ts` — these are the ones that matter for this harness, but the file is authoritative and version-matched:

| Option | Default | What it does |
| --- | --- | --- |
| `apiKey` | `process.env.OPENAI_API_KEY` | Auth. Accepts a string **or an async function** that returns a string (called before each request — handy for rotating creds). Local servers ignore the value, but it must be non-empty. |
| `baseURL` | `process.env.OPENAI_BASE_URL` ?? `https://api.openai.com/v1` | Point at any OpenAI-compatible server. This is how the harness targets `gemma.lan`. |
| `timeout` | 10 minutes | Per-request timeout in **milliseconds**. Note: timeouts are retried, so worst case wait = `timeout × (maxRetries + 1)`. |
| `maxRetries` | `2` | Retries on network errors / 5xx. |
| `defaultHeaders` | — | Headers sent with every request (e.g. an auth header your proxy wants). |
| `defaultQuery` | — | Query params sent with every request. |
| `fetch` | global `fetch` | Swap in a custom fetch (proxying, logging, mocking in tests). |
| `fetchOptions` | — | Extra `RequestInit` merged into every `fetch` call. |
| `dangerouslyAllowBrowser` | `false` | Must be `true` to run in a browser (exposes your key — don't, for real keys). |
| `logLevel` | `process.env.OPENAI_LOG` ?? `'warn'` | `'debug'` is useful for seeing the actual wire requests. |
| `organization` / `project` | env vars | OpenAI-hosted only; irrelevant for a local model. |

Every option is also optional — `new OpenAI()` with no args works if the env vars are set.

## Inspecting it yourself

Two quick ways to see the real, installed shape rather than trusting docs that may lag your version:

```bash
# The full interface, version-matched to what's installed:
sed -n '41,141p' node_modules/openai/client.d.ts

# Or in your editor: Go to Definition on `OpenAI` in src/agent.ts → client.d.ts
```

See also [`chat-completions-vs-responses.md`](./chat-completions-vs-responses.md) for the per-*request* side (the `.chat.completions.create` call), and the three documentation tiers described in its appendix.
