import {Box, render, Text, useApp, useInput} from "ink";
import {generateFact} from "../factHarness.ts"
import {useState} from "react";
import {Spinner} from "@inkjs/ui";

// FIXME : When q is pressed mid response, it takes forever to clean up
function FactGenerator () {

    const { exit } = useApp();
    let [waiting, isWaiting] = useState(false);
    let [fact, updateFact] = useState("Get a fun fact!")

    useInput((char) => {
        if (char == "q")
            exit()
    })

    useInput((char) => {
        if (char == " ") {
            isWaiting(true)

            generateFact()
                .then(response => updateFact(response))
                .catch((err) => console.error(err))
                .finally(() => isWaiting(false))
        }
    },{isActive : !waiting})

    return (
        <Box flexDirection={"column"} alignItems={"center"} borderStyle={"double"}>
            <Box borderStyle={"round"} alignItems={"center"}>
                <Text>Press the space bar to get a fun fact, q to quit</Text>
            </Box>

            {waiting ? <Spinner label={"Getting you the best fact on earth"}/> : <Text>{fact}</Text>}

        </Box>
    )
}

render(<FactGenerator/>)