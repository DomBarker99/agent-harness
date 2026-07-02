// SOLUTION · 03 — `keyof`

import { prompts } from "../fixtures.ts";

type PersonaName = keyof typeof prompts.personas;

const ok1: PersonaName = "pirateCaptain";
const ok2: PersonaName = "factBot";
// @ts-expect-error — not a persona key
const bad1: PersonaName = "pirate";
// @ts-expect-error — a real string, but not a KEY of personas
const bad2: PersonaName = "markdown";

function loadPersona(name: PersonaName): string {
  return prompts.personas[name];
}
loadPersona("spookyGhost");
// @ts-expect-error — typo caught at compile time
loadPersona("spookyghost");

type FormatRule = keyof typeof prompts.format;
const ok3: FormatRule = "concise";
// @ts-expect-error — misspelled
const bad3: FormatRule = "consice";

export {};
