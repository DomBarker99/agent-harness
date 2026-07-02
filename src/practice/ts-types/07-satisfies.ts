// ─────────────────────────────────────────────────────────────────────────────
// 07 · `satisfies`  (check the shape WITHOUT throwing away what you know)
// ─────────────────────────────────────────────────────────────────────────────
// Three ways to attach a type to a value — they are NOT the same:
//
//   const x: T = ...           CHECK against T, but WIDEN x to T (lose exact keys/literals)
//   const x = ... as const     NARROW x to exact literals, but DON'T check it against a shape
//   const x = ... satisfies T   CHECK against T  AND  keep x's exact, narrow type
//
// `satisfies` is the best of both: verify every entry matches a contract while
// still remembering the exact keys for lookup and autocomplete. This is the
// `satisfies Record<string, Tool>` from the harness reference.
// ─────────────────────────────────────────────────────────────────────────────

type Tool = { schema: { name: string }; run: (args: any) => string };

// ── Experiment A: what a PLAIN annotation throws away ────────────────────────
const annotated: Record<string, Tool> = {
  read_file: { schema: { name: "read_file" }, run: () => "..." },
};
annotated.read_file; // ok
annotated.typo_here; // ALSO ok — `: Record<string, Tool>` widened the keys to `string`,
//                      so TS cannot tell this is a typo. No error. (this is the problem!)

// ── Experiment B: fix the typo problem with `satisfies` ──────────────────────
// 1) TODO: `toolset` is annotated `: Record<string, Tool>` — which WIDENS its keys
//    to `string`, so the typo on the marked line slips through and its
//    `@ts-expect-error` is UNUSED (red). Change the `:` to `satisfies` so the exact
//    keys survive: the typo becomes a real error, the directive is used, file green.
const toolset: Record<string, Tool> = {
  read_file: { schema: { name: "read_file" }, run: (a: any) => "read " + a.path },
  list_dir: { schema: { name: "list_dir" }, run: () => "a, b, c" },
}; // ← change `: Record<string, Tool>` above into `satisfies Record<string, Tool>`

toolset.read_file; // must stay known
// @ts-expect-error — typo caught ONLY once you switch to `satisfies` (exact keys kept)
toolset.read_fil;

// 2) `satisfies` still enforces the shape. This tool is missing `run`:
// @ts-expect-error — does not satisfy Tool (no `run`); on ONE line so the directive catches it
const broken = { bad_tool: { schema: { name: "bad_tool" } } } satisfies Record<string, Tool>;

// 3) Because the exact keys/values survived, deriving the schema array just works:
const tools = Object.values(toolset).map((t) => t.schema);
const firstName: string = tools[0].name; // ✅ TS knows each schema has a `name`

export {};
