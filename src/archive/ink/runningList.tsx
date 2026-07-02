/**
 * ── Challenge 3 — "A growing list" (Level 3: arrays → UI) ───────────────────
 *
 * GOAL
 *   A tiny tally logger. Each spacebar press adds a new numbered line; the
 *   lines stack up on screen. Last building block before a real chat UI.
 *
 * REQUIREMENTS
 *   1. Keep an array of strings in state, starting empty.
 *   2. Spacebar  → append a new entry, numbered by the array length
 *                  (e.g. "tick 1", "tick 2", "tick 3", …).
 *   3. Render EVERY entry as its own line, stacked vertically.
 *   4. q → quit cleanly.
 *
 * ACCEPTANCE
 *   `npm run ink:list`, tap space a few times, watch numbered lines appear
 *   one under another. q exits.
 *
 * HINTS (not the answer)
 *   - State:  const [items, setItems] = useState<string[]>([])
 *             ↑ the <string[]> generic is REQUIRED — an empty array [] alone
 *               infers as never[], which you can't add strings to.
 *   - Append IMMUTABLY (don't .push). Build a NEW array each time:
 *             setItems(prev => [...prev, `tick ${prev.length + 1}`])
 *             ↑ ...prev spreads the old items into a fresh array + one more.
 *   - Turn the array into rows with .map, inside { }, each needing a key:
 *             {items.map((item, i) => <Text key={i}>{item}</Text>)}
 *   - Put that .map inside a <Box flexDirection="column"> so lines stack.
 *
 * NEW CONCEPT TO NOTICE
 *   .map turning DATA → UI, and why React wants a `key` on each item.
 *   (We'll dig into keys when you're done.)
 */

import {Box, render, Text, useApp, useInput} from "ink";
import {useState} from "react";

function Tally() {

    const { exit } = useApp();
    let [tallyList, editTally] = useState<string[]>([]);

    useInput((char, key) =>  {
        if (char === "q")
            exit();

        /**
         * React will only re draw elements if the reference to a variable changes. When working with
         *  arrays, a new copy of the array must be assigned to the variable for react to take notice.
         *  As well, when working with lists of text, each text entry must include a key so that react
         *  can easily identify it and correctly re-render the page
         */

        // If space bar is pressed, add a tally
        if (char === " ")
            editTally(prev => [...prev, `tick ${prev.length + 1}`])

        // If backspace or delete is pressed, remove and item.
        if (key.backspace || key.delete)
            editTally(prev => prev.slice(0,prev.length - 1))
    })

    return (

        <Box flexDirection={"column"} alignItems={"center"} borderStyle={"round"}>

            <Text>Running Tally by <Text bold color={"red"}>Dominic Barker</Text> </Text>

            <Text dimColor={true}>Keep pressing the space bar to add ticks to the tally. Press q to quit</Text>

            {tallyList.map((tally, i) => <Text italic={true} underline={true} key={i}>{tally}</Text>)}
        </Box>

    )
}

render(<Tally />)















