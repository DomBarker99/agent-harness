// A minimal agent harness.
//
// The whole process: call the model -> run the tool calls it asks for ->
// feed the results back -> repeat until it stops asking. That loop (below,
// in agent()) is the harness. Everything else is elaboration on top of it.
//
// Run with:  npm start            (uses the default task)
//            npm start -- "..."   (your own task)
// Node 25 executes this TypeScript directly -- there is no build step.

import OpenAI from "openai";
import { execSync } from "node:child_process";

const client = new OpenAI({
  baseURL: process.env.MODEL_BASE_URL ?? "http://gemma.lan/v1", // your local model, zero credits
  apiKey: process.env.MODEL_API_KEY ?? "local",                 // any non-empty string; local servers ignore it
});
const MODEL = process.env.MODEL_ID ?? "gemma-4-12b";

// 1) Declare the tools the model is ALLOWED to ask for.
const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "run_bash",
      description: "Run a shell command and return its output.",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
];

// 2) Actually run a tool call. This is YOUR code; the model only asks for it.
//    No guardrails yet: it runs whatever the model emits. Roadmap step 1 fixes that.
function execute(name: string, args: any): string {
  if (name === "run_bash") {
    try {
      return execSync(args.command, { encoding: "utf8" }).slice(0, 4000);
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  }
  return `Unknown tool: ${name}`;
}

// 3) The loop.
async function agent(task: string): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: "You are a coding agent. Use tools to finish the task, then report back." },
    { role: "user", content: task },
  ];

  while (true) {
    const res = await client.chat.completions.create({ model: MODEL, messages, tools });
    const msg = res.choices[0].message;
    const toolCalls = msg.tool_calls;

    // No tool calls => the model is done. Return its answer.
    if (!toolCalls?.length) return msg.content ?? "";

    // Record what it asked for, then run each call and feed the results back.
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
    for (const call of toolCalls) {
      if (call.type !== "function") continue; // we only define function tools
      const args = JSON.parse(call.function.arguments);
      const result = execute(call.function.name, args);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
    // loop: the model now sees the results and decides the next step.
  }
}

const task =
  process.argv.slice(2).join(" ") ||
  "List the files in the current directory, then tell me which is largest.";

agent(task)
  .then((answer) => console.log("\n" + answer))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
