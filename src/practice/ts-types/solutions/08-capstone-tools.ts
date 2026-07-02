// SOLUTION · 08 — capstone tools.ts

import { prompts } from "../../../prompts.ts";

type Tool = {
  schema: { name: string; description: string };
  run: (args: any) => string;
};

const toolset = {
  read_file: {
    schema: { name: "read_file", description: "Read a UTF-8 file from disk" },
    run: (a: any) => "contents of " + a.path,
  },
  list_files: {
    schema: { name: "list_files", description: "List files in the working dir" },
    run: () => "a.txt, b.txt",
  },
} satisfies Record<string, Tool>;

type ToolName = keyof typeof toolset;
const good: ToolName = "read_file";
// @ts-expect-error — not a real tool
const typo: ToolName = "read_fil";

const tools = Object.values(toolset).map((t) => t.schema);
const aName: string = tools[0].name;
// @ts-expect-error — a schema has no `.bogus` field
const nope = tools[0].bogus;

function dispatch(name: ToolName, args: any): string {
  return toolset[name].run(args);
}
dispatch("list_files", {});
// @ts-expect-error — unknown tool name
dispatch("delete_everything", {});

type PersonaName = keyof typeof prompts.personas;
const persona: PersonaName = "pirateCaptain";
// @ts-expect-error — not a real persona
const fake: PersonaName = "not-real";

export {};
