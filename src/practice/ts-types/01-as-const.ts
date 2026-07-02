// ─────────────────────────────────────────────────────────────────────────────
// 01 · WIDENING and `as const`
// ─────────────────────────────────────────────────────────────────────────────
// THE IDEA BEHIND THE WHOLE COURSE: stop hand-writing types — let the VALUE be
// the source of truth and have TypeScript DERIVE the type. That only works if the
// value keeps its exact (literal) type. By default it doesn't. Fixing that is
// what `as const` is for, so we start here.
//
// CHECK YOUR WORK:  npm run ts-practice   (green = every line below behaves)
//   • a plain line that MUST COMPILE → if it errors, your type is too strict/wrong
//   • a `// @ts-expect-error` line MUST ERROR → if it stops, TS says "unused
//     '@ts-expect-error'", meaning your type is too LOOSE.
// ─────────────────────────────────────────────────────────────────────────────

// PART 1 — OBSERVE (change nothing; hover each name and confirm the comment)
const a = "markdown"; //            hover: "markdown"        a primitive const stays exact
let b = "markdown"; //              hover: string            a `let` WIDENS (it can be reassigned)
const o = { fmt: "markdown" }; //   hover: { fmt: string }   a property WIDENS — even under const!

// PART 2 — WHY THE WIDENING BITES
// This function only accepts the two exact format names:
function useFormat(f: "markdown" | "plainText"): string {
  return f;
}

useFormat(a); // ✅ `a` is exactly "markdown"
// @ts-expect-error — `b` is `string`; too wide to guarantee it is one of the two names
useFormat(b);
// @ts-expect-error — `o.fmt` was widened to `string`
useFormat(o.fmt);

// PART 3 — FIX IT BY HAND (narrow with an annotation; no `as const` yet)
// TODO: change the annotation on `c` so the call below compiles.
const c : "markdown" | "plainText" = "markdown";
useFormat(c); // ← make THIS line compile by editing `c`'s type above

// PART 4 — FIX IT WITH `as const` (deep + automatic: every property at once)
// TODO: add `as const` to the end of the next line.
const o2 = { fmt: "markdown" } as const;
useFormat(o2.fmt); // ← make THIS line compile by freezing `o2` above

// PART 5 — BONUS: `as const` also makes the value deeply READ-ONLY.
// Once PART 4 is done, `o2.fmt` is readonly, so this reassignment is illegal:
// @ts-expect-error — cannot assign to a readonly property
o2.fmt = "plainText";

export {};
