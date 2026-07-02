import { render, Text, Box } from "ink";

/**
 * The smallest possible Ink program.
 *
 * Ink is "React for the terminal". Instead of <div>/<span> rendering to a
 * browser DOM, Ink's <Box>/<Text> render to your terminal. <Box> is a flexbox
 * container (think CSS flexbox: flexDirection, gap, padding, borders). <Text>
 * is the only thing that can actually hold characters.
 *
 * `render()` is Ink's equivalent of ReactDOM's createRoot().render() — it takes
 * one React element and starts drawing it, then keeps the process alive and
 * re-draws whenever state changes.
 */
function Hello() {
    return (
        <Box flexDirection="column" borderStyle="round" padding={1}>
            <Text color="green">Hello from Ink 👋</Text>
            <Text dimColor>This box is a flexbox. This line is dimmed.</Text>
        </Box>
    );
}

render(<Hello />);
