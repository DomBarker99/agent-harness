// ─────────────────────────────────────────────────────────────────────────────
// 06 · `Record<Keys, Value>`  (the same idea as a generic — plus a superpower)
// ─────────────────────────────────────────────────────────────────────────────
// `Record<K, V>` builds an object type with keys K and values V. It is your first
// GENERIC: a type that takes other types as inputs (K and V) — like a function,
// but at the type level. Two ways to use it:
//
//   Record<string, V>      ≡  { [key: string]: V }   ← same as file 05 (open-ended)
//   Record<"a" | "b", V>   ≡  { a: V; b: V }          ← EXHAUSTIVE: every key required
//
// The second form is the superpower: hand it a union of literal keys and TS forces
// you to provide every single one.
// ─────────────────────────────────────────────────────────────────────────────

import { prompts } from "./fixtures.ts";

type Handler = (args: any) => string;

// 1) TODO: rewrite file 05's table using Record (the open-ended form).
type HandlerTable = unknown; // hint: Record<string, Handler>
const handlers: HandlerTable = { create_file: () => "ok" };
// @ts-expect-error — values must be Handlers
const wrong: HandlerTable = { nope: 123 };

// 2) THE SUPERPOWER — an exhaustive map keyed by a derived union.
type PersonaName = keyof typeof prompts.personas;
// TODO: `Taglines` = a Record from PersonaName to string.
type Taglines = unknown; // hint: Record<PersonaName, string>

// This object must list EVERY persona. Once it compiles, delete one line and watch
// TypeScript demand it back — that exhaustiveness is the whole point.
const taglines: Taglines = {
  pirateCaptain: "arr, ye scurvy bilge-rat",
  spookyGhost: "oooo, fleshling",
  terseRobot: "[low power] fine.",
  factBot: "did you know:",
};
// @ts-expect-error — `wizard` is not a real persona key (kept on ONE line: the
//   error lands on the offending property, so the directive must sit right above it)
const badTaglines: Taglines = { pirateCaptain: "arr", spookyGhost: "boo", terseRobot: "beep", factBot: "fact", wizard: "x" };

export {};
