# Design handoff — interactive "Chat request shape" tree viewer

**Build a single, self-contained HTML file that renders the `chat.completions.create` REQUEST shape
as an expand/collapse tree, showing the TypeScript type and required/optional status at every level.**

This doc is the spec. The data is embedded below (§4) — the implementer renders that data; they do **not**
need to read the OpenAI SDK. Generated from `openai@6.42.0`.

---

## 1. Goal & context

The author keeps bouncing through SDK `.d.ts` files to remember the exact shape/ordering of a chat
completions **request**. This tool replaces that: one screen, every level of `ChatCompletionCreateParams`,
each node labelled with its type and whether it's required, expandable so you drill only where you care.

Sibling reference (static version, same data): `docs/chat-completions-shape-tree.md`. This tool is the
interactive request-only counterpart.

## 2. Deliverable

- **One file:** `docs/chat-request-tree.html`.
- **Self-contained:** inline `<style>` and `<script>`, no external network deps, no build step, no
  framework. Opens by double-click in any browser. (Same shape as `docs/ink-reference-interactive.html`.)
- Vanilla JS + the embedded data object from §4. Keep it readable; a future bump of the SDK means
  hand-editing the data object, so keep it as legible JSON-like JS at the top of the script.

## 3. What it must do

### 3.1 Render — node display
Each node is one row showing exactly two things:

```
<key><?> : <type>            [REQUIRED | optional]
```

- `key` = field name (e.g. `messages`). Root node key = `ChatCompletionCreateParams`.
- A `?` suffix on the key for optional fields (mirrors TS), AND a right-aligned badge
  `REQUIRED` (bold) / `optional` (muted). Both, intentionally redundant — the badge scans, the `?` matches TS.
- `type` = the TS type string from the data (`type` field). Render verbatim, monospace.
- Rows with children/variants get a disclosure triangle (`▸` collapsed / `▾` expanded). Leaves get none.

**Do NOT show:** JSDoc descriptions, example values, or "why pruned" notes. Type + required only.

### 3.2 The base/variant split (important — the author called this out specifically)
Some nodes are **discriminated unions** or **base+variant** types. For these, the expanded body has
**two zones**:

1. **Common** — fields shared by every variant (render under a subtle `common to all` subheading).
2. **Variants** — one collapsible sub-section per variant, headed by its discriminant
   (e.g. `role: "system"`), containing only that variant's own fields.

Concretely, expanding `messages → (element)` shows a `common to all` zone (`role`, `name?`) and then
one sub-section per role (`system`, `user`, `assistant`, `tool`, …), each listing its specific fields.
The root `ChatCompletionCreateParams` uses the same mechanism for the `stream` split
(common = all base params; variants = NonStreaming `stream?: false|null` / Streaming `stream: true`).

Data encodes this with `kind:"union"`, an optional `common: Node[]`, and `variants: Variant[]`
(see §4 schema). A plain object node just has `children: Node[]`. An array node has `item: Node`.

### 3.3 Interactions (exactly these four — nothing else)
1. **Per-node expand/collapse** — click the row or its triangle. Default state: only the root and the
   `messages` element's variant list expanded one level; everything else collapsed.
2. **Expand all / Collapse all** — two buttons in a sticky top bar; act on the whole tree.
3. **Search / filter** — a text box in the top bar. As the user types, filter to nodes whose `key` OR
   `type` contains the query (case-insensitive); **auto-expand** ancestors of every match and
   **highlight** the matched substring. Empty query restores the default collapsed state. Non-matching
   nodes hide (or dim — implementer's call, but matches must be reachable without manual expanding).
4. **Deep-link to SDK docs** — each node with a `docAnchor` shows a small `↗` link opening
   `https://platform.openai.com/docs/api-reference/chat/create#<docAnchor>` in a new tab. Nodes without
   a `docAnchor` show no link.

### 3.4 Visual
Monospace, terminal-ish, indentation guides for depth. Light by default; dark mode is a nice-to-have, not
required. Keep it legible at 3–5 levels deep — indentation + a thin vertical guide per level. No
animation needed beyond instant show/hide.

## 4. Embedded data (source of truth — `openai@6.42.0`)

Schema:
```ts
type Node = {
  key: string;
  type: string;                 // TS type string, shown verbatim
  required: boolean;            // true → REQUIRED badge + no `?`; false → optional + `?`
  kind: "leaf" | "object" | "array" | "union";
  docAnchor?: string;           // appended to the platform docs create# URL
  children?: Node[];            // kind:"object"
  item?: Node;                  // kind:"array" — the element shape
  common?: Node[];              // kind:"union" — fields shared by all variants
  variants?: { label: string; discriminant: string; fields: Node[] }[]; // kind:"union"
};
```

```js
const REQUEST_TREE = {
  key: "ChatCompletionCreateParams", type: "ChatCompletionCreateParamsBase + stream split",
  required: true, kind: "union", docAnchor: "",
  common: [
    { key: "messages", type: "Array<ChatCompletionMessageParam>", required: true, kind: "array",
      docAnchor: "chat-create-messages",
      item: {
        key: "(element)", type: "ChatCompletionMessageParam", required: true, kind: "union",
        common: [
          { key: "role", type: '"system" | "developer" | "user" | "assistant" | "tool" | "function"', required: true, kind: "leaf" },
          { key: "name", type: "string", required: false, kind: "leaf" }
        ],
        variants: [
          { label: "system", discriminant: 'role: "system"', fields: [
            { key: "content", type: "string | Array<ChatCompletionContentPartText>", required: true, kind: "leaf" }
          ]},
          { label: "developer", discriminant: 'role: "developer"', fields: [
            { key: "content", type: "string | Array<ChatCompletionContentPartText>", required: true, kind: "leaf" }
          ]},
          { label: "user", discriminant: 'role: "user"', fields: [
            { key: "content", type: "string | Array<ChatCompletionContentPart>", required: true, kind: "union",
              common: [],
              variants: [
                { label: "text", discriminant: 'type: "text"', fields: [
                  { key: "text", type: "string", required: true, kind: "leaf" } ]},
                { label: "image_url", discriminant: 'type: "image_url"', fields: [
                  { key: "image_url", type: "{ url: string; detail?: \"auto\"|\"low\"|\"high\" }", required: true, kind: "leaf" } ]},
                { label: "input_audio", discriminant: 'type: "input_audio"', fields: [
                  { key: "input_audio", type: "{ data: string; format: \"wav\"|\"mp3\" }", required: true, kind: "leaf" } ]},
                { label: "file", discriminant: 'type: "file"', fields: [
                  { key: "file", type: "{ file_id?: string; file_data?: string; filename?: string }", required: true, kind: "leaf" } ]}
              ]}
          ]},
          { label: "assistant", discriminant: 'role: "assistant"', fields: [
            { key: "content", type: "string | Array<ChatCompletionContentPartText | ChatCompletionContentPartRefusal> | null", required: false, kind: "leaf" },
            { key: "refusal", type: "string | null", required: false, kind: "leaf" },
            { key: "tool_calls", type: "Array<ChatCompletionMessageToolCall>", required: false, kind: "array",
              item: {
                key: "(element)", type: "ChatCompletionMessageToolCall", required: true, kind: "union",
                common: [ { key: "id", type: "string", required: true, kind: "leaf" } ],
                variants: [
                  { label: "function", discriminant: 'type: "function"', fields: [
                    { key: "function", type: "{ name: string; arguments: string }", required: true, kind: "leaf" } ]},
                  { label: "custom", discriminant: 'type: "custom"', fields: [
                    { key: "custom", type: "{ name: string; input: string }", required: true, kind: "leaf" } ]}
                ]}
            },
            { key: "audio", type: "{ id: string } | null", required: false, kind: "leaf" }
          ]},
          { label: "tool", discriminant: 'role: "tool"', fields: [
            { key: "content", type: "string | Array<ChatCompletionContentPartText>", required: true, kind: "leaf" },
            { key: "tool_call_id", type: "string", required: true, kind: "leaf" }
          ]},
          { label: "function (deprecated)", discriminant: 'role: "function"', fields: [
            { key: "content", type: "string | null", required: true, kind: "leaf" },
            { key: "name", type: "string", required: true, kind: "leaf" }
          ]}
        ]
      }
    },
    { key: "model", type: "(string & {}) | Shared.ChatModel", required: true, kind: "leaf", docAnchor: "chat-create-model" },

    { key: "tools", type: "Array<ChatCompletionTool>", required: false, kind: "array", docAnchor: "chat-create-tools",
      item: {
        key: "(element)", type: "ChatCompletionTool", required: true, kind: "union",
        common: [],
        variants: [
          { label: "function", discriminant: 'type: "function"', fields: [
            { key: "function", type: "Shared.FunctionDefinition", required: true, kind: "object",
              children: [
                { key: "name", type: "string", required: true, kind: "leaf" },
                { key: "description", type: "string", required: false, kind: "leaf" },
                { key: "parameters", type: "{ [key: string]: unknown }  // JSON Schema", required: false, kind: "leaf" },
                { key: "strict", type: "boolean | null", required: false, kind: "leaf" }
              ]}
          ]},
          { label: "custom", discriminant: 'type: "custom"', fields: [
            { key: "custom", type: "{ name: string; description?: string; format?: text|grammar }", required: true, kind: "leaf" }
          ]}
        ]
      }
    },
    { key: "tool_choice", type: '"none" | "auto" | "required" | NamedToolChoice | AllowedToolChoice', required: false, kind: "union",
      docAnchor: "chat-create-tool_choice",
      common: [],
      variants: [
        { label: "string", discriminant: '"none" | "auto" | "required"', fields: [] },
        { label: "named function", discriminant: 'type: "function"', fields: [
          { key: "function", type: "{ name: string }", required: true, kind: "leaf" } ]}
      ]
    },
    { key: "parallel_tool_calls", type: "boolean", required: false, kind: "leaf", docAnchor: "chat-create-parallel_tool_calls" },

    { key: "response_format", type: "ResponseFormatText | ResponseFormatJSONObject | ResponseFormatJSONSchema", required: false, kind: "union",
      docAnchor: "chat-create-response_format",
      common: [],
      variants: [
        { label: "text", discriminant: 'type: "text"', fields: [] },
        { label: "json_object", discriminant: 'type: "json_object"', fields: [] },
        { label: "json_schema", discriminant: 'type: "json_schema"', fields: [
          { key: "json_schema", type: "{ name: string; schema?: object; strict?: boolean|null; description?: string }", required: true, kind: "leaf" } ]}
      ]
    },

    { key: "temperature", type: "number | null", required: false, kind: "leaf", docAnchor: "chat-create-temperature" },
    { key: "top_p", type: "number | null", required: false, kind: "leaf", docAnchor: "chat-create-top_p" },
    { key: "max_completion_tokens", type: "number | null", required: false, kind: "leaf", docAnchor: "chat-create-max_completion_tokens" },
    { key: "frequency_penalty", type: "number | null", required: false, kind: "leaf", docAnchor: "chat-create-frequency_penalty" },
    { key: "presence_penalty", type: "number | null", required: false, kind: "leaf", docAnchor: "chat-create-presence_penalty" },
    { key: "stop", type: "string | null | Array<string>", required: false, kind: "leaf", docAnchor: "chat-create-stop" },
    { key: "n", type: "number | null", required: false, kind: "leaf", docAnchor: "chat-create-n" },
    { key: "seed", type: "number | null", required: false, kind: "leaf", docAnchor: "chat-create-seed" },
    { key: "stream_options", type: "{ include_usage?: boolean } | null", required: false, kind: "leaf", docAnchor: "chat-create-stream_options" },
    { key: "reasoning_effort", type: '"none"|"minimal"|"low"|"medium"|"high"|"xhigh" | null', required: false, kind: "leaf", docAnchor: "chat-create-reasoning_effort" },
    { key: "verbosity", type: '"low" | "medium" | "high" | null', required: false, kind: "leaf" },
    { key: "logprobs", type: "boolean | null", required: false, kind: "leaf", docAnchor: "chat-create-logprobs" },
    { key: "top_logprobs", type: "number | null", required: false, kind: "leaf", docAnchor: "chat-create-top_logprobs" },
    { key: "logit_bias", type: "{ [key: string]: number } | null", required: false, kind: "leaf", docAnchor: "chat-create-logit_bias" },
    { key: "metadata", type: "{ [key: string]: string } | null", required: false, kind: "leaf", docAnchor: "chat-create-metadata" },
    { key: "store", type: "boolean | null", required: false, kind: "leaf", docAnchor: "chat-create-store" },

    { key: "Other optional params", type: "audio, modalities, prediction, moderation, web_search_options, service_tier, prompt_cache_key, safety_identifier, user(dep), functions(dep), function_call(dep)",
      required: false, kind: "object",
      children: [
        { key: "user", type: "string  // deprecated", required: false, kind: "leaf" },
        { key: "functions", type: "Array<…>  // deprecated → tools", required: false, kind: "leaf" },
        { key: "function_call", type: '"none"|"auto"|{name}  // deprecated → tool_choice', required: false, kind: "leaf" },
        { key: "modalities", type: 'Array<"text"|"audio"> | null', required: false, kind: "leaf" },
        { key: "audio", type: "ChatCompletionAudioParam | null", required: false, kind: "leaf" },
        { key: "prediction", type: "ChatCompletionPredictionContent | null", required: false, kind: "leaf" },
        { key: "service_tier", type: '"auto"|"default"|"flex"|"scale"|"priority" | null', required: false, kind: "leaf" },
        { key: "web_search_options", type: "{ search_context_size?; user_location? }", required: false, kind: "leaf" }
      ]
    }
  ],
  variants: [
    { label: "NonStreaming", discriminant: "stream?: false | null", fields: [
      { key: "stream", type: "false | null", required: false, kind: "leaf", docAnchor: "chat-create-stream" } ]},
    { label: "Streaming", discriminant: "stream: true", fields: [
      { key: "stream", type: "true", required: true, kind: "leaf", docAnchor: "chat-create-stream" } ]}
  ]
};
```

## 5. Acceptance criteria
- Opens from `file://` with no console errors and no network requests.
- Root and `messages` element variant list expanded by default; everything else collapsed.
- Every leaf shows `key(?) : type` + a REQUIRED/optional badge; the `?` and badge agree.
- Union/base nodes (`messages` element, root, `tools` element, `tool_choice`, `response_format`,
  `user.content`, `tool_calls` element) render a `common to all` zone + per-variant sub-sections.
- Expand-all reveals every node; collapse-all hides everything but the root.
- Typing `tool` filters to `tools`, `tool_choice`, `parallel_tool_calls`, `tool_call_id`, `tool_calls`,
  auto-expands their ancestors, and highlights the match.
- `↗` links open the right `platform.openai.com/docs/api-reference/chat/create#…` anchor in a new tab;
  nodes without `docAnchor` have no link.

## 6. Non-goals
- Response shape, streaming-chunk shape, tool-result loop. Request only.
- JSDoc text, example values, copy-to-clipboard, editing/building a request, validation.
- Any build tooling, framework, or external asset.
