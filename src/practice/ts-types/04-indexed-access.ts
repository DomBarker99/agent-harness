// ─────────────────────────────────────────────────────────────────────────────
// 04 · INDEXED ACCESS  `T[K]`  (read a type BACK OUT by key)
// ─────────────────────────────────────────────────────────────────────────────
// `keyof` gave you the keys. Indexed access goes the other way: `SomeType["key"]`
// is the type stored AT that key — exactly like property access, but in the
// type-world. And `T[keyof T]` gives the union of ALL value types.
// ─────────────────────────────────────────────────────────────────────────────

import { prompts } from "./fixtures.ts";

type Prompts = typeof prompts;

// 1) TODO: `PersonasMap` = the type of the `personas` sub-object. Index into Prompts.
type PersonasMap = Prompts["personas"]
const okMap: PersonasMap = prompts.personas; // MUST COMPILE
// @ts-expect-error — a string is not the personas map
const badMap: PersonasMap = "nope";

// 2) TODO: `PirateText` = the type of the `pirateCaptain` value (drill two levels).
type PirateText = Prompts["personas"]["pirateCaptain"]; // hint: Prompts["personas"]["..."]
const okText: PirateText = prompts.personas.pirateCaptain; // ✅ the exact literal
// @ts-expect-error — a DIFFERENT persona's text is a different literal type
const badText: PirateText = prompts.personas.spookyGhost;

// 3) TODO: `AnyPersonaText` = the union of EVERY persona's text. Use T[keyof T].
type PersonaName = keyof Prompts["personas"];
type AnyPersonaText = Prompts["personas"][PersonaName]; // hint: Prompts["personas"][PersonaName]
const okAny: AnyPersonaText = prompts.personas.terseRobot; // ✅ one of the union
// @ts-expect-error — not any persona's text
const badAny: AnyPersonaText = "random string";

export {};
