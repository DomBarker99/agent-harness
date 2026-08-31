import type {ChatContentItems} from "@openrouter/sdk/models";
import {exec} from "node:child_process";
import type {Tool, ToolFunction} from "./toolRegistry.ts";
import {z} from "zod";

const runBashFunction : ToolFunction = (args : z.infer<typeof runBashArgs>) => {
    return new Promise<ChatContentItems[]>((resolve) => {
        // exec defaults to /bin/sh, which on some systems is not bash — pin the
        //  shell so the description ("bash") stays true and bashisms work.
        exec(args.command, {shell : "/bin/bash"}, (error, stdout, stderr) => {
            let exitCode = error ? `exit code: ${error.code ?? `killed by ${error.signal}`}` : "exit code: 0"

            // One consolidated stream: sections with no content are omitted so the
            //  model never has to skip over empty stdout/stderr blocks.
            let consolidated = [
                `command:\n${args.command}`,
                exitCode,
                stdout ? `stdout:\n${stdout}` : "",
                stderr ? `stderr:\n${stderr}` : "",
            ].filter(Boolean).join("\n")

            resolve([ {
                type : "text",
                text : consolidated
            } ])
        })
    })
}

const runBashArgs = z.object({ command : z.string() })

export const runBashTool : Tool = {
    schema: {
        type : "function",
        function : {
            name: "run_bash",
            description : `Execute a bash command on the user's machine. Returns the exit \
code, stdout, and stderr. Each call runs in a fresh shell from the harness's working \
directory — environment variables and \`cd\` do not persist between calls.`,
            parameters : {
                type : "object",
                additionalProperties : false,
                properties : {
                    command : {
                        type : "string",
                        description : "The bash command to execute"
                    }
                },
                required : ["command"]
            },
        }
    },
    args : runBashArgs,
    run: runBashFunction
}