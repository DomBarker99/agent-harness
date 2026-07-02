// SOLUTION · 04 — indexed access `T[K]`

import { prompts } from "../fixtures.ts";

type Prompts = typeof prompts;

type PersonasMap = Prompts["personas"];
const okMap: PersonasMap = prompts.personas;
// @ts-expect-error — a string is not the personas map
const badMap: PersonasMap = "nope";

type PirateText = Prompts["personas"]["pirateCaptain"];
const okText: PirateText = prompts.personas.pirateCaptain;
// @ts-expect-error — a different persona's text is a different literal type
const badText: PirateText = prompts.personas.spookyGhost;

type PersonaName = keyof Prompts["personas"];
type AnyPersonaText = Prompts["personas"][PersonaName];
const okAny: AnyPersonaText = prompts.personas.terseRobot;
// @ts-expect-error — not any persona's text
const badAny: AnyPersonaText = "random string";

export {};
