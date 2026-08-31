import {
    type ChatAssistantMessage, type ChatAudioOutput,
    type ChatRequest, type ChatResult, type ChatStreamChunk, type ChatStreamDelta,
    type ChatToolCall, type ChatUsage,
    type ChatUserMessage,
    type ReasoningDetailUnion
} from "@openrouter/sdk/models";
import {isAvailableTool, toolset} from "./tools/toolRegistry.ts";
import {EventPipeline, type ToolCompletionEvent} from "./eventPipeline.ts";
import type {OpenRouter} from "@openrouter/sdk";
import {formatError} from "./errorHandler.ts";
import * as models from "@openrouter/sdk/models";
import type {EventStream} from "@openrouter/sdk/lib/event-streams";

/*
    The turn loop: send the user's message, keep executing tool calls and re-prompting
    until the model answers with plain text. Contains both the streaming and
    non-streaming model-response runners.

    References:
      notes: docs/notes/typescript.md, docs/notes/zod.md
      ADRs:  001 (dispatch typing), 002 (zod at trust boundaries)
 */

// ════ TYPES ═════════════════════════════════════════════════════════════════════════

// Type used for both streaming and non-streaming variants of the getChatResponse methods.
type GetChatResponseParams = {
    chatRequest : ChatRequest,
    client : OpenRouter,
    eventPipeline : EventPipeline,
}

export type RunChatTurnParams = GetChatResponseParams & { userPrompt: ChatUserMessage; }

// ════ FUNCTIONS ═════════════════════════════════════════════════════════════════════

// ──── the turn loop ────

// Runs one full turn of the conversation against /chat/completions: send the user's
//  message, then keep executing tool calls and re-prompting until the model answers
//  with plain text.
export const runChatTurn  = async (params : RunChatTurnParams) => {

    try {
        // Send the user message for the pipeline to process
        params.eventPipeline.process({
            storeInChatHistory : true,
            kind : "completed message event",
            source : "user",
            message : params.userPrompt})

        // Configure the params which passes all the components
        //  needed for processing the incoming stream
        let chatResponseParams: GetChatResponseParams = {
            chatRequest : params.chatRequest,
            client : params.client,
            eventPipeline : params.eventPipeline,
        }

        // Stores the assistant response after the incoming stream has been processed
        const initialAssistantResponse : ChatAssistantMessage = await getChatResponse(chatResponseParams)

        // Store the final assitantResponse after the tool calls have been run
        const finalAssistantResponse : ChatAssistantMessage = await runToolLoop(
            initialAssistantResponse, params.eventPipeline, chatResponseParams)

        // Post tool call / no tool call assistant response
        params.eventPipeline.process({
            storeInChatHistory : true,
            kind : "completed message event",
            source : "assistant",
            message : finalAssistantResponse})

    } catch (e) {
        params.eventPipeline.process({
            storeInChatHistory : false,
            kind : "error event",
            error : formatError(e)
        })
    }
}

// In JS, almost everything is passed by value. Parameters receive a copy
//  to the reference of an object but if the local param is re-assigned then
//  the object is unaffected, it is only effected when its properties are mutated.
//  Because of this, assistant response cannot be re-assigned in the function and
//  instead must be returned as a promise. This is also why const objects can be
//  re-assigned in a function as no effect is had on the original reference
async function runToolLoop (assistantResponse : ChatAssistantMessage,
                            eventPipeline : EventPipeline,
                            chatResponseParams : GetChatResponseParams) : Promise<ChatAssistantMessage> {

    // Store the list of tool calls or an empty array if none were requested to skip the loop
    let toolCalls : ChatToolCall[] = assistantResponse.toolCalls ?? []

    while (toolCalls && toolCalls.length) {

        // Send off the pre tool call assistant response
        eventPipeline.process({
            storeInChatHistory : true,
            kind : "completed message event",
            source : "assistant",
            message : assistantResponse})

        for (const toolCall of toolCalls) {
            if (toolCall.type !== "function") continue; // tool call must be of type function, custom tools aren't handled

            // Must be stored as const as the type predicate doesn't work on an objects fields (Stupid!)
            const toolName = toolCall.function.name
            const isKnownTool = isAvailableTool(toolName)

            // Create the storage location for one of the tool calls
            const completedToolCall : ToolCompletionEvent = {
                storeInChatHistory : true,
                kind : "completed tool event",
                initialCall : toolCall.function,
                message : {
                    role : "tool",
                    toolCallId : toolCall.id,
                    content : []
                }
            }

            // Notify listeners that a tool call has been made
            eventPipeline.process({storeInChatHistory : false, kind : "tool call event", toolCall : toolCall })

            if (isKnownTool) {
                try {
                    // Validate the model's arguments against this tool's schema; a failure is
                    //  returned to the model as the tool result, not thrown. See docs/decisions/002.
                    const toolParams =
                        toolset[toolName].args.safeParse(JSON.parse(toolCall.function.arguments))

                    if (toolParams.success)
                        completedToolCall.message.content = (await toolset[toolName].run(toolParams.data, eventPipeline.sessionInfo))
                    else
                        completedToolCall.message.content = [{
                            type : "text",
                            text : "INVALID ARGUMENTS, did not match shape of the JSON schema, tool was not ran"
                        }]

                } catch (e) {
                    // Parse the error
                    const errorMessage : string = formatError(e)

                    // Store the error as the tool response
                    completedToolCall.message.content = [{
                        type : "text",
                        text : errorMessage
                    }]

                    // Notify listeners that an error occurred
                    eventPipeline.process({
                        storeInChatHistory : false,
                        kind : "error event",
                        error : formatError(e)
                    })
                }
            }

            eventPipeline.process(completedToolCall)
        }

        // After all the tools that were requested have been iterated over, their responses
        //  are now all stored in the chat history thanks to the eventPipeline. They are then
        //  sent back to the model so that it can process the results. If the model requests
        //  another set of tools after that than loop repeats itself
        assistantResponse = await getChatResponse(chatResponseParams)
        toolCalls = assistantResponse.toolCalls ?? []
    }
    return assistantResponse
}

/*
    The OpenRouter client offer multiple endpoints for different response modalities.
        These include those listed below, provided model endpoints can be found at
        https://openrouter.ai/api/v1/.

        NOTE : There are many image based models which are accessible via the chat/completions endpoint.
            The issue is that despite them being trained / accepting chat based history like most text based
            models, very few support tool calls and other text based functionality. Technically getChatResponse
            can absolutely handle all variants given it just acts as a collection endpoint, but passing tool calls
            or other unsupported fields in the ChatRequest body will throw errors.

        NOTE : Given the SDKs lack of support for properly handling streaming image requests, models with image
            output modalities WILL NOT be supported by these turn runners. This will be gated when creating a session

        // This command show all models which provide image and text output modalities for reference
        curl -s "https://openrouter.ai/api/v1/models" | jq '.data[] | select(.architecture.output_modalities | index("text") and index("image"))'
        // This is a condensed version of that
        curl -s "https://openrouter.ai/api/v1/models" | jq -r '.data[] | select(.architecture.output_modalities | index("text") and index("image")) | "\(.id)  out:\(.architecture.output_modalities | join("+"))"'

    /chat/completions : /models
    /embeddings : /embeddings/models
    /images : /images/models
    /videos : /videos/models
    /rerank : [no model catalog]
    /audio/speech (TTS) : [no model catalog]
    /audio/transcriptions (STT) : [no model catalog]
 */

// FIXME : Token usage is not tracked or stored
// Handles the streaming accumulation of thinking, response, and tool calls, for models offered at /chat/completions.
async function getChatResponse (params : GetChatResponseParams) : Promise<ChatAssistantMessage> {

    // Initiate the request with streaming on
    const modelResponse : EventStream<models.ChatStreamChunk> = await params.client.chat.send({
        chatRequest : {
            ...params.chatRequest,
            stream : true
        }
    })

    // Accumulators for each ChatStreamDelta
    let content = ""
    let reasoning = ""
    let refusal = ""
    const reasoningDetails: ReasoningDetailUnion[] = []
    const toolCalls: ChatToolCall[] = []
    let audio: ChatAudioOutput | undefined = undefined

    // Process each chunk in the stream
    for await (const chunk of modelResponse) {
        const delta : ChatStreamDelta = chunk.choices[0].delta

        if (!delta) continue

        // FIXME : there is no Event for Audio yet
        if (delta.audio) {
            if (audio === undefined) audio = {}
            // data and transcript are accumulated
            if (delta.audio.data) audio.data = (audio.data ?? "") + delta.audio.data
            if (delta.audio.transcript) audio.transcript = (audio.transcript ?? "") + delta.audio.transcript
            // Only set if and expires at once, they are not accumulated
            if (audio.expiresAt === undefined) audio.expiresAt = delta.audio.expiresAt
            if (audio.id === undefined) audio.id = delta.audio.id
        }

        if (delta.reasoning) {
            params.eventPipeline.process({
                storeInChatHistory : false,
                kind : "partial message event",
                source : "assistant_reasoning_chunk",
                fragment : delta.reasoning
            })
            reasoning += delta.reasoning
        }

        if (delta.content) {
            params.eventPipeline.process({
                storeInChatHistory : false,
                kind : "partial message event",
                source : "assistant_chunk",
                fragment : delta.content
            })
            content += delta.content
        }

        if (delta.refusal) refusal += delta.refusal

        for (const detail of delta.reasoningDetails ?? []) {
            const last = reasoningDetails[reasoningDetails.length - 1]

            // Fragments of one logical block arrive contiguously and share type + index
            //  (verified on the wire: gpt-5.6-sol streams reasoning.summary token-by-token,
            //  all index 0). Providers that omit index fall back to pure adjacency
            //  (undefined === undefined). The index check must live inside each branch:
            //  the UNKNOWN union member has no index/format/id fields to compare.
            if (detail.type === "reasoning.text" && last?.type === "reasoning.text"
                && detail.index === last.index) {
                last.text = (last.text ?? "") + (detail.text ?? "")   // text optional: signature-only fragments exist
                last.signature = last.signature ?? detail.signature   // signs the whole block, arrives once
                last.format = last.format ?? detail.format
                last.id = last.id ?? detail.id

            } else if (detail.type === "reasoning.summary" && last?.type === "reasoning.summary"
                && detail.index === last.index) {
                last.summary += detail.summary                        // summary is required — plain append
                last.format = last.format ?? detail.format
                last.id = last.id ?? detail.id

            } else if (detail.type === "reasoning.encrypted" && last?.type === "reasoning.encrypted"
                && detail.index === last.index) {
                last.data += detail.data                              // data is required — plain append
                last.format = last.format ?? detail.format
                last.id = last.id ?? detail.id

            } else {
                // New block, or an UNKNOWN future type (no merge rule — keep every
                //  fragment rather than risk dropping data)
                reasoningDetails.push({...detail})
            }
        }


        // FIXME : This is fucking hard to read, fix the !toolCalls and add better comments

        // Iterate over the list of tool call chunks, if the list is undefined, default to
        //  an empty list and skip the for loop
        for (const chunk of delta.toolCalls ?? []) {
            // Entry creation is keyed off our own array state rather than the presence
            //  of an id field — stays correct on servers that omit or repeat id.
            if (!toolCalls[chunk.index]) {
                toolCalls[chunk.index] = {
                    id: chunk?.id ?? "",
                    type: "function",
                    // Given function's name and argument may be undefined, they need to be handled despite
                    //      the check for functions existence being performed
                    function: {
                        name : chunk.function?.name ?? "",
                        // Left blank for the initial creation of an object as it will be collected
                        //  on the next pass
                        arguments : ""
                    }
                }
            }
            // To reliably get the function field to autofill, a constant variable must
            //  be referenced so that the type checker can guarantee at runtime it will
            //  not change.
            const call = toolCalls[chunk.index]

            if (chunk.function?.arguments && call?.type === "function")
                call.function.arguments += chunk.function.arguments
        }
    }

    const response: ChatAssistantMessage = { role: "assistant" }

    // If reasoning was accumulated, notify listeners and add the field
    if (reasoning) {
        response.reasoning = reasoning
        params.eventPipeline.process({
            storeInChatHistory : false,
            kind : "completed message event",
            source : "assistant_reasoning",
            reasoning : reasoning,
        })
    }

    // Conditionally add each field
    if (content) response.content = content
    if (refusal) response.refusal = refusal
    if (reasoningDetails.length) response.reasoningDetails = reasoningDetails
    if (toolCalls.length) response.toolCalls = toolCalls
    if (audio) response.audio = audio

    return response
}