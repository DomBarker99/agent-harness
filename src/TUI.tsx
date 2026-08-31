import {Spinner, TextInput} from "@inkjs/ui";
import {Box, Text} from "ink";
import {useEffect, useState} from "react";
import {AssistantMessage, AssistantReasoningMessage, MessageList, ToolMessageHeader} from "./messageList.tsx";
import {ChatSession} from "./chatSession.ts"
import type {Events, SessionEventListener, ToolRequestEvent} from "./eventPipeline.ts";
import type {ChatUserMessage} from "@openrouter/sdk/models";

/*
    The Ink TUI entry point: renders the message list, streaming previews, and the input
    box, and wires the UI's reaction to harness events (updateMessageList).

    References:
      notes: docs/notes/react.md (re-render trigger, props)
 */

export type TUIConfig = InteractiveTUIConfig | NonInteractiveTUIConfig

export type InteractiveTUIConfig = {
    interactive : true
    session : ChatSession
}

export type NonInteractiveTUIConfig = {
    interactive : false
    session : ChatSession
    initialChat : ChatUserMessage
}

// ════ FUNCTIONS ═════════════════════════════════════════════════════════════════════

export function TUI ({config}: {config : TUIConfig}) {
    // Used to update the list of events
    const [messages, setMessages] = useState<Events[]>([])
    // Used to reload the main view via key
    const [inputKey, setInputKey] = useState(0)
    // Stores the incoming response delta, reset when a full message is received
    const [streamingResponseText, setStreamingResponseText] = useState("")
    // Stores the incoming thinking response delta, reset when the full thinking is received
    const [streamingThinkingText, setStreamingThinkingText] = useState("")
    // Stores the current tool being called, reset when the completed tool call is received
    const [toolRequest, setToolRequest] = useState<ToolRequestEvent>()
    // Identifies if the model is currently thinking or not to restrict users input
    const [thinking, setThinking] = useState(false)


    const updateMessageList : SessionEventListener = (event) => {
        // If a full input is received store it in the list of messages and reset the temp thinking blocks
        if (event.kind === "partial message event") {
            if (event.source === "assistant_chunk")
                setStreamingResponseText((s) => s += event.fragment)

            if (event.source === "assistant_reasoning_chunk")
                setStreamingThinkingText((s) => s += event.fragment)

        } else if (event.kind === "tool call event") {
            setToolRequest(event)

        } else if (event.kind === "completed message event") {
            setStreamingResponseText("")
            setStreamingThinkingText("")
            setMessages((m) => [...m, event]);

        } else if (event.kind === "completed tool event") {
            // Writes only — reading `toolRequest` here would see a stale snapshot,
            //  since the emitter holds the closure from the mount render
            //  (see docs/notes/react.md, docs/decisions/009)
            setToolRequest(undefined)
            setMessages((m) => [...m, event]);
        }
    }

    // Upon a state change, React re-renders the entire component function top to bottom.
    //  with useEffect you can have code run once on mount and once on unmount. As well, you
    //  can define some variables to be watched which when changed also runs the code.
    useEffect(() => {
        config.session.eventEmitter.on("listener", updateMessageList)

        if (!config.interactive) {
            setThinking(true)
            config.session.submit(config.initialChat).finally(() => setThinking(false))
        }

        return () => {
            config.session.eventEmitter.off("listener", updateMessageList)
        }
    },[config.session])

    return(
        <Box flexDirection={"column"}>

            {/*Finished messages are rendered here*/}
            <MessageList chatHistory={messages}/>

            {/*Streamed messages are shown here*/}
            {streamingThinkingText !== "" && <AssistantReasoningMessage assistantReasoningResponse={streamingThinkingText}/>}
            {streamingResponseText !== "" && <AssistantMessage assistantResponse={streamingResponseText}/>}
            {toolRequest && <ToolMessageHeader toolCall={toolRequest.toolCall.function}/>}

            {/*While the model is thinking a spinner replaces the text entry box*/}
            {config.interactive ?
                // Interactive session
                thinking ? <Spinner label={"Thinking..."} /> :
                <Box flexDirection={"row"} >
                    <Text>{`> `}</Text>
                    <TextInput
                        key = {inputKey}
                        placeholder={"Enter Here"}
                        onSubmit={(userInput) => {
                            setThinking(true)

                            config.session.submit({role : "user", content : userInput}).finally(() => {
                                setThinking(false)
                                setInputKey(i => --i)
                            })
                        }}
                    ></TextInput>
                </Box> :
                // Non interactive session
                thinking && <Spinner label={"Thinking..."} />
            }
        </Box>
    )
}

// ════ ENTRY POINT ═══════════════════════════════════════════════════════════════════