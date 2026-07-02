import {TextInput} from "@inkjs/ui";
import {Box, Text, render, useInput} from "ink";
import {useState} from "react";
import OpenAI from "openai";
import {runTurn} from "../harness.ts"

function TUI () {
    // React will ONLY update when a function tied to useState is called
    const [messages, setMessages] = useState<OpenAI.ChatCompletionMessageParam[]>([])
    const [inputKey, setInputKey] = useState(0)

    return(
        <Box flexDirection={"column"}>

            {messages.map((message, i) => {

                if (message.role == "user") {
                    return <Text key={i} backgroundColor={"red"}>{`> ${message.content}`} </Text>
                }
                if (message.role == "assistant") {
                    return <Text color="blue" key={i}>{`${message.content}`} </Text>
                }
                if (message.role == "tool") {
                    return <Text color="green" key={i}>{`${message.content}`} </Text>
                }
            })}

            <Box flexDirection={"row"} >
                <Text>{`> `}</Text>
                <TextInput
                    key = {inputKey}
                    placeholder={"Enter Here"}
                    onSubmit={(userInput) => {

                        // TODO : Use the then to trigger a switch that enables the spinner
                        runTurn(userInput, setMessages)
                        setInputKey(i => ++i)

                    }}
                ></TextInput>
            </Box>
        </Box>
    )
}

render(<TUI />)