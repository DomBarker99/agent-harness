// SOLUTION · 06 — `Record<K, V>`

import { prompts } from "../fixtures.ts";

type Handler = (args: any) => string;

type HandlerTable = Record<string, Handler>;
const handlers: HandlerTable = { create_file: () => "ok" };
// @ts-expect-error — values must be Handlers
const wrong: HandlerTable = { nope: 123 };

type PersonaName = keyof typeof prompts.personas;
type Taglines = Record<PersonaName, string>;

const taglines: Taglines = {
  pirateCaptain: "arr, ye scurvy bilge-rat",
  spookyGhost: "oooo, fleshling",
  terseRobot: "[low power] fine.",
  factBot: "did you know:",
};
// @ts-expect-error — `wizard` is not a real persona key (error must sit on ONE line so the directive catches it)
const badTaglines: Taglines = { pirateCaptain: "arr", spookyGhost: "boo", terseRobot: "beep", factBot: "fact", wizard: "x" };

export {};
