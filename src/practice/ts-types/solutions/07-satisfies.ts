// SOLUTION · 07 — `satisfies`

type Tool = { schema: { name: string }; run: (args: any) => string };

const annotated: Record<string, Tool> = {
  read_file: { schema: { name: "read_file" }, run: () => "..." },
};
annotated.read_file;
annotated.typo_here; // allowed by `: Record<string, Tool>` — keys were widened to string

const toolset = {
  read_file: { schema: { name: "read_file" }, run: (a: any) => "read " + a.path },
  list_dir: { schema: { name: "list_dir" }, run: () => "a, b, c" },
} satisfies Record<string, Tool>;

toolset.read_file;
// @ts-expect-error — typo caught because `satisfies` kept the exact keys
toolset.read_fil;

// @ts-expect-error — does not satisfy Tool (no `run`); kept on ONE line so the directive catches it
const broken = { bad_tool: { schema: { name: "bad_tool" } } } satisfies Record<string, Tool>;

const tools = Object.values(toolset).map((t) => t.schema);
const firstName: string = tools[0].name;

export {};
