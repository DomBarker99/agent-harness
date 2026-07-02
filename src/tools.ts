// We must create an object which contains all of our tools definitions along side
//  the functions used to execute them. An array will also be included which contains only
//  the tools to pass in model calls

import OpenAI from "openai";
import {exec} from "node:child_process";

// Each tool will be comprised of the schema from OpenAI and
//  a function signature comprising of an any args input (JSON object schema),
//  and a string or string Promise output.

/**
 *  Type literal Vs Valye litteral
 *
 *  Type literals are used to define the shape of an object, and represent
 *      a contract that must be implimented. The type can have multiple fields
 *      which are sepected by semi colonos instead of the traditional commas.
 */

/**
 *  The output of a command has 3 different streams attached to it,
 *  stdin, stderr, and the exit code it produces. The exit codes will
 *  return a number corresponding to the success of a programs execution.
 *  0 means it was succesfull and anything means failure. stdout is used
 *  purely for programs output and is meant to be potentially passed to
 *  another program for use. stderr is used to output anything the operator
 *  should see wether or not it is acutally an error. To understand the
 *  full scope of a programs output, both must be included.
 */

/**
 * Working with exec:
 *      Exec takes in a string representing the command to run. It then can be passed a callback
 *      function which defines what to do with the stdout, stderr, and Error it produces. Alternatively
 *      the exec returns a ChildProcess object which hands you data streams representing each of those
 *      outputs. Whats nice about using the call backs is that the callback only gives you the data
 *      upon completion of the program instead of having to handle the streams coming from the
 *      ChildProcess.
 *
 *      The issue is if we are using the callback to get our output, we need some way to both get
 *      it out of the callback and also know when it is done. The best way to do this is with a promise.
 *      We can have the callback function call the resolve in Promise so .then is used to get the output
 *      when it is ready. We cant call return within the callback because it will return back to the
 *      subprocess and not the fucntion that ran the exec.
 */
type Tool = {
    schema : OpenAI.ChatCompletionTool;
    run : (args : any) => string | Promise<string>;
};

// NOTE: args is an object in the same shape as whatever is defined in properties,
//  individual fields must be used such as args.command,
export const toolset = {
    run_bash : {
        schema: {
            type : "function",
            function : {
                name: "run_bash",
                description : "run a bash command and return its stdout/stderr.",
                parameters : {
                    type : "object",
                    additionalProperties : "false",
                    properties : {
                        command : {
                            type : "string",
                            description : "The bash command to execute"
                        }
                    }
                },
                strict : true
            }
        },
        run: function (args: any): Promise<string> {
            return new Promise<string>((resolve) => {
                exec(args.command, (error, stdout, stderr) => {
                    let exitCode = error ? `exit code: ${error.code ?? `killed by ${error.signal}`}` : "exit code : 0"

                    resolve(`${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`)
                })
            })
        }
    }

} satisfies Record<string, Tool>;

// To allow for safe indexing of the toolset object, a type predicate can be used to change the
//  type of a variable. What this function does is it takes in a variable and if that string
//  is in the union of AvailableTools, the variable will now be of whatever type it matches in the union
export function isAvailableTool(toolName : string) : toolName is AvailableTools{
    return toolName in toolset
}

// Provide an easily exportable array of schemas to provide for model calls.
export const toolSchemas = Object.values(toolset).map((t) => t.schema);
export type AvailableTools = keyof typeof toolset;
