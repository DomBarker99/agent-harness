import { render, Text, Box } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

/**
 * A text-entry prompt that echoes back everything you submit.
 *
 * This is the Ink version of your readline loop, and it's worth seeing how the
 * pieces map to the `Props` type we read in node_modules/ink-text-input:
 *
 *   value     -> WE own the current text, in our own useState. The input does
 *                NOT store it internally. This is React's "controlled input"
 *                pattern: the component is a mirror of our state, nothing more.
 *   onChange  -> fires on every keypress with the new text. Our job: save it.
 *                Without this, typing would appear to do nothing (we'd never
 *                update the state the input is mirroring).
 *   onSubmit  -> fires when the user presses Enter. This is your "I got a full
 *                line" moment — the equivalent of readline's question() resolving.
 */
function Prompt() {
    const [query, setQuery] = useState("");      // what's currently typed
    const [lines, setLines] = useState<string[]>([]); // everything submitted so far

    function handleSubmit(submitted: string) {
        if (submitted.trim() === "") return;
        setLines((prev) => [...prev, submitted]); // append to the transcript
        setQuery("");                              // clear the input box
    }

    return (
        <Box flexDirection="column" padding={1}>
            {/* The transcript: just map state -> <Text> rows. No console.log. */}
            {lines.map((line, i) => (
                <Text key={i}>
                    <Text color="green">you said: </Text>
                    {line}
                </Text>
            ))}

            {/* The input row. A label, then the controlled TextInput. */}
            <Box>
                <Text color="cyan">{"> "}</Text>
                <TextInput
                    value={query}
                    onChange={setQuery}
                    onSubmit={handleSubmit}
                    placeholder="type something and press Enter…"
                />
            </Box>
        </Box>
    );
}

render(<Prompt />);
