import type {
    ChatAssistantMessage, ChatContentImage, ChatContentItems,
    ChatMessages,
    ChatToolCall,
    ChatToolMessage,
    ChatUserMessage, Model
} from "@openrouter/sdk/models";
import type {ChatToolCallFunction} from "@openrouter/sdk/models/chattoolcall";
import type {EventEmitter} from "node:events";
import {GENERATE_IMAGE_TOOL_NAME} from "./tools/generationTools/generateImage.ts";
import {type AvailableTools, isAvailableTool} from "./tools/toolRegistry.ts";
import type {InputModality} from "@openrouter/sdk/models/inputmodality";

export class EventPipeline {

    constructor(private chatHistory : ChatMessages[],
                private eventEmitter : TurnEventEmitter,
                private model : Model | undefined) { }

    // private toolCallCounts : Map<string, number> = new Map<string, number>()
    private toolCallHistory : Map<AvailableTools, Array<ChatContentItems[]>> = new Map<AvailableTools, Array<ChatContentItems[]>>()
    private generatedImages : Map<string, ChatContentImage> = new Map<string, ChatContentImage>()

    // FIXME : Session info might want to be pulled out into its own class as to not over whelm the responsibility of the eventPipeline.
    //  The pipeline would just store copies of the events to the sessionInfo class and access to it can be offered up to tool calls
    readonly sessionInfo : SessionInfo = {
        toolCallCount : (toolName : AvailableTools) => {
            // Fetch the history of tool calls
            const history : Array<ChatContentItems[]> = this.toolCallHistory.get(toolName) ?? []
            return history.length
        },
        getNthToolCallResult : (toolName : AvailableTools, index : number) => {
            const history : Array<ChatContentItems[]> | undefined = this.toolCallHistory.get(toolName)

            return history ? history[index] : undefined
        },
        // Index by name and fetch the file
        getImageFromName : (imageName : string) => {
            return this.generatedImages.get(imageName)
        },
        getModelInputModalities : () => {
            return this.model?.architecture.inputModalities ?? []
        },
        modelAcceptsImageInput : () => {
            return this.model?.architecture.inputModalities.includes("image") ?? false
        },
        modelAcceptsVideoInput : () => {
            return this.model?.architecture.inputModalities.includes("video") ?? false
        }
    }

    process = (event : Events) => {
        if (event.storeInChatHistory) {
            // This holds the responsibility of storing all tool calls in the toolCallHistory
            if (event.kind === "completed tool event") {
                this.storeToolResult(event)
                this.storeGeneratedAssetsByName(event)
            }

            // To reduce overall token usage, if the previous item in the chat history is a tool call that contains,
            //  an image URL strip out all the ChatContentImages from history. Check first if there has been at least one
            //  tool call and that there is at least one item in the chatHistory
            // FIXME : Implement filtering of image URLS as well
            if (this.toolCallHistory.size && this.chatHistory.length) {
                 const lastRecordedEvent = this.chatHistory[this.chatHistory.length - 1]

                // See if the last event was a tool call and if it contained an array of return items
                if (lastRecordedEvent.role === "tool" && Array.isArray(lastRecordedEvent.content)) {
                    const previousContentItems : ChatContentItems[] = [...lastRecordedEvent.content]
                    lastRecordedEvent.content = previousContentItems.filter(item => item.type != "image_url")
                }
            }

            this.chatHistory.push(event.message)
        }

        this.eventEmitter.emit("listener", event)
    }

    private storeToolResult = (event : ToolCompletionEvent) => {
        const name = event.initialCall.name
        // Make sure the tool name is valid
        if (isAvailableTool(name)) {
            // Fetch the current list of tool calls, will be undefined if none have been made
            const toolCalls : ChatContentItems[][] | undefined = this.toolCallHistory.get(name)

            // Get the results of the incoming completed tool call. The array must be spread
            //  so that when images are stripped from history they do not affect the tool call array
            const toolCallResult : ChatContentItems[] = Array.isArray(event.message.content) ?
                [...event.message.content] : [{type : "text", text : event.message.content}]

            // Either add the tooCallResult to the existing list or create a new one
            if (toolCalls) toolCalls.push(toolCallResult)
            else this.toolCallHistory.set(name, [toolCallResult])
        }
    }

    private storeGeneratedAssetsByName = (event : ToolCompletionEvent) => {
        // Store the image by name in a map for easy refference
        if (event.initialCall.name === GENERATE_IMAGE_TOOL_NAME && Array.isArray(event.message.content)) {

            const toolResults : ChatContentItems[] = event.message.content

            for (const [index, element] of toolResults.entries()) {
                if (element.type === "text" && element.text.startsWith("img_")) {
                    const endIndex = element.text.indexOf(" ")
                    const imageName = element.text.substring(0,endIndex)
                    const adjacentElement = toolResults[index+1]

                    if (adjacentElement?.type === "image_url")
                        this.generatedImages.set(imageName, adjacentElement)

                }
            }
        }
    }
}

export type SessionInfo = {
    toolCallCount : (toolName : AvailableTools) => number
    getNthToolCallResult : (toolName : AvailableTools, index : number) => ChatContentItems[] | undefined
    getImageFromName : (imageName : string) => ChatContentImage | undefined
    getModelInputModalities : () => InputModality[]
    modelAcceptsImageInput : () => boolean
    modelAcceptsVideoInput : () => boolean
}

export type Events =
    UserChatEvent |
    AssistantReasoningResponseEvent |
    AssistantResponseEvent |
    ToolCompletionEvent |
    PartialAssistantResponseEvent |
    ErrorEvent |
    ToolRequestEvent

// Sent by the user
export type UserChatEvent = {
    storeInChatHistory : true
    kind : "completed message event"
    source : "user"
    message : ChatUserMessage
}

// Comes from the server
export type AssistantReasoningResponseEvent = {
    storeInChatHistory : false
    kind : "completed message event"
    source : "assistant_reasoning"
    reasoning : string
}

// Comes from the server
export type AssistantResponseEvent = {
    storeInChatHistory : true
    kind : "completed message event"
    source : "assistant"
    message : ChatAssistantMessage
}

// Sent by the turn handler once a tool is called
export type ToolCompletionEvent =  {
    storeInChatHistory : true
    kind : "completed tool event"
    message : ChatToolMessage
    // The originating call (name + args), carried on the event so listeners
    //  never need to correlate this with the earlier ToolRequestEvent. Only
    //  `message` goes to chat history; this field
    //  stays harness-side.
    initialCall : ChatToolCallFunction
}

// Comes from the server when streaming
export type PartialAssistantResponseEvent = {
    storeInChatHistory : false
    kind : "partial message event"
    source : "assistant_reasoning_chunk" | "assistant_chunk"
    fragment : string
}

// Comes from the harness when an error occurs
export type ErrorEvent = {
    storeInChatHistory : false
    kind : "error event"
    error : string
}

// Comes from the server when a tool is requested
export type ToolRequestEvent = {
    storeInChatHistory : false
    kind : "tool call event"
    toolCall : ChatToolCall
}

export type TurnEventMap = {
    // Left side is the channel name, right side is what is emitted.
    //  Right side is in brackets as an event can emit multiple params
    listener : [Events]
}

// The generic shape of the method a Listener must create to define how it reacts to turn events
export type SessionEventListener = (event: Events) => void

export type TurnEventEmitter = EventEmitter<TurnEventMap>
