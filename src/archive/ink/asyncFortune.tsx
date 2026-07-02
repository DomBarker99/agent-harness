/**
 * ── Challenge 4 — "Async oracle" (Level 4: async + loading state) ───────────
 *
 * GOAL
 *   Press a key → kick off a SLOW operation → show a spinner while it runs →
 *   display the result when it finishes. This is the exact shape of "send a
 *   message → thinking… → show the model's reply", so it's the last rehearsal
 *   before we wire in the real harness.
 *
 * REQUIREMENTS
 *   1. A fake async "fetch": a function that returns a Promise resolving after
 *      ~1.2s with a random fortune string. (Simulate latency on purpose.)
 *   2. Spacebar → call it. While it's running, show a loading indicator.
 *      When it resolves, show the fortune.
 *   3. While busy, ignore further spacebars (don't fire a second request
 *      on top of one already running).
 *   4. q → quit cleanly.
 *
 * ACCEPTANCE
 *   `npm run ink:fortune`, press space, see a spinner for ~1s, then a fortune.
 *   Press space again for a new one. q exits.
 *
 * HINTS (not the answer)
 *   - You now have @inkjs/ui installed — use its Spinner:
 *             import { Spinner } from "@inkjs/ui";
 *             <Spinner label="Consulting the oracle…" />
 *     (or just a <Text>thinking…</Text> if you'd rather not.)
 *
 *   - Two pieces of state: whether you're BUSY, and the latest RESULT.
 *             const [busy, setBusy]       = useState(false);
 *             const [fortune, setFortune] = useState("");
 *
 *   - Simulate a slow network call with a Promise + setTimeout:
 *             function getFortune(): Promise<string> {
 *                 return new Promise(resolve => {
 *                     setTimeout(() => resolve("…a random fortune…"), 1200);
 *                 });
 *             }
 *
 *   - The useInput callback can be async, OR call an async helper:
 *             useInput(async (char) => {
 *                 if (busy) return;              // guard: already running
 *                 if (char === " ") {
 *                     setBusy(true);
 *                     const f = await getFortune();   // wait for it
 *                     setFortune(f);
 *                     setBusy(false);
 *                 }
 *             });
 *     ↑ Note: setBusy(true) re-renders immediately (spinner shows), THEN the
 *       await pauses, THEN setFortune/​setBusy(false) re-render with the result.
 *
 *   - Render: show the spinner when busy, otherwise the fortune.
 *             { busy ? <Spinner label="…" /> : <Text>{fortune}</Text> }
 *
 * NEW CONCEPT TO NOTICE
 *   State changes around an `await`: the UI repaints when you flip `busy` on,
 *   stays on the spinner during the await, then repaints again with the result.
 *   That await is exactly where the real model call will go.
 */
import {Box, Newline, render, Text, useApp, useInput} from "ink";
import {Spinner} from "@inkjs/ui";
import {useState} from "react";
import {getFortune} from "../fortunes.ts"

function Fortune () {

    const { exit } = useApp();
    let [thinking, isThinking] = useState(false)
    let [fortune, updateFortune] = useState("Your fortune awaits!")


    useInput((char) => {
        if (char == "q")
            exit()
    })

    useInput((char, key) => {
        if (char == " ") {
            isThinking(true)

            /**
             * isThinking must be set to false with the finally because if it is in a standalone
             * line below it, it will run asynchronously with getFortune and flip to false before
             * the fortune is actually received which causes the "Consulting with..." line to not show
             */
            getFortune()
                .then(fortune => updateFortune(fortune))
                .catch(() => updateFortune("SYesomething went wrong, try again!"))
                .finally(() => isThinking(false))
        }

    }, {isActive : !thinking})

    return (
        <Box flexDirection={"column"}>
            <Box borderStyle={"round"} flexDirection={"column"} alignItems={"center"} >
                <Text dimColor={true}>
                    Press space to get a fortune from the oracle!
                </Text>
                <Text dimColor={true}>
                    q to quit
                </Text>
            </Box>

            {thinking ? <Spinner label={"Consulting with the oracle "}/> : <Text>{fortune}</Text>}

        </Box>

    )

}

render(<Fortune />)





























