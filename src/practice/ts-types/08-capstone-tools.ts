// ─────────────────────────────────────────────────────────────────────────────
// 08 · CAPSTONE — assemble `tools.ts` for real
// ─────────────────────────────────────────────────────────────────────────────
// Everything at once, building the exact shape from
// docs/harness-structure-reference.md §2. When this file is green you have written
// a real, drift-proof tool library — copy the pattern straight into your harness.
// ─────────────────────────────────────────────────────────────────────────────

import { prompts } from "../../prompts.ts"; // your REAL prompt library

// The contract every tool must meet (a `type`, since it's a closed internal shape):
type Tool = {
  schema: { name: string; description: string };
  run: (args: any) => string;
};

// 1) TODO: the SOURCE OF TRUTH — checked against the contract, exact keys kept.
//    Add `satisfies Record<string, Tool>` to the end.
const toolset = {
  read_file: {
    schema: { name: "read_file", description: "Read a UTF-8 file from disk" },
    run: (a: any) => "contents of " + a.path,
  },
  list_files: {
    schema: { name: "list_files", description: "List files in the working dir" },
    run: () => "a.txt, b.txt",
  },
}; // ← add `satisfies Record<string, Tool>` here

// 2) TODO: `ToolName` = the union of tool names, derived from `toolset`.
type ToolName = string; // hint: keyof typeof toolset
const good: ToolName = "read_file"; // ✅
// @ts-expect-error — not a real tool
const typo: ToolName = "read_fil";

// 3) TODO: derive the schema array the model is sent (never hand-maintained).
//    Finish the line so each entry is a tool's `.schema`.
const tools = Object.values(toolset); // ← map each tool to its `.schema`
const aName: string = tools[0].name; //  ✅ once derived, each entry has a `name`
// @ts-expect-error — a schema has no `.bogus` field
const nope = tools[0].bogus;

// 4) Dispatch by name — exact keys make this lookup safe:
function dispatch(name: ToolName, args: any): string {
  return toolset[name].run(args);
}
dispatch("list_files", {}); // ✅
// @ts-expect-error — unknown tool name
dispatch("delete_everything", {});

// 5) Tie it back to prompts: derive a name union from your REAL personas file.
type PersonaName = keyof typeof prompts.personas;
const persona: PersonaName = "pirateCaptain"; // ✅ a real persona from src/prompts.ts
// @ts-expect-error — not a real persona
const fake: PersonaName = "not-real";

export {};
