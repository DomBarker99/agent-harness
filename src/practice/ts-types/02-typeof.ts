// ─────────────────────────────────────────────────────────────────────────────
// 02 · type-level `typeof`  (turn a VALUE into its TYPE)
// ─────────────────────────────────────────────────────────────────────────────
// You already use `typeof` at RUNTIME: `typeof x === "string"` produces a string
// while the program runs. In a TYPE position (after `:` or in `type X = ...`),
// `typeof someValue` means "the type TypeScript inferred for that value." It is
// the bridge from the value-world into the type-world — and the first half of the
// `keyof typeof ...` combo from the harness reference.
// ─────────────────────────────────────────────────────────────────────────────

import { prompts } from "./fixtures.ts";

/**
 * When using typeof and assigning it to a variable via const, that variable
 *  will be equal to the runtime JS type of the right hand side. This can resolve
 *  to types such as number, string, object, etc.
 *
 *  When assigning typeof to a TypeScript type, i.e. type Prompts = typeof ...,
 *  the type will be equal to the signature of whatever is on the right hand side.
 *  If you are using typeof with an object, you will get a shallow type where only its
 *  properties are copied of. If the object uses as const the type will be a deep copy
 *  of its properties and its values as that object is now forced to be readonly at
 *  compile time.
 */


// RUNTIME typeof — a value, computed when the program runs:
const runtimeKind = typeof prompts; // runtimeKind === "object" (just a string)

// TYPE-LEVEL typeof — used where a TYPE is expected:
type Prompts = typeof prompts; //      the entire inferred shape of `prompts`

// 1) TODO: give `Format` the type of `prompts.format` using type-level typeof.
type Format = typeof prompts.format
const okFormat: Format = prompts.format; // MUST COMPILE
// @ts-expect-error — a bare string is not the whole format object
const badFormat: Format = "nope";

// 2) TODO: give `Personas` the type of `prompts.personas`.
type Personas = typeof prompts.personas; // ← replace `unknown`
const okPersonas: Personas = prompts.personas; // MUST COMPILE
// @ts-expect-error — wrong shape
const badPersonas: Personas = { wrong: true };

// 3) WHY IT MATTERS — annotate by the shape of REAL data without rewriting it:
function firstFormat(f: typeof prompts.format): string {
  return f.plainText; // autocomplete + checking, derived straight from the value
}
firstFormat(prompts.format); // ✅

export {};
