// SOLUTION · 02 — type-level `typeof`

import { prompts } from "../fixtures.ts";

const runtimeKind = typeof prompts; // "object"
type Prompts = typeof prompts;

type Format = typeof prompts.format;
const okFormat: Format = prompts.format;
// @ts-expect-error — a bare string is not the whole format object
const badFormat: Format = "nope";

type Personas = typeof prompts.personas;
const okPersonas: Personas = prompts.personas;
// @ts-expect-error — wrong shape
const badPersonas: Personas = { wrong: true };

function firstFormat(f: typeof prompts.format): string {
  return f.plainText;
}
firstFormat(prompts.format);

export {};
