# Deriving types — a hands-on course

A slow, progressive build-up of the six TypeScript moves the harness reference
leans on: **`as const`**, type-level **`typeof`**, **`keyof`**, **indexed access**
(`T[K]`), **index signatures**, **`Record`**, and **`satisfies`**.

It assumes the TypeScript you already write (explicit annotations, arrays, `|`
unions, `?.` / `??`, async loops) and adds only the new machinery — one idea per
file, each building on the last.

## The one idea behind all six

Right now you **tell** TypeScript every type by hand:

```ts
const tools: OpenAI.ChatCompletionTool[] = [ /* ... */ ];   // you wrote the type
```

These keywords all do the opposite: let the **value** be the source of truth and
have TypeScript **derive** the type from it — so the two can never drift apart.
That's exactly what `keyof typeof prompts.personas` and
`satisfies Record<string, Tool>` are doing in
[`docs/harness-structure-reference.md`](../../../docs/harness-structure-reference.md).
Every file below is one variation of *"stop hand-writing this type; derive it."*

## How to run it

```bash
npm run ts-practice            # checks the exercise files (your working set)
npm run ts-practice:solutions  # checks the answer key (should always be green)
```

`ts-practice` is scoped to **just this folder**, so the rest of the (mid-refactor)
project can't muddy the signal. While you have unfinished `TODO`s it will report
errors — that's expected. **Drive it to green one file at a time;** errors are
grouped by file path, so focus on the file you're in.

## How the self-check works

There's no test runner — **the type-checker is the test.** Each file pins every
answer from *both sides* using two kinds of line:

```ts
const ok: PersonaName = "factBot";   // MUST COMPILE  → if this errors, your type is too strict / wrong

// @ts-expect-error — explains why this should be rejected
const bad: PersonaName = "pirate";   // MUST ERROR    → if this STOPS erroring, TypeScript reports
                                     //                 "unused '@ts-expect-error'" → your type is too LOOSE
```

So **green = correct**: the must-compile lines prove your type isn't too narrow,
and the must-error lines prove it isn't too wide. A `TODO` is usually stubbed with
a deliberately-loose placeholder (`unknown` or `string`) that you replace.

> Your sharpest tool isn't the terminal — it's **hover**. Mouse over any binding
> or `type` in WebStorm to see exactly what TypeScript inferred. Half of each
> exercise is "hover this and confirm it matches the comment."

## The order (each file needs the one before it)

| # | File | Keyword | The "aha" |
|---|------|---------|-----------|
| 01 | `01-as-const.ts` | `as const` | Why values *widen* by default, and how `as const` freezes them to exact, read-only literals. |
| 02 | `02-typeof.ts` | `typeof` (type-level) | Turn a **value** into its **type** — the bridge into the type-world. |
| 03 | `03-keyof.ts` | `keyof` | Turn an object type into the **union of its keys** — the self-maintaining union. |
| 04 | `04-indexed-access.ts` | `T[K]` | Read a type **back out** by key; `T[keyof T]` is the union of all value types. |
| 05 | `05-index-signatures.ts` | `{ [k: string]: V }` | An object whose **keys you don't know yet** — e.g. a name→handler table. |
| 06 | `06-record.ts` | `Record<K, V>` | The same idea as a reusable generic, **plus** exhaustive maps keyed by a union. |
| 07 | `07-satisfies.ts` | `satisfies` | Check a value against a shape **without** throwing away its exact keys. |
| 08 | `08-capstone-tools.ts` | all six | Assemble a real, drift-proof `tools.ts` — the harness reference, for real. |

### One-paragraph reference per rung

- **`as const`** — a primitive `const` keeps its literal type, but object
  *properties* widen back to `string`/`number` even under `const`. `as const`
  freezes a whole value to its exact literals and makes it deeply read-only.
  Without it, the derivations below would collapse to `string`.
- **type-level `typeof`** — in a *type* position, `typeof someValue` means "the
  type TypeScript inferred for that value." (Different from the runtime
  `typeof x === "string"` you already use.) It's how you reference a value's shape
  without retyping it.
- **`keyof`** — `keyof SomeObjectType` is the union of its property names. Chain it:
  `keyof typeof prompts.personas` → `"pirateCaptain" | "spookyGhost" | …`, and it
  updates itself when you add a persona.
- **indexed access `T[K]`** — property access in the type-world. `Prompts["personas"]`
  is the personas type; `Prompts["personas"][PersonaName]` is the union of every
  persona's value type.
- **index signatures** — `{ [name: string]: V }` describes an object with unknown
  keys but uniformly-typed values. Flexible, but it accepts *any* string key (typos
  included).
- **`Record<K, V>`** — your first generic. `Record<string, V>` is the index
  signature in sugar; `Record<"a" | "b", V>` is the superpower: an **exhaustive**
  map that forces every key in the union to be present.
- **`satisfies`** — `: T` checks but widens (loses exact keys); `as const` narrows
  but checks nothing; `satisfies T` does **both** — verify against a contract while
  keeping the precise type for lookup and autocomplete.

## Solutions

A finished, green version of each file lives in [`solutions/`](./solutions).
Try the whole file first — wrestling a red `@ts-expect-error` to green is where the
learning is. Peek only when stuck, then close it and redo the line yourself.

When `08-capstone-tools.ts` is green you've written the `tools.ts` pattern from the
harness reference end-to-end — copy it straight into the harness build.
