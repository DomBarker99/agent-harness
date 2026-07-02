// ─────────────────────────────────────────────────────────────────────────────
// 03 · `keyof`  (turn an object TYPE into the UNION of its keys)
// ─────────────────────────────────────────────────────────────────────────────
// `keyof SomeObjectType` is the union of that type's property names. Combine it
// with `typeof` from file 02 and you turn a VALUE straight into "the set of names
// it allows":
//
//     keyof typeof prompts.personas
//     →  "pirateCaptain" | "spookyGhost" | "terseRobot" | "factBot"
//
// This is the self-maintaining union from the harness reference: add a persona to
// fixtures.ts and this union grows by itself — with NO edit to this file.
// ─────────────────────────────────────────────────────────────────────────────

import { prompts } from "./fixtures.ts";

// 1) TODO: `PersonaName` = the union of persona KEYS. Use `keyof typeof`.
//    (Starting from `string` on purpose: that is the too-loose version you replace.)
type PersonaName = keyof typeof prompts.personas; // ← replace `string`

const ok1: PersonaName = "pirateCaptain"; // ✅ real key
const ok2: PersonaName = "factBot"; //       ✅ real key
// @ts-expect-error — not a persona key
const bad1: PersonaName = "pirate";
// @ts-expect-error — a real string, but not a KEY of personas
const bad2: PersonaName = "markdown";

// 2) THE PAYOFF — a lookup that cannot be called with a bad name.
//    (Until PersonaName is the key union, indexing `personas` by it also fails —
//     that failure IS the lesson: only known keys are allowed.)
function loadPersona(name: PersonaName): string {
  return prompts.personas[name]; // indexing by a known key is always safe
}
loadPersona("spookyGhost"); // ✅
// @ts-expect-error — typo caught at compile time, not at runtime
loadPersona("spookyghost");

// 3) TODO: `FormatRule` = the union of format keys.
type FormatRule = keyof typeof prompts.format; // ← replace `string`
const ok3: FormatRule = "concise"; // ✅
// @ts-expect-error — misspelled
const bad3: FormatRule = "consice";

export {};
