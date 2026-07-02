import OpenAI from "openai";
import { prompts } from "./prompts.ts"
import { toolSchemas, toolset, isAvailableTool } from "./tools.ts"
import type {Dispatch, SetStateAction} from "react";

// Setup the client connection
const client: OpenAI = new OpenAI({
    baseURL : "http://gemma.lan/v1",
    apiKey : "local"
})

// declare the model name
const MODEL: string = "gemma-4-12b";

// A prompt is the raw text, a message is the {role, content} object wrapping it
const SYSTEM_PROMPT = prompts.behavior.toolUse

const SYSTEM_MESSAGE : OpenAI.ChatCompletionMessageParam = {
    role : "system",
    content : SYSTEM_PROMPT
}

export let chatHistory: OpenAI.ChatCompletionMessageParam[] = [SYSTEM_MESSAGE];

// Runs one full turn of the conversation: send the user's message, then keep
//  executing tool calls and re-prompting until the model answers with plain text.
// The UI needs to be able to pass the useState function for its message array here
export async function runTurn(userPrompt : string, setChatHistory : Dispatch<SetStateAction<OpenAI.ChatCompletionMessageParam[]>>) {

    // Store the users message and update both the internal and ui array
    const userMessage : OpenAI.ChatCompletionMessageParam = { role : "user", content : userPrompt}
    chatHistory.push(userMessage)
    setChatHistory((history) => [...history, userMessage])

    // Prompt the model
    let modelResponse : OpenAI.ChatCompletion = await client.chat.completions.create({
        model : MODEL ,
        messages : chatHistory,
        tools : toolSchemas})

    // Store the message the model responded with
    let responseMessage : OpenAI.ChatCompletionMessage = modelResponse.choices[0].message;
    // Store the list of tool calls
    let toolCalls : OpenAI.Chat.ChatCompletionMessageToolCall[] | undefined = responseMessage.tool_calls;

    // while toolCalls is valid and its length is greater than 0
    while (toolCalls && toolCalls.length) {

        // Store the models response in memory alongside the tools it called.
        const assistantMessage : OpenAI.ChatCompletionMessageParam = { role : "assistant", content : responseMessage.content ?? "", tool_calls : toolCalls}
        chatHistory.push(assistantMessage)
        setChatHistory((history) => [...history, assistantMessage])

        for (const toolCall of toolCalls) {

            // Make sure the tool call is of type function, custom tool calls aren't handled
            if (toolCall.type !== "function") continue;

            const toolName = toolCall.function.name

            // toolName is auto casted by the function as it is a type predicate
            //  isKnownTool can only be used to narrow scope if it is a const
            const isKnownTool = isAvailableTool(toolName)
            let toolResult : string = "";

            if (isKnownTool) {
                const args : any = JSON.parse(toolCall.function.arguments);
                await toolset[toolName].run(args).then(result => toolResult = result)
            }

            const toolMessage : OpenAI.ChatCompletionMessageParam = {
                role : "tool",
                tool_call_id : toolCall.id,
                content : isKnownTool ? toolResult : "TOOL DOES NOT EXIST"
            }

            chatHistory.push(toolMessage)
            setChatHistory((history) => [...history, toolMessage])
        }

        // At this point the message array should look like
        //  [user, assistant response with tool calls, call 1 result, call 2 result, ... ]
        //  Send the result of the tool calls to the model
        modelResponse = await client.chat.completions.create({
            model : MODEL ,
            messages : chatHistory,
            tools : toolSchemas})

        // Store the new message response
        responseMessage = modelResponse.choices[0].message;

        // Store the new list of tool calls
        toolCalls = responseMessage.tool_calls;
    }

    const finalAssistantMessage : OpenAI.ChatCompletionMessageParam = { role : "assistant", content : responseMessage.content ?? ""}
    chatHistory.push(finalAssistantMessage)
    setChatHistory((history) => [...history, finalAssistantMessage])
}
