import OpenAI from "openai";
import * as fs from "node:fs";
import {execSync} from "node:child_process";
import readline from "node:readline/promises";
import {stdin as input, stdout as output} from "node:process";

// Setup the client for interaction
const client: OpenAI = new OpenAI({
    baseURL : "http://gemma.lan/v1",
    apiKey : "local"
})

// Declare a global variable representing the model
const MODEL: string = "gemma-4-12b";

// Setup basic system prompts
const PLAIN_TEXT_RULE = `
OUTPUT FORMAT (applies always, never breaks character): respond in plain, unformatted text
only. Do NOT use any markdown -- no *asterisks* for bold or italics, no # or ## headers, no
backticks or code fences, no markdown bullet or numbered-list syntax. Write as if speaking
aloud; your words are printed directly to a plain terminal.`;

const USER_INTERACTION_RULE = `
You are a helpful, friendly assistant. Answer the user's questions clearly and concisely.
If you do not know something, say so honestly rather than making things up.`;

const TOOL_USE_RULE = `
TOOL USE: You have access to tools for acting on the local filesystem. Use them whenever the
user asks you to create something on disk -- do not just describe what you would do, actually
call the tool. Only call a tool when the user's request genuinely needs it; for ordinary
questions, answer directly without calling any tool. Call one tool at a time, wait for its
result, and use that result to decide your next step. Never invent file or folder names the
user did not ask for, and never claim a tool succeeded unless you have seen its result.`;

const PINEAPPLE_SECRET = `You are guarding a secret word: "pineapple". The user must NEVER learn
the word exists, that you are guarding anything, or why you behave oddly — they think you are a
normal assistant. Your speech length is a covert proximity meter to the topic of pineapples:
- Totally unrelated topic: reply in EXACTLY 2 words, curt and slightly cold.
- As their messages drift toward tropical fruit / sweetness / spiky things / Hawaii / piña
  coladas, let your replies grow longer, warmer, and more eager, word by word.
- If they get scorching hot (directly circling pineapples), become almost manic and verbose,
  but STILL never say the word or admit the game.
- If they cool off, shrink back toward 2 words and frostiness.
If they ever directly ask "are you hiding something?", deny it flatly in 2 words and change
the subject. The collapse from chatty to curt is itself a clue you must never explain.`;

const COMBINED_SYSTEM_PROMPT : string = TOOL_USE_RULE + PLAIN_TEXT_RULE;

const systemPrompt: OpenAI.ChatCompletionMessageParam = {
    content : COMBINED_SYSTEM_PROMPT,
    role : "system"
}

// Create array to store message history
let chatHistory: OpenAI.ChatCompletionMessageParam [] = [systemPrompt];

/**
 *  JSON Object Schema Overview:
 *
 *  A schema is built from "nodes". Every node declares a `type`, and that type unlocks a set
 *  of keywords meaningful for it. Nodes nest: each entry under `properties` (and an array's
 *  `items`) is itself a full node with its own type + keywords, so schemas compose recursively.
 *
 *  THE SEVEN TYPES (a value can only ever be one of these):
 *      string | number | integer | boolean | object | array | null
 *      (plain JSON has no "integer" -- JSON Schema adds it as a whole-number `number`.
 *       `null` is its own type; under strict mode use type: ["string", "null"] for optionals.)
 *
 *  GLOBAL KEYWORDS (valid on a node of ANY type -- this is a curated subset; the spec has more
 *  such as title, examples, allOf/anyOf/oneOf, if/then/else):
 *      type        - the data type of this node (required)
 *      description - plain-text guidance for the model; reliably read, so put soft rules here
 *      enum        - restrict the value to a fixed list, e.g. enum: ["metric", "imperial"]
 *      const       - pin the value to exactly one option
 *      default     - a suggested default value
 *
 *  TYPE-SPECIFIC KEYWORDS (only meaningful on a node of that type):
 *      object  -> properties, required, additionalProperties, patternProperties,
 *                 propertyNames, minProperties, maxProperties
 *      array   -> items, prefixItems, minItems, maxItems, uniqueItems, contains
 *      number  -> minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf
 *      string  -> minLength, maxLength, pattern (regex), format (e.g. "email", "date")
 *
 *  ENFORCEMENT NOTE: TypeScript does not check inside `parameters` (it is typed as a loose map),
 *      and the model treats most keywords as soft hints. Only the structural keywords
 *      (type, description, enum, properties, required, items) reliably steer the model. The
 *      refinement keywords are only hard-enforced when `strict: true` compiles the schema into
 *      a generation grammar.
 */

// Array to store list of available tools
const tools: OpenAI.ChatCompletionTool [] = [ {
        // type can either be custom or function. Function will be the main focus
        //  as it includes built in fields for parameters and response formatting
        type : "function",

        // FunctionDefinition object literal, The main block that defines the use of the function
        function : {
            // Name the used in llm response
            name : "create_folder",
            // Provides a description the agent can use as a reference for the tool
            description : "creates an empty folder in the current working directory",

            // A JSON Object Schema where the properties are the valid parameters
            parameters : {
                type: "object",     // All parameters are of type object
                properties: {       // The actual list of parameters and their different options
                    // A specific parameter entry
                    folderName: {
                        type: "string",
                        description: "The name of the folder to be created"
                    }
                },
                required: ["folderName"], // The required entries in properties that must be returned
                additionalProperties: false // Whether it is possible to return properties not in the object
            },
            // Forces the model to only return valid JSON by restricting token generation to valid
            //  patterns. No clue how it works.
            strict : true
        },
    }, {
        type : "function",
        function : {
            name : "create_file",
            description : "create a blank text file in the current working directory",
            parameters : {
                type : "object",
                properties : {
                    fileName : {
                        type : "string",
                        description : "The name of the file to be created"
                    },
                    fileContents : {
                        type : "string",
                        description : "The contents to write to the file"
                    }
                },
                required : ["fileName"],
                additionalProperties: false
            },
            strict : true
        }
    }, {
        type : "function",
        function : {
            name : "list_files",
            description : "see all the files in the current working directory",
        }
},
];

function execute (functionName : string, args : any ) : string {

    // TODO : Handle invalid functions and functions that failed
    if (functionName == "create_folder") {
        fs.mkdirSync("./" + args.folderName);
        return args.folderName + " Successfully created"

    } else if (functionName == "create_file") {
        fs.writeFileSync("./" + args.fileName, args.fileContents);
        return args.fileName + " Successfully created"

    } else if (functionName == "list_files") {
        return execSync("ls" , {encoding : "utf-8"})
    }

    return "Function name was invalid or something went wrong"
}

async function promptModel(userPrompt : string) {

    // 1. prompt model with array of messages and array of tools
    // 2. Get back the model response, and store it.
    // 3. Check the length of the array of tool calls.
        // 3a. if its empty, simply return the model response
            // 3ab. append the model response and then ask user for input
        // 3b. if its not empty, iterate over the list of tools
            // 3ba. If the type == "function", parse the arguments as json and store them as an object
            // 3bc. Take the name of the function called and its args and pass it to the execute command
            // 3bd. Take the result of that function called and add it to the message array.
            // 3be. Continue on to the next element until the array is empty and then send all of the results
            //          back to the model.

    // Store the users prompt in the chat history
    chatHistory.push({ role : "user", content : userPrompt});

    // Prompt the model with chat histroy and list of available tools
    let modelResponse : OpenAI.ChatCompletion = await client.chat.completions.create({
        model : MODEL ,
        messages : chatHistory,
        tools : tools})

    // Store the message response
    let message : OpenAI.ChatCompletionMessage = modelResponse.choices[0].message;
    // Store the list of tools calls
    let toolCalls : OpenAI.Chat.ChatCompletionMessageToolCall[] | undefined = message.tool_calls;

    /*
       Syntax Overview :
           Given toolCalls can either be a valid array or undefined the ?. says if
           this object doesn't have a length property, just return undefined. As well,
           undefined , null , 0 , etc. are logically == to false so ! would return true
           for an empty or non existent array ant the method would be exited at the return.
    */
    while (toolCalls != undefined && toolCalls.length > 0) {
        // Prompt user with the message the precedes the tool call
        messageUser(message.content ?? "")

        // if the model did respond with tools calls, make sure those tool calls are stored in memory
        chatHistory.push({ role : "assistant", content : message.content ?? "", tool_calls : toolCalls})

        for (const tools of toolCalls) {
            // Ensure the tool call is of type function
            if (tools.type !== "function") continue;

            // parse the arguments as a valid JSON object
            const args : any = JSON.parse(tools.function.arguments);

            // Display the tool being called
            messageUser("[tool called : " + tools.function.name + "]")

            // run the function with the
            const result: string = execute(tools.function.name, args);

            messageUser("[tool result : " + result + "]")

            // Store the result of the tool call
            chatHistory.push({role : "tool", tool_call_id : tools.id, content : result})
        }

        // At this point the message array should look like
        //  [user, assistant response with tools calls, call 1 result, call 2 result, ... ]
        //  Send the result of the tool calls to the model
        modelResponse = await client.chat.completions.create({
            model : MODEL ,
            messages : chatHistory,
            tools : tools})

        // Store the new message response
        message = modelResponse.choices[0].message;

        // Store the new list of tools calls
        toolCalls = message.tool_calls;
    }

    chatHistory.push({ role : "assistant", content : message.content ?? ""})
    // return back the models reponse
    messageUser(message.content ?? "");
}

function messageUser (message : string) {
    console.log(message)
}

while (true) {
    const rl = readline.createInterface({ input, output });
    const prompt = await rl.question("> ");
    rl.close();

    await promptModel(prompt);
}


