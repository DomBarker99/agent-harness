// Snapshot of the runtime environment, built entirely from Node's os/process modules.
//
// NOTE: no CLI tool probe (rg, jq, gh, ...) for now — watch transcripts for which tools
//  the model commonly reaches for and only add a probe list if it keeps guessing wrong
//  about what's installed.
import type {ChatContentItems, ChatContentText} from "@openrouter/sdk/models";
import type {Tool, ToolFunction} from "./toolRegistry.ts";
import os from "node:os";
import {z} from "zod";

const harnessSystemInfoFunction : ToolFunction = () => {

    let systemOutput = [
        `platform: ${os.type()} ${os.release()} (${os.arch()})`,
        `time: ${new Date().toString()}`,
        `user: ${os.userInfo().username}`,
        `shell: ${process.env.SHELL ?? "unknown"}`,
        `cwd: ${process.cwd()}`,
        `cpus: ${os.cpus().length}, memory: ${Math.round(os.totalmem() / 1e9)} GB`,
    ].join("\n");

    return [{
        type : "text",
        text : systemOutput
    }]
}

// Thin wrapper so harness.ts can inject the same snapshot into the system prompt at chat
//  creation. The cast narrows ToolFunction's widened return type for this synchronous
//  tool — a consequence recorded in docs/decisions/001.
export function collectSystemInfo() : string {
    return [
        `platform: ${os.type()} ${os.release()} (${os.arch()})`,
        `time: ${new Date().toString()}`,
        `user: ${os.userInfo().username}`,
        `shell: ${process.env.SHELL ?? "unknown"}`,
        `cwd: ${process.cwd()}`,
        `cpus: ${os.cpus().length}, memory: ${Math.round(os.totalmem() / 1e9)} GB`,
    ].join("\n");
}

// Loose z.object on purpose: hallucinated stray args are stripped, not rejected —
//  see docs/decisions/003
const harnessSystemInfoArgs = z.object({})

export const systemInfoTool : Tool = {
    schema: {
        type : "function",
        function : {
            name: "harness_system_info",
            description : `Get information about the system the harness is running in: OS, \
architecture, current time, user, shell, working directory, and hardware.`,
            parameters : {
                type : "object",
                additionalProperties : false,
                properties : {},
                required : []
            },
        }
    },
    args : harnessSystemInfoArgs,
    run : harnessSystemInfoFunction

}