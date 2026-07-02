# Harness structure reference

**The agreed-on file layout for the harness, with the full example code for each piece and notes on *why* each shape was chosen.** Use this as the template when filling the files in.

*Last reviewed: June 2026.*

## TL;DR — three files, three shapes

| File | What it exports | Shape | Why this shape |
| --- | --- | --- | --- |
| `prompts.ts` | `prompts` object + derived types | nested object, `as const` | grab-bag of strings; buckets group them; `as const` keeps exact literals |
| `tools.ts` | `toolset` object + derived `tools` array | object keyed by name | the model looks tools up *by name* — an object does that in one step |
| `harness.ts` | `AgentHarness` **class** | class | it holds state across calls (client, config, message history) |

The guiding idea: pick the shape from how the value is *used*, not from habit.

---

## 1. `prompts.ts` — the prompt library

Strings, grouped into five buckets. Two kinds of thing live here and are used differently:

- **Fragments** (`format` / `behavior` / `safety` / `task`) — small rules you **stack** together.
- **Personas** — complete characters you **pick one** of.

### Structure

```ts
export const prompts = {
  format:   { plainText, markdown, concise, json },
  behavior: { toolUse, honesty, planThenAct, askWhenUnclear },
  safety:   { refuseHarmful, stayInScope, protectSecrets },
  task:     { codeReviewer, summarizer, explainer, extractor },
  personas: { pineapple, spookyGhost, pirateCaptain, socraticTutor,
              terseRobot, oversharingFriend, factBot, tinfoilBot },
} as const;
```

(The full prompt text lives in `src/prompts.ts` — this is just the skeleton.)

### Derived types

```ts
export type PersonaName  = keyof typeof prompts.personas;
export type FormatRule   = keyof typeof prompts.format;
export type BehaviorRule = keyof typeof prompts.behavior;
```

Read right-to-left:

```
prompts.personas         → the variable
typeof prompts.personas  → its inferred type { readonly pineapple: "..."; ... }
keyof typeof ...         → a union of just the keys: "pineapple" | "spookyGhost" | ...
type PersonaName = ...   → name that union
export ...               → make it importable (erased at runtime)
```

The payoff: add a persona and the type updates itself. Typos become compile errors:

```ts
function loadPersona(name: PersonaName): string {
  return prompts.personas[name];
}
loadPersona("pirateCaptain"); // ✅
loadPersona("pirate");        // ❌ not a real persona key
```

### Why these choices

- **Nested object, not flat** — buckets separate "ingredients you combine" from "whole meals you pick between."
- **`as const`** — locks values to their exact literal strings and makes them read-only, so the derived types are precise.
- **camelCase keys** — once they're properties inside `prompts`, the `const` already signals "constant"; SCREAMING_CASE is redundant.

### Usage

```ts
import { prompts, type PersonaName } from "./prompts.ts";

const system = prompts.personas.pirateCaptain + "\n" + prompts.format.plainText;
```

---

## 2. `tools.ts` — the tool library

A tool is **two things**: the `schema` the model sees, and the `run` function that executes when it's called. Keep them together so they can't drift apart.

### Recommended: co-located object + derived array

```ts
import OpenAI from "openai";
import * as fs from "node:fs";

type Tool = {
  schema: OpenAI.Chat.ChatCompletionTool;
  run: (args: any) => string | Promise<string>;
};

export const toolset = {
  read_file: {
    schema: {
      type: "function",
      function: {
        name: "read_file",
        description: "Read a UTF-8 file from disk",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    },
    run: (args) => fs.readFileSync(args.path, "utf8"),
  },
  // more tools...
} satisfies Record<string, Tool>;

// the array the model wants — derived, so it can never go out of sync
export const tools = Object.values(toolset).map((t) => t.schema);
```

Dispatch when the model asks for a tool:

```ts
import { tools, toolset } from "./tools.ts";

const result = await toolset[name].run(JSON.parse(args));
```

### Why an object, not an array

A tool is used in two moments:

1. Send the model the **list** of all schemas → an array is fine.
2. The model picks one **by name** → you need fast lookup.

An array makes #2 a search; an object keyed by name makes it one step (`toolset["read_file"]`). So `toolset` is the object (the source of truth) and `tools` is the array *derived* from it for #1.

### Why a `type Tool`

It's a shape checklist — "every tool must have a `schema` and a `run`." Without it, you could forget `run` and only find out when it crashes at runtime; with it, TypeScript catches it as you type.

### Why `satisfies Record<string, Tool>` (not `: Record<string, Tool>`)

`satisfies` **checks** every entry matches `Tool` *without widening the type*, so you keep the exact tool names (`read_file`, …) for autocomplete and key-based lookup. A plain `:` annotation would verify the shape but flatten the keys to a generic `string`. Same spirit as `as const`: verify without losing precision.

### `type` vs `interface` for `Tool`

Both work here. `type` was chosen because:
- `Tool` is a closed, internal shape — not meant to be `extend`ed or `implement`ed.
- It keeps one keyword across the project (the derived types use `type`).
- `type` can't be accidentally redeclared/merged the way `interface` can.

Rule of thumb: `interface` for object shapes meant to be extended; `type` otherwise.

### Simpler alternative (two parallel exports)

Fine if you don't mind keeping two structures in step:

```ts
export const tools: OpenAI.Chat.ChatCompletionTool[] = [ /* schemas */ ];
export const toolImpls: Record<string, (a: any) => string> = { read_file: /* ... */ };
```

The co-located version is preferred because schema and implementation live in one place.

---

## 3. `harness.ts` — the agent loop

A **class**, because it owns state across calls: the client, the model id, the system prompt, and the growing message history. Construct it once, call `.run()` repeatedly.

```ts
import OpenAI from "openai";

type ToolMap = Record<string, { run: (args: any) => string | Promise<string> }>;

export class AgentHarness {
  private client: OpenAI;
  private messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  constructor(
    private opts: {
      system: string;
      tools: OpenAI.Chat.ChatCompletionTool[];
      toolset: ToolMap;
      model?: string;
    },
  ) {
    this.client = new OpenAI({ baseURL: "http://gemma.lan/v1", apiKey: "local" });
    this.messages.push({ role: "system", content: opts.system });
  }

  async run(task: string): Promise<string> {
    this.messages.push({ role: "user", content: task });
    // call the model -> run the tool calls it asks for -> feed results back -> repeat
    return "final answer";
  }
}
```

### Class vs function

- **Function** — right when it's one stateless call: `runAgent({ task, tools, system })`.
- **Class** — right here, because the harness carries state (message history) between turns.

---

## Putting it together

```ts
import { AgentHarness } from "./harness.ts";
import { tools, toolset } from "./tools.ts";
import { prompts } from "./prompts.ts";

const agent = new AgentHarness({
  system: prompts.behavior.toolUse + "\n" + prompts.format.plainText,
  tools,
  toolset,
});

await agent.run("create a file called notes.txt");
```

## The one-line rationale per shape

- **Strings → named consts in a nested object:** the import *is* the value; buckets organize them.
- **Tools → object keyed by name, array derived:** the model looks tools up by name.
- **Harness → class:** it holds state (history) across calls.
