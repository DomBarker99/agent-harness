import { render, Text, Box, useInput, useApp } from "ink";
import { useState } from "react";

/**
 * Interactive Ink: state + keyboard input.
 *
 * The mental shift from your readline loop (MemoryInputNoStream.ts):
 *   - readline is IMPERATIVE: you ask, you print, you loop. You drive the screen.
 *   - Ink is DECLARATIVE: you describe what the screen should look like FOR A
 *     GIVEN STATE. You never print. You change state, and Ink re-renders the
 *     whole component to match. Same loop, inverted control.
 *
 * useState  -> a piece of state; calling the setter triggers a re-render.
 * useInput  -> Ink's keyboard hook; the callback fires on every keypress.
 * useApp    -> gives you exit(), the clean way to end an Ink program.
 */
function Counter() {
    const [count, setCount] = useState(0);
    const { exit } = useApp();

    useInput((char, key) => {
        if (key.upArrow) setCount((c) => c + 1);
        if (key.downArrow) setCount((c) => c - 1);
        if (char === "q") exit(); // exit() unmounts and lets the process end
    });

    return (
        <Box flexDirection="column" borderStyle="round" padding={1}>
            <Text>
                Count: <Text color="cyan" bold>{count}</Text>
            </Text>
            <Text dimColor>↑/↓ to change · q to quit</Text>
        </Box>
    );
}

render(<Counter />);
