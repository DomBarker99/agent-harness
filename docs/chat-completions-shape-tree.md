# Chat Completions — request & response shape tree

**One expanded tree for what you SEND (`ChatCompletionCreateParams`) and what you GET BACK
(`ChatCompletion`), so you don't have to bounce through the SDK types each time.**

*Generated from the installed `openai` types — version `6.42.0`. Source of truth is always
`node_modules/openai/resources/chat/completions/completions.d.ts`; regenerate this when you bump the SDK.*

Conventions: `?` = optional · no `?` = required · `|` = union · `« … »` = pruned branch (note says what)
· message branches are keyed by their discriminant `role`.

---

## 1. Request — `client.chat.completions.create(params)`

`ChatCompletionCreateParams = …NonStreaming | …Streaming` — both extend `ChatCompletionCreateParamsBase`.
The two required fields are **`messages`** and **`model`**; everything else is optional.

```
ChatCompletionCreateParams
├─ messages: Array<ChatCompletionMessageParam>     // REQUIRED — discriminated by `role`
│   ├─ system     { role: "system",    content: string | ContentPartText[],  name?: string }
│   ├─ developer  { role: "developer", content: string | ContentPartText[],  name?: string }   // o1+ replacement for system
│   ├─ user       { role: "user",      content: string | ContentPart[],      name?: string }
│   │                 └─ ContentPart = ContentPartText | ContentPartImage | ContentPartInputAudio | File
│   │                      ├─ text        { type: "text",        text: string }
│   │                      ├─ image_url   { type: "image_url",   image_url: { url: string, detail?: "auto"|"low"|"high" } }
│   │                      ├─ input_audio { type: "input_audio", input_audio: { data: string, format: "wav"|"mp3" } }
│   │                      └─ « file » — PDF/file input; rarely used for a local model
│   ├─ assistant  { role: "assistant",
│   │                 content?:    string | Array<ContentPartText | ContentPartRefusal> | null,  // required UNLESS tool_calls present
│   │                 name?:       string,
│   │                 refusal?:    string | null,
│   │                 tool_calls?: Array<ChatCompletionMessageToolCall>,   // see §3
│   │                 « audio?, function_call? » }                          // audio reply id; function_call deprecated
│   ├─ tool       { role: "tool",     content: string | ContentPartText[], tool_call_id: string }   // result of ONE tool call
│   └─ « function » — deprecated, replaced by the `tool` role
│
├─ model: (string & {}) | Shared.ChatModel         // REQUIRED — any string (lets you pass "gemma-…" to a local server)
│
├─ tools?: Array<ChatCompletionTool>               // ChatCompletionTool = FunctionTool | CustomTool
│   ├─ function  { type: "function",
│   │               function: FunctionDefinition {
│   │                 name: string,                 // ^[a-zA-Z0-9_-]{1,64}$
│   │                 description?: string,
│   │                 parameters?:  { [key: string]: unknown },   // JSON Schema object
│   │                 strict?:      boolean | null } }
│   └─ « custom » { type: "custom", custom: { name, description?, format?: text|grammar } }   // free-text/grammar tools
│
├─ tool_choice?: "none" | "auto" | "required"
│                | { type: "function", function: { name: string } }   // force one specific tool
│                | « allowed_tools / custom variants »
├─ parallel_tool_calls?: boolean
│
│   ── sampling / length (the knobs you'll actually turn) ──
├─ temperature?:            number | null           // 0–2
├─ top_p?:                  number | null           // nucleus; alter this OR temperature, not both
├─ max_completion_tokens?:  number | null           // preferred cap
├─ max_tokens?:             number | null           // DEPRECATED → use max_completion_tokens
├─ frequency_penalty?:      number | null           // -2..2
├─ presence_penalty?:       number | null           // -2..2
├─ stop?:                   string | string[] | null
├─ n?:                      number | null           // # choices; keep 1
├─ seed?:                   number | null           // DEPRECATED beta determinism
│
│   ── streaming ──
├─ stream?:         false | null   (NonStreaming)   // the `stream` literal is what splits the two param types
│              or   true           (Streaming)
├─ stream_options?: { include_usage?: boolean, … } | null
│
│   ── output format ──
├─ response_format?: ResponseFormatText | ResponseFormatJSONObject | ResponseFormatJSONSchema
│                      └─ json_schema: { type: "json_schema", json_schema: { name, schema, strict? } }   // Structured Outputs
├─ reasoning_effort?: "none"|"minimal"|"low"|"medium"|"high"|"xhigh" | null
├─ verbosity?:        "low" | "medium" | "high" | null
├─ logprobs?:         boolean | null
├─ top_logprobs?:     number | null                 // needs logprobs: true
├─ logit_bias?:       { [tokenId: string]: number } | null
├─ metadata?:         { [key: string]: string } | null
├─ store?:            boolean | null
└─ « prediction, modalities, audio, moderation, web_search_options, service_tier,
      prompt_cache_key, safety_identifier, user(dep), functions(dep), function_call(dep) »
        — hosted-OpenAI / multimodal / deprecated; ignore for a local text+tools harness
```

---

## 2. Response — the awaited return of `.create()` (non-streaming)

```
ChatCompletion
├─ id:      string
├─ object:  "chat.completion"                       // literal — handy discriminant vs a stream chunk
├─ created: number                                   // unix seconds
├─ model:   string
├─ choices: Array<ChatCompletion.Choice>             // length 1 unless you sent n>1
│   └─ Choice {
│        index:         number,
│        finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | "function_call",
│        logprobs:      { content: TokenLogprob[]|null, refusal: TokenLogprob[]|null } | null,
│        message:       ChatCompletionMessage {       // ← THIS is what you read / feed back
│          role:        "assistant",                  // always
│          content:     string | null,                // null when the model called a tool instead
│          refusal:     string | null,
│          tool_calls?: Array<ChatCompletionMessageToolCall>,   // see §3
│          « annotations?, audio?, function_call? » } }          // web-search citations / audio / deprecated
│
├─ usage?: CompletionUsage {
│            prompt_tokens:     number,
│            completion_tokens: number,
│            total_tokens:      number,
│            prompt_tokens_details?:     { cached_tokens?, audio_tokens? },
│            completion_tokens_details?: { reasoning_tokens?, audio_tokens?,
│                                          accepted_prediction_tokens?, rejected_prediction_tokens? } }
└─ « service_tier?, system_fingerprint?(dep), moderation? »
```

---

## 3. Tool calls — the shape both sides share

The model emits these inside `choices[].message.tool_calls`; you echo them back inside an
assistant message, then answer each with a `tool` message.

```
ChatCompletionMessageToolCall = FunctionToolCall | CustomToolCall
└─ function  ChatCompletionMessageFunctionToolCall {
     id:       string,                 // pair the tool result back to this via tool_call_id
     type:     "function",
     function: { name:      string,
                 arguments: string } }  // ⚠️ JSON *string*, NOT an object — JSON.parse it, and it may be invalid
```

---

## The asymmetry that causes the doc-bouncing

**What you send ≠ what you receive**, even for the assistant turn:

| Direction | Type | content |
| --- | --- | --- |
| send (input) | `ChatCompletionAssistantMessageParam` | `content?: string \| (Text\|Refusal)[] \| null` |
| receive (output) | `ChatCompletionMessage` | `content: string \| null` |

The received `ChatCompletionMessage` is assignable to the assistant *param*, so the loop is just:
**push `res.choices[0].message` straight back into `messages`**, then (if it had `tool_calls`) push one
`{ role: "tool", tool_call_id, content }` per call, and call `.create()` again.

Two gotchas the tree encodes:
1. `message.content` is **`null`** when the model called a tool — branch on `tool_calls`, not on `content`.
2. `tool_calls[].function.arguments` is a **string** — `JSON.parse` it (defensively; the model can emit invalid JSON).
