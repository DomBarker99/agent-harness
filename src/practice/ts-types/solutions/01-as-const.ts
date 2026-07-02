// SOLUTION · 01 — widening and `as const`

const a = "markdown";
let b = "markdown";
const o = { fmt: "markdown" };

function useFormat(f: "markdown" | "plainText"): string {
  return f;
}

useFormat(a);
// @ts-expect-error — `b` is `string`
useFormat(b);
// @ts-expect-error — `o.fmt` widened to `string`
useFormat(o.fmt);

// PART 3 — narrowed by hand with an annotation:
const c: "markdown" | "plainText" = "markdown";
useFormat(c);

// PART 4 — frozen with `as const`:
const o2 = { fmt: "markdown" } as const;
useFormat(o2.fmt);

// PART 5 — `as const` made it read-only:
// @ts-expect-error — cannot assign to a readonly property
o2.fmt = "plainText";

export {};
