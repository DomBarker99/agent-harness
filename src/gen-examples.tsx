/**
 * Generates the live "click a prop → see its rendered terminal output" examples
 * for docs/ink-reference-interactive.html (the interactive second version of the
 * static docs/ink-reference.html — the original is left untouched).
 *
 * Pipeline:  snippet (JSX) → renderToString() with FORCE_COLOR=3 → ANSI string
 *            → ANSI→HTML → inlined into the reference page.
 *
 * Run with:  npm run gen:examples   (which sets FORCE_COLOR=3 so chalk keeps color)
 *
 * Output is INLINED into the HTML (between the EXAMPLES:START/END markers) rather
 * than written to a separate JSON file, so docs/ink-reference-interactive.html stays
 * a single file you can open with file:// — no server, no fetch/CORS issues.
 *
 * Coverage: every *visual* prop of <Box> and <Text>. Deliberately omitted (no
 * meaningful static frame): Box.alignContent (only shows with multi-line wrap +
 * spare cross-axis space — too subtle to read) and Box.overflow (renderToString's
 * virtual-terminal clipping picks which rows survive unpredictably), plus the
 * screen-reader-only / trivial rows aria-label/aria-hidden/aria-role and Text.children.
 */
import { renderToString, Box, Text } from "ink";
import {
  Badge, StatusMessage, Alert, Spinner, ProgressBar, UnorderedList, OrderedList,
  TextInput, EmailInput, PasswordInput, ConfirmInput, Select, MultiSelect,
} from "@inkjs/ui";
import type { ReactNode } from "react";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ── The examples ────────────────────────────────────────────────────────────
// `for`     — canonical key matching the reference page: <entry name w/o <>()> + "." + <prop's first token>
// `code`    — the snippet shown to the reader (hand-authored so it reads cleanly)
// `element` — the JSX actually rendered (kept in sync with `code` by hand)
// `note`    — optional caption shown under the output (e.g. "animated when run")
type Example = { for: string; code: string; element: ReactNode; note?: string };

const examples: Example[] = [
  // ── <Box> · flex & layout ──────────────────────────────────────────────────
  {
    for: "Box.flexDirection",
    code: `<Box flexDirection="row" gap={1}>
  <Box borderStyle="round" paddingX={1}><Text>A</Text></Box>
  <Box borderStyle="round" paddingX={1}><Text>B</Text></Box>
  <Box borderStyle="round" paddingX={1}><Text>C</Text></Box>
</Box>`,
    element: (
      <Box flexDirection="row" gap={1}>
        <Box borderStyle="round" paddingX={1}><Text>A</Text></Box>
        <Box borderStyle="round" paddingX={1}><Text>B</Text></Box>
        <Box borderStyle="round" paddingX={1}><Text>C</Text></Box>
      </Box>
    ),
  },
  {
    for: "Box.justifyContent",
    code: `<Box width={22} borderStyle="round" justifyContent="space-between">
  <Text>A</Text>
  <Text>B</Text>
  <Text>C</Text>
</Box>`,
    element: (
      <Box width={22} borderStyle="round" justifyContent="space-between">
        <Text>A</Text>
        <Text>B</Text>
        <Text>C</Text>
      </Box>
    ),
  },
  {
    for: "Box.alignItems",
    code: `<Box height={5} borderStyle="round" alignItems="center" paddingX={1} gap={2}>
  <Box height={3} backgroundColor="cyan" paddingX={1}><Text>tall</Text></Box>
  <Text>centered</Text>
</Box>`,
    element: (
      <Box height={5} borderStyle="round" alignItems="center" paddingX={1} gap={2}>
        <Box height={3} backgroundColor="cyan" paddingX={1}><Text>tall</Text></Box>
        <Text>centered</Text>
      </Box>
    ),
  },
  {
    for: "Box.alignSelf",
    code: `<Box height={5} borderStyle="round" alignItems="flex-start" paddingX={1} gap={1}>
  <Box backgroundColor="cyan" paddingX={1}><Text>top</Text></Box>
  <Box alignSelf="flex-end" backgroundColor="magenta" paddingX={1}><Text>bottom</Text></Box>
</Box>`,
    element: (
      <Box height={5} borderStyle="round" alignItems="flex-start" paddingX={1} gap={1}>
        <Box backgroundColor="cyan" paddingX={1}><Text>top</Text></Box>
        <Box alignSelf="flex-end" backgroundColor="magenta" paddingX={1}><Text>bottom</Text></Box>
      </Box>
    ),
  },
  {
    for: "Box.flexGrow",
    code: `<Box width={22} borderStyle="round">
  <Box flexGrow={1} backgroundColor="cyan"><Text>grows</Text></Box>
  <Box backgroundColor="magenta"><Text>fixed</Text></Box>
</Box>`,
    element: (
      <Box width={22} borderStyle="round">
        <Box flexGrow={1} backgroundColor="cyan"><Text>grows</Text></Box>
        <Box backgroundColor="magenta"><Text>fixed</Text></Box>
      </Box>
    ),
  },
  {
    for: "Box.flexShrink",
    code: `<Box width={16} borderStyle="round">
  <Box width={10} flexShrink={0} backgroundColor="cyan"><Text>keep</Text></Box>
  <Box width={10} backgroundColor="magenta"><Text>shrinks</Text></Box>
</Box>`,
    element: (
      <Box width={16} borderStyle="round">
        <Box width={10} flexShrink={0} backgroundColor="cyan"><Text>keep</Text></Box>
        <Box width={10} backgroundColor="magenta"><Text>shrinks</Text></Box>
      </Box>
    ),
  },
  {
    for: "Box.flexBasis",
    code: `<Box width={22} borderStyle="round">
  <Box flexBasis={12} backgroundColor="cyan"><Text>basis 12</Text></Box>
  <Box flexGrow={1} backgroundColor="magenta"><Text>rest</Text></Box>
</Box>`,
    element: (
      <Box width={22} borderStyle="round">
        <Box flexBasis={12} backgroundColor="cyan"><Text>basis 12</Text></Box>
        <Box flexGrow={1} backgroundColor="magenta"><Text>rest</Text></Box>
      </Box>
    ),
  },
  {
    for: "Box.flexWrap",
    code: `<Box width={14} borderStyle="round" flexWrap="wrap">
  <Box width={4} backgroundColor="cyan"><Text>A</Text></Box>
  <Box width={4} backgroundColor="magenta"><Text>B</Text></Box>
  <Box width={4} backgroundColor="green"><Text>C</Text></Box>
  <Box width={4} backgroundColor="yellow"><Text>D</Text></Box>
</Box>`,
    element: (
      <Box width={14} borderStyle="round" flexWrap="wrap">
        <Box width={4} backgroundColor="cyan"><Text>A</Text></Box>
        <Box width={4} backgroundColor="magenta"><Text>B</Text></Box>
        <Box width={4} backgroundColor="green"><Text>C</Text></Box>
        <Box width={4} backgroundColor="yellow"><Text>D</Text></Box>
      </Box>
    ),
  },
  {
    for: "Box.gap",
    code: `<Box gap={2}>
  <Box borderStyle="round" paddingX={1}><Text>1</Text></Box>
  <Box borderStyle="round" paddingX={1}><Text>2</Text></Box>
  <Box borderStyle="round" paddingX={1}><Text>3</Text></Box>
</Box>`,
    element: (
      <Box gap={2}>
        <Box borderStyle="round" paddingX={1}><Text>1</Text></Box>
        <Box borderStyle="round" paddingX={1}><Text>2</Text></Box>
        <Box borderStyle="round" paddingX={1}><Text>3</Text></Box>
      </Box>
    ),
  },
  {
    for: "Box.rowGap",
    code: `<Box flexDirection="column" rowGap={1}>
  <Box backgroundColor="cyan" paddingX={1}><Text>row 1</Text></Box>
  <Box backgroundColor="magenta" paddingX={1}><Text>row 2</Text></Box>
</Box>`,
    element: (
      <Box flexDirection="column" rowGap={1}>
        <Box backgroundColor="cyan" paddingX={1}><Text>row 1</Text></Box>
        <Box backgroundColor="magenta" paddingX={1}><Text>row 2</Text></Box>
      </Box>
    ),
  },
  {
    for: "Box.columnGap",
    code: `<Box columnGap={3}>
  <Box backgroundColor="cyan" paddingX={1}><Text>1</Text></Box>
  <Box backgroundColor="magenta" paddingX={1}><Text>2</Text></Box>
</Box>`,
    element: (
      <Box columnGap={3}>
        <Box backgroundColor="cyan" paddingX={1}><Text>1</Text></Box>
        <Box backgroundColor="magenta" paddingX={1}><Text>2</Text></Box>
      </Box>
    ),
  },

  // ── <Box> · sizing ──────────────────────────────────────────────────────────
  {
    for: "Box.width",
    code: `<Box width={20} borderStyle="round" paddingX={1}><Text>width 20</Text></Box>`,
    element: <Box width={20} borderStyle="round" paddingX={1}><Text>width 20</Text></Box>,
  },
  {
    for: "Box.height",
    code: `<Box height={4} borderStyle="round" paddingX={1}><Text>height 4</Text></Box>`,
    element: <Box height={4} borderStyle="round" paddingX={1}><Text>height 4</Text></Box>,
  },
  {
    for: "Box.minWidth",
    code: `<Box minWidth={18} borderStyle="round" paddingX={1}><Text>min 18</Text></Box>`,
    element: <Box minWidth={18} borderStyle="round" paddingX={1}><Text>min 18</Text></Box>,
  },
  {
    for: "Box.maxWidth",
    code: `<Box maxWidth={14} borderStyle="round" paddingX={1}>
  <Text>this text is capped to the max width</Text>
</Box>`,
    element: (
      <Box maxWidth={14} borderStyle="round" paddingX={1}>
        <Text>this text is capped to the max width</Text>
      </Box>
    ),
  },
  {
    for: "Box.aspectRatio",
    code: `<Box width={15} aspectRatio={3} borderStyle="round" justifyContent="center" alignItems="center">
  <Text>3 : 1</Text>
</Box>`,
    element: (
      <Box width={15} aspectRatio={3} borderStyle="round" justifyContent="center" alignItems="center">
        <Text>3 : 1</Text>
      </Box>
    ),
  },

  // ── <Box> · padding & margin ────────────────────────────────────────────────
  {
    for: "Box.padding",
    code: `<Box flexDirection="row" gap={2}>
  <Box borderStyle="round"><Text>tight</Text></Box>
  <Box borderStyle="round" padding={1}><Text>padded</Text></Box>
</Box>`,
    element: (
      <Box flexDirection="row" gap={2}>
        <Box borderStyle="round"><Text>tight</Text></Box>
        <Box borderStyle="round" padding={1}><Text>padded</Text></Box>
      </Box>
    ),
  },
  {
    for: "Box.paddingX",
    code: `<Box flexDirection="row" gap={2}>
  <Box borderStyle="round" paddingX={2}><Text>paddingX</Text></Box>
  <Box borderStyle="round" paddingY={1}><Text>paddingY</Text></Box>
</Box>`,
    element: (
      <Box flexDirection="row" gap={2}>
        <Box borderStyle="round" paddingX={2}><Text>paddingX</Text></Box>
        <Box borderStyle="round" paddingY={1}><Text>paddingY</Text></Box>
      </Box>
    ),
  },
  {
    for: "Box.paddingTop",
    code: `<Box borderStyle="round" paddingTop={2} paddingLeft={4}><Text>offset</Text></Box>`,
    element: <Box borderStyle="round" paddingTop={2} paddingLeft={4}><Text>offset</Text></Box>,
  },
  {
    for: "Box.margin",
    code: `<Box borderStyle="round">
  <Box margin={1} backgroundColor="cyan" paddingX={1}><Text>margin 1</Text></Box>
</Box>`,
    element: (
      <Box borderStyle="round">
        <Box margin={1} backgroundColor="cyan" paddingX={1}><Text>margin 1</Text></Box>
      </Box>
    ),
  },
  {
    for: "Box.marginX",
    code: `<Box borderStyle="round">
  <Box marginX={3} backgroundColor="cyan" paddingX={1}><Text>marginX 3</Text></Box>
</Box>`,
    element: (
      <Box borderStyle="round">
        <Box marginX={3} backgroundColor="cyan" paddingX={1}><Text>marginX 3</Text></Box>
      </Box>
    ),
  },
  {
    for: "Box.marginTop",
    code: `<Box flexDirection="column" borderStyle="round" paddingX={1}>
  <Box backgroundColor="cyan" paddingX={1}><Text>first</Text></Box>
  <Box marginTop={1} backgroundColor="magenta" paddingX={1}><Text>second</Text></Box>
</Box>`,
    element: (
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        <Box backgroundColor="cyan" paddingX={1}><Text>first</Text></Box>
        <Box marginTop={1} backgroundColor="magenta" paddingX={1}><Text>second</Text></Box>
      </Box>
    ),
  },

  // ── <Box> · borders ─────────────────────────────────────────────────────────
  {
    for: "Box.borderStyle",
    code: `<Box flexDirection="column" gap={1}>
  <Box borderStyle="round"  paddingX={1}><Text>round</Text></Box>
  <Box borderStyle="double" paddingX={1}><Text>double</Text></Box>
  <Box borderStyle="bold"   paddingX={1}><Text>bold</Text></Box>
</Box>`,
    element: (
      <Box flexDirection="column" gap={1}>
        <Box borderStyle="round" paddingX={1}><Text>round</Text></Box>
        <Box borderStyle="double" paddingX={1}><Text>double</Text></Box>
        <Box borderStyle="bold" paddingX={1}><Text>bold</Text></Box>
      </Box>
    ),
  },
  {
    for: "Box.borderColor",
    code: `<Box borderStyle="round" borderColor="green" paddingX={1}><Text>green border</Text></Box>`,
    element: <Box borderStyle="round" borderColor="green" paddingX={1}><Text>green border</Text></Box>,
  },
  {
    for: "Box.borderTop",
    code: `<Box borderStyle="round" borderTop={false} borderRight={false} paddingX={1}>
  <Text>left + bottom only</Text>
</Box>`,
    element: (
      <Box borderStyle="round" borderTop={false} borderRight={false} paddingX={1}>
        <Text>left + bottom only</Text>
      </Box>
    ),
  },
  {
    for: "Box.borderDimColor",
    code: `<Box flexDirection="row" gap={2}>
  <Box borderStyle="round" paddingX={1}><Text>normal</Text></Box>
  <Box borderStyle="round" borderDimColor paddingX={1}><Text>dim</Text></Box>
</Box>`,
    element: (
      <Box flexDirection="row" gap={2}>
        <Box borderStyle="round" paddingX={1}><Text>normal</Text></Box>
        <Box borderStyle="round" borderDimColor paddingX={1}><Text>dim</Text></Box>
      </Box>
    ),
  },
  {
    for: "Box.borderTopColor",
    code: `<Box
  borderStyle="round"
  borderTopColor="red"
  borderRightColor="green"
  borderBottomColor="blue"
  borderLeftColor="yellow"
  paddingX={1}
>
  <Text>per-edge color</Text>
</Box>`,
    element: (
      <Box
        borderStyle="round"
        borderTopColor="red"
        borderRightColor="green"
        borderBottomColor="blue"
        borderLeftColor="yellow"
        paddingX={1}
      >
        <Text>per-edge color</Text>
      </Box>
    ),
  },
  {
    for: "Box.borderBackgroundColor",
    code: `<Box borderStyle="round" borderColor="white" borderBackgroundColor="blue" paddingX={1}>
  <Text>border bg</Text>
</Box>`,
    element: (
      <Box borderStyle="round" borderColor="white" borderBackgroundColor="blue" paddingX={1}>
        <Text>border bg</Text>
      </Box>
    ),
  },

  // ── <Box> · display, overflow, position ─────────────────────────────────────
  {
    for: "Box.backgroundColor",
    code: `<Box backgroundColor="blue" paddingX={2} paddingY={1}>
  <Text color="white" bold>backed</Text>
</Box>`,
    element: (
      <Box backgroundColor="blue" paddingX={2} paddingY={1}>
        <Text color="white" bold>backed</Text>
      </Box>
    ),
  },
  {
    for: "Box.display",
    code: `<Box gap={1}>
  <Box backgroundColor="cyan" paddingX={1}><Text>A</Text></Box>
  <Box display="none"><Text>B</Text></Box>
  <Box backgroundColor="green" paddingX={1}><Text>C</Text></Box>
</Box>`,
    element: (
      <Box gap={1}>
        <Box backgroundColor="cyan" paddingX={1}><Text>A</Text></Box>
        <Box display="none"><Text>B</Text></Box>
        <Box backgroundColor="green" paddingX={1}><Text>C</Text></Box>
      </Box>
    ),
  },
  {
    for: "Box.position",
    code: `<Box height={4} width={18} borderStyle="round">
  <Box position="absolute" top={1} left={5}>
    <Text color="cyan">absolute</Text>
  </Box>
</Box>`,
    element: (
      <Box height={4} width={18} borderStyle="round">
        <Box position="absolute" top={1} left={5}>
          <Text color="cyan">absolute</Text>
        </Box>
      </Box>
    ),
  },
  {
    for: "Box.top",
    code: `<Box height={4} width={18} borderStyle="round">
  <Box position="absolute" bottom={0} right={1}>
    <Text color="magenta">bottom-right</Text>
  </Box>
</Box>`,
    element: (
      <Box height={4} width={18} borderStyle="round">
        <Box position="absolute" bottom={0} right={1}>
          <Text color="magenta">bottom-right</Text>
        </Box>
      </Box>
    ),
  },

  // ── <Text> ──────────────────────────────────────────────────────────────────
  {
    for: "Text.color",
    code: `<Box flexDirection="column">
  <Text color="cyan">cyan</Text>
  <Text color="#ff8800">#ff8800 (hex)</Text>
</Box>`,
    element: (
      <Box flexDirection="column">
        <Text color="cyan">cyan</Text>
        <Text color="#ff8800">#ff8800 (hex)</Text>
      </Box>
    ),
  },
  {
    for: "Text.backgroundColor",
    code: `<Text backgroundColor="magenta" color="white"> highlighted </Text>`,
    element: <Text backgroundColor="magenta" color="white"> highlighted </Text>,
  },
  {
    for: "Text.bold",
    code: `<Box flexDirection="column">
  <Text bold>bold</Text>
  <Text>normal</Text>
</Box>`,
    element: (
      <Box flexDirection="column">
        <Text bold>bold</Text>
        <Text>normal</Text>
      </Box>
    ),
  },
  {
    for: "Text.italic",
    code: `<Box flexDirection="column">
  <Text italic>italic</Text>
  <Text>normal</Text>
</Box>`,
    element: (
      <Box flexDirection="column">
        <Text italic>italic</Text>
        <Text>normal</Text>
      </Box>
    ),
  },
  {
    for: "Text.underline",
    code: `<Text underline>underlined</Text>`,
    element: <Text underline>underlined</Text>,
  },
  {
    for: "Text.strikethrough",
    code: `<Text strikethrough>strikethrough</Text>`,
    element: <Text strikethrough>strikethrough</Text>,
  },
  {
    for: "Text.dimColor",
    code: `<Box flexDirection="column">
  <Text dimColor>dimmed</Text>
  <Text>normal</Text>
</Box>`,
    element: (
      <Box flexDirection="column">
        <Text dimColor>dimmed</Text>
        <Text>normal</Text>
      </Box>
    ),
  },
  {
    for: "Text.inverse",
    code: `<Box flexDirection="column">
  <Text inverse> inverse </Text>
  <Text color="cyan" inverse> inverse cyan </Text>
</Box>`,
    element: (
      <Box flexDirection="column">
        <Text inverse> inverse </Text>
        <Text color="cyan" inverse> inverse cyan </Text>
      </Box>
    ),
  },
  {
    for: "Text.wrap",
    code: `<Box width={14} borderStyle="round" paddingX={1} flexDirection="column" gap={1}>
  <Text wrap="truncate">truncated at the edge</Text>
  <Text>wraps onto several lines</Text>
</Box>`,
    element: (
      <Box width={14} borderStyle="round" paddingX={1} flexDirection="column" gap={1}>
        <Text wrap="truncate">truncated at the edge</Text>
        <Text>wraps onto several lines</Text>
      </Box>
    ),
  },
];

// ── Ink UI (@inkjs/ui) · whole-component examples ────────────────────────────
// Keyed by the bare component name (no dot) — the reference page shows these as a
// "▶ live example" button on the component card. Interactive inputs (TextInput,
// Select, …) still render a useful initial frame headless; `note` flags that.
const noop = () => {};
const colorOptions = [
  { label: "Red", value: "red" },
  { label: "Green", value: "green" },
  { label: "Blue", value: "blue" },
];

const uiExamples: Example[] = [
  {
    for: "Badge",
    code: `<Box gap={1}>
  <Badge color="green">PASS</Badge>
  <Badge color="red">FAIL</Badge>
  <Badge color="yellow">WARN</Badge>
</Box>`,
    element: (
      <Box gap={1}>
        <Badge color="green">PASS</Badge>
        <Badge color="red">FAIL</Badge>
        <Badge color="yellow">WARN</Badge>
      </Box>
    ),
  },
  {
    for: "StatusMessage",
    code: `<Box flexDirection="column">
  <StatusMessage variant="success">Deployed to production</StatusMessage>
  <StatusMessage variant="error">2 tests failed</StatusMessage>
  <StatusMessage variant="warning">Cache is stale</StatusMessage>
  <StatusMessage variant="info">Version 2.0.0 available</StatusMessage>
</Box>`,
    element: (
      <Box flexDirection="column">
        <StatusMessage variant="success">Deployed to production</StatusMessage>
        <StatusMessage variant="error">2 tests failed</StatusMessage>
        <StatusMessage variant="warning">Cache is stale</StatusMessage>
        <StatusMessage variant="info">Version 2.0.0 available</StatusMessage>
      </Box>
    ),
  },
  {
    for: "Alert",
    code: `<Box flexDirection="column" gap={1}>
  <Alert variant="success" title="Saved">Your changes were written to disk.</Alert>
  <Alert variant="warning">Running low on disk space.</Alert>
</Box>`,
    element: (
      <Box flexDirection="column" gap={1}>
        <Alert variant="success" title="Saved">Your changes were written to disk.</Alert>
        <Alert variant="warning">Running low on disk space.</Alert>
      </Box>
    ),
  },
  {
    for: "Spinner",
    code: `<Spinner label="Loading…" />`,
    element: <Spinner label="Loading…" />,
    note: "Animated when run — this is the first frame.",
  },
  {
    for: "ProgressBar",
    code: `<Box width={24}>
  <ProgressBar value={60} />
</Box>`,
    element: <Box width={24}><ProgressBar value={60} /></Box>,
  },
  {
    for: "UnorderedList",
    code: `<UnorderedList>
  <UnorderedList.Item><Text>Clone the repo</Text></UnorderedList.Item>
  <UnorderedList.Item><Text>Install dependencies</Text></UnorderedList.Item>
  <UnorderedList.Item><Text>Run the dev server</Text></UnorderedList.Item>
</UnorderedList>`,
    element: (
      <UnorderedList>
        <UnorderedList.Item><Text>Clone the repo</Text></UnorderedList.Item>
        <UnorderedList.Item><Text>Install dependencies</Text></UnorderedList.Item>
        <UnorderedList.Item><Text>Run the dev server</Text></UnorderedList.Item>
      </UnorderedList>
    ),
  },
  {
    for: "OrderedList",
    code: `<OrderedList>
  <OrderedList.Item><Text>First</Text></OrderedList.Item>
  <OrderedList.Item><Text>Second</Text></OrderedList.Item>
  <OrderedList.Item><Text>Third</Text></OrderedList.Item>
</OrderedList>`,
    element: (
      <OrderedList>
        <OrderedList.Item><Text>First</Text></OrderedList.Item>
        <OrderedList.Item><Text>Second</Text></OrderedList.Item>
        <OrderedList.Item><Text>Third</Text></OrderedList.Item>
      </OrderedList>
    ),
  },
  {
    for: "TextInput",
    code: `<TextInput placeholder="Your name…" onSubmit={handle} />`,
    element: <TextInput placeholder="Your name…" onSubmit={noop} />,
    note: "Editable when run — shows the placeholder until you type.",
  },
  {
    for: "EmailInput",
    code: `<EmailInput placeholder="you@example.com" onSubmit={handle} />`,
    element: <EmailInput placeholder="you@example.com" onSubmit={noop} />,
    note: "Autocompletes the domain after “@” when run.",
  },
  {
    for: "PasswordInput",
    code: `<PasswordInput placeholder="Password" onSubmit={handle} />`,
    element: <PasswordInput placeholder="Password" onSubmit={noop} />,
    note: "Masks each character as you type when run.",
  },
  {
    for: "ConfirmInput",
    code: `<ConfirmInput onConfirm={save} onCancel={quit} />`,
    element: <ConfirmInput onConfirm={noop} onCancel={noop} />,
    note: "Press Y / N (or Enter for the default) when run.",
  },
  {
    for: "Select",
    code: `<Select
  options={[
    { label: "Red", value: "red" },
    { label: "Green", value: "green" },
    { label: "Blue", value: "blue" },
  ]}
  onChange={setColor}
/>`,
    element: <Select options={colorOptions} onChange={noop} />,
    note: "Navigate with ↑ / ↓ and pick with Enter when run.",
  },
  {
    for: "MultiSelect",
    code: `<MultiSelect
  options={[
    { label: "Red", value: "red" },
    { label: "Green", value: "green" },
    { label: "Blue", value: "blue" },
  ]}
  onSubmit={setColors}
/>`,
    element: <MultiSelect options={colorOptions} onSubmit={noop} />,
    note: "Toggle with Space, submit with Enter when run.",
  },
];

// ── ANSI → HTML ─────────────────────────────────────────────────────────────
// Ink/chalk emit a small set of SGR (ESC[…m) codes. We parse them, track the
// active style, and emit <span style="…"> runs. 16-color palette below is the
// VS Code dark terminal theme.
const PALETTE: Record<number, string> = {
  30: "#000000", 31: "#cd3131", 32: "#0dbc79", 33: "#e5e510",
  34: "#2472c8", 35: "#bc3fbc", 36: "#11a8cd", 37: "#e5e5e5",
  90: "#666666", 91: "#f14c4c", 92: "#23d18b", 93: "#f5f543",
  94: "#3b8eea", 95: "#d670d6", 96: "#29b8db", 97: "#e5e5e5",
};
const BASIC16 = [
  30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97,
].map((c) => PALETTE[c]);
// Terminal defaults, used when `inverse` is set without explicit colors.
const DEFAULT_FG = "#c9d1d9";
const DEFAULT_BG = "#000000";

function xterm256(n: number): string {
  if (n < 16) return BASIC16[n];
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return `rgb(${v},${v},${v})`;
  }
  const i = n - 16;
  const conv = (x: number) => (x === 0 ? 0 : 55 + x * 40);
  return `rgb(${conv(Math.floor(i / 36))},${conv(Math.floor((i % 36) / 6))},${conv(i % 6)})`;
}

type Style = {
  fg?: string; bg?: string; bold?: boolean; dim?: boolean;
  italic?: boolean; underline?: boolean; strike?: boolean; inverse?: boolean;
};

function applyCodes(style: Style, params: string): void {
  const codes = params === "" ? [0] : params.split(";").map(Number);
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (c === 0) { for (const k of Object.keys(style)) delete (style as Record<string, unknown>)[k]; }
    else if (c === 1) style.bold = true;
    else if (c === 2) style.dim = true;
    else if (c === 3) style.italic = true;
    else if (c === 4) style.underline = true;
    else if (c === 7) style.inverse = true;
    else if (c === 9) style.strike = true;
    else if (c === 22) { style.bold = false; style.dim = false; }
    else if (c === 23) style.italic = false;
    else if (c === 24) style.underline = false;
    else if (c === 27) style.inverse = false;
    else if (c === 29) style.strike = false;
    else if (c === 39) style.fg = undefined;
    else if (c === 49) style.bg = undefined;
    else if (c === 38 || c === 48) {
      const mode = codes[i + 1];
      let col: string | undefined;
      if (mode === 2) { col = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`; i += 4; }
      else if (mode === 5) { col = xterm256(codes[i + 2]); i += 2; }
      if (col) { if (c === 38) style.fg = col; else style.bg = col; }
    }
    else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) style.fg = PALETTE[c];
    else if ((c >= 40 && c <= 47) || (c >= 100 && c <= 107)) style.bg = PALETTE[c - 10];
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function renderRun(text: string, s: Style): string {
  const esc = escapeHtml(text);
  let fg = s.fg, bg = s.bg;
  if (s.inverse) { const efg = fg ?? DEFAULT_FG, ebg = bg ?? DEFAULT_BG; fg = ebg; bg = efg; }
  const css: string[] = [];
  if (fg) css.push(`color:${fg}`);
  if (bg) css.push(`background-color:${bg}`);
  if (s.bold) css.push("font-weight:bold");
  if (s.dim) css.push("opacity:.6");
  if (s.italic) css.push("font-style:italic");
  const deco: string[] = [];
  if (s.underline) deco.push("underline");
  if (s.strike) deco.push("line-through");
  if (deco.length) css.push(`text-decoration:${deco.join(" ")}`);
  return css.length ? `<span style="${css.join(";")}">${esc}</span>` : esc;
}

function ansiToHtml(input: string): string {
  const style: Style = {};
  const out: string[] = [];
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) out.push(renderRun(input.slice(last, m.index), style));
    applyCodes(style, m[1]);
    last = re.lastIndex;
  }
  if (last < input.length) out.push(renderRun(input.slice(last), style));
  return out.join("");
}

// ── Generate + inline ───────────────────────────────────────────────────────
type Baked = { code: string; html?: string; note?: string };

const allExamples = [...examples, ...uiExamples];
const EXAMPLES: Record<string, Baked> = {};
for (const ex of allExamples) {
  // alignSelf="flex-start" keeps the snapshot tight to its content instead of
  // expanding to the full 80-column virtual terminal (mostly-blank padding).
  let html: string | undefined;
  try {
    html = ansiToHtml(renderToString(<Box alignSelf="flex-start">{ex.element}</Box>));
  } catch {
    html = undefined; // a component that can't render headless falls back to its note
  }
  const rec: Baked = { code: ex.code };
  if (html) rec.html = html;
  if (ex.note) rec.note = ex.note;
  if (!html && !rec.note) rec.note = "▶ run it in a terminal to see this.";
  EXAMPLES[ex.for] = rec;
}

// Quick sanity check that color actually survived (FORCE_COLOR=3 reached us).
const baked = JSON.stringify(EXAMPLES);
if (!/color:|rgb\(/.test(baked)) {
  throw new Error(
    "Generated examples contain no color — is FORCE_COLOR=3 set? Run via `npm run gen:examples`.",
  );
}

// Escape "<" so the inlined JSON can never accidentally close the <script> tag.
const json = JSON.stringify(EXAMPLES, null, 2).replace(/</g, "\\u003c");
const block =
  `<!-- EXAMPLES:START (generated by src/gen-examples.tsx — do not edit by hand) -->\n` +
  `<script>window.EXAMPLES = ${json};</script>\n` +
  `<!-- EXAMPLES:END -->`;

const htmlPath = fileURLToPath(new URL("../docs/ink-reference-interactive.html", import.meta.url));
const html = readFileSync(htmlPath, "utf8");
const marker = /<!-- EXAMPLES:START[\s\S]*?<!-- EXAMPLES:END -->/;
if (!marker.test(html)) {
  throw new Error("Could not find the EXAMPLES:START/END markers in ink-reference-interactive.html.");
}
writeFileSync(htmlPath, html.replace(marker, block));

console.log(`Baked ${allExamples.length} examples into ${htmlPath}`);
for (const ex of allExamples) console.log(`  • ${ex.for}`);
