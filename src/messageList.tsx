import {Box, Text} from "ink";
import type {ChatContentItems} from "@openrouter/sdk/models";
import type {
    AssistantReasoningResponseEvent, AssistantResponseEvent,
    Events, ToolCompletionEvent, UserChatEvent
} from "./eventPipeline.ts";
import type {ChatToolCallFunction} from "@openrouter/sdk/models/chattoolcall";

/*
    Renders the finished-message list and the per-source message components (user,
    assistant, reasoning, tool). Ink components; props via object destructuring.
 */

// ════ FUNCTIONS ═════════════════════════════════════════════════════════════════════

// ──── list + dispatch ────

// NOTE: `key` is NOT a prop — React consumes it at the call site (the .map below) and it
//  is never visible inside the component, so it must not appear in the destructured props.
export function MessageList ({chatHistory} : {chatHistory: Events[]}) {
    // gap={1} puts one blank line between every message — spacing lives here,
    //  not as marginBottom on each message component
    return (
        <Box flexDirection={"column"} gap={1}>
            {chatHistory.map((message, i) => {

               return  <Message message={message} key={i} />

            })}
        </Box>
    )
}

function Message ({message} : {message : Events}) {

    if (message.kind === "completed tool event")
        return <ToolMessage toolCall={message}/>

    if (message.kind === "completed message event") {
        switch (message.source) {
            case "user":
                return <UserMessage userMessage={message}/>
            case "assistant":
                return <AssistantMessage assistantResponse={message}/>
            case "assistant_reasoning":
                return <AssistantReasoningMessage assistantReasoningResponse={message}/>
        }
    }
}

// ──── per-source message components ────

function UserMessage ({userMessage} : {userMessage : UserChatEvent}) {
    const displayContent = formatMessageContent(userMessage.message.content)

    return (
        <Box>
            <Text color={"cyan"} bold>{"> "}</Text>
            <Text>{displayContent}</Text>
        </Box>
    )
}

// Takes both the final event and incoming stream
export function AssistantMessage ({assistantResponse} : {assistantResponse : AssistantResponseEvent | string}) {
    if (typeof assistantResponse === "string") {
        return (
            <Box borderStyle={"round"} borderColor={"blue"} paddingX={1}>
                <Text>{assistantResponse}</Text>
            </Box>
        )

    } else {
        // Note : Given any is in the union, the type must be re-cast to the union of valid options.
        let assistantMessageContent = assistantResponse.message.content as string | Array<ChatContentItems> | null | undefined
        if (assistantMessageContent) {
            const displayContent = formatMessageContent(assistantMessageContent)

            return (
                <Box borderStyle={"round"} borderColor={"blue"} paddingX={1}>
                    <Text>{displayContent}</Text>
                </Box>
            )
        }

        return null // Acts as the default render nothing
    }
}

// Takes both the final event and incoming stream
export function AssistantReasoningMessage ({assistantReasoningResponse} : {assistantReasoningResponse : AssistantReasoningResponseEvent | string}) {

    const reasoningMessage = typeof assistantReasoningResponse === "string" ? assistantReasoningResponse : assistantReasoningResponse.reasoning

    return (
        <Box paddingLeft={2}>
            <Text dimColor italic>{reasoningMessage}</Text>
        </Box>
    )
}

// FIXME :
//  1. If a custom UI tool object is created, we can pass in pass/fail states to change the look
//  (Badge from @inkjs/ui with color green/red is a good fit for the header when that lands)
function ToolMessage ({toolCall} : {toolCall : ToolCompletionEvent}) {

    const functionCall = toolCall.initialCall
    const toolResult = formatMessageContent(toolCall.message.content)

    return (
        <Box flexDirection={"column"} borderStyle={"single"} borderColor={"green"} paddingX={1}>
            <ToolMessageHeader toolCall={functionCall}/>
            <Text dimColor>{`OUTPUT : ${outputCondenser(toolResult, 500)}`}</Text>
        </Box>
    )
}

export function ToolMessageHeader ({toolCall} : {toolCall : ChatToolCallFunction}) {

    return <Text color={"green"} bold>{`${toolCall.name}(${outputCondenser(toolCall.arguments, 100)})`}</Text>
}

// Flattens a message's content field into printable text: strings pass through,
//  content-item arrays become one line per item — text verbatim, everything else
//  as a short [kind: source] tag. The switch is deliberately default-less: every
//  variant of the discriminated union is handled (the SDK folds runtime-unknown
//  types into the "UNKNOWN" literal), so a new SDK variant fails the typecheck
//  here instead of silently mis-rendering.
function formatMessageContent (content : string | ChatContentItems[] | null | undefined) : string {
    if (typeof content === "string") return content
    if (!content) return ""

    return content.map((item) => {
        switch (item.type) {
            case "text":
                return item.text
            case "image_url":
                // data: URLs are base64 blobs — condense hard or they flood the terminal
                return `[image: ${outputCondenser(item.imageUrl.url, 60)}]`
            case "video_url":
            case "input_video":
                return `[video: ${outputCondenser(item.videoUrl.url, 60)}]`
            case "input_audio":
                // inputAudio.data is base64 — never print it, the format is the useful part
                return `[audio: ${item.inputAudio.format}]`
            case "file":
                return `[file: ${item.file.filename ?? item.file.fileId ?? "unnamed"}]`
            case "UNKNOWN":
                return `[unrecognized content part]`
        }
    }).join("\n")
}

// Check the length of the output, set the output length to be a certain number of chars where the rest is truncated.
function outputCondenser(output : string, maxChars : number) : string {
    const totalCharacters = output.length

    if (totalCharacters > maxChars)
        return `${output.substring(0,maxChars)} + ${output.length - maxChars} chars`

    return output
}
