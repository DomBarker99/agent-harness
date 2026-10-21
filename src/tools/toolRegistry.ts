import {exec} from "node:child_process";
import os from "node:os";
import {z} from "zod"
import type {ChatContentItems, ChatContentText, ChatFunctionToolFunction} from "@openrouter/sdk/models";
import {runBashTool} from "./runBash.ts";
import {systemInfoTool} from "./systemInfo.ts";
import {webSearchTool} from "./webSearch.ts";
import {generateImageTool} from "./generationTools/generateImage.ts";
import type {EventPipeline, SessionInfo} from "../eventPipeline.ts";
import {generateVideoTool} from "./generationTools/generateVideo.ts";

/*
    Every tool the model can call, each defined as: schema (what the model is told),
    args (Zod validator for what the model sends back), and run (the implementation).
    Assembled into the `toolset` object at the bottom, alongside the helpers the dispatch
    loop uses.
 */

// ════ TYPES ═════════════════════════════════════════════════════════════════════════

// args is `any` by design — the dispatch loop can't know at compile time which tool it
//  holds, and runtime safety comes from Zod instead (a generic version is deferred). Each
//  run function annotates its own parameter with z.infer<typeof itsArgsSchema> to stay
//  in sync with its schema.
export type ToolFunction = (args : any, session : SessionInfo) => ChatContentItems[] | Promise<ChatContentItems[]>;

export type Tool = {
    schema : ChatFunctionToolFunction;
    // Runtime validator for the model's arguments
    args : z.ZodType;
    run : ToolFunction;
};

// Depends on the `toolset` object defined lower down. Legal because types resolve
//  order-independently — a value could not do this.
export type AvailableTools = keyof typeof toolset;

// ════ FUNCTIONS ═════════════════════════════════════════════════════════════════════

// ──── helper functions ────

// Type predicate so an arbitrary runtime string can safely index toolset
export function isAvailableTool(toolName : string) : toolName is AvailableTools{
    return toolName in toolset
}

// ──── the tool registry (depends on the functions and schemas above) ────

export const toolset = {
    run_bash : runBashTool,
    harness_system_info : systemInfoTool,
    web_search : webSearchTool,
    generate_image : generateImageTool,
    generate_video : generateVideoTool
} satisfies Record<string, Tool>;

// ──── the schemas-only array passed on every model call (depends on toolset) ────

export const toolSchemas = Object.values(toolset).map((t) => t.schema);