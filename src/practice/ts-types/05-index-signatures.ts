// ─────────────────────────────────────────────────────────────────────────────
// 05 · INDEX SIGNATURES  `{ [key: string]: V }`  (keys you don't know yet)
// ─────────────────────────────────────────────────────────────────────────────
// Everything so far derived types from a KNOWN set of keys. Sometimes you don't
// know the keys ahead of time — e.g. a dispatch table mapping a tool name (any
// string the model might emit) to its handler. An index signature says: "any
// string key is allowed, and every value has type V."
// ─────────────────────────────────────────────────────────────────────────────


/**
 * When creating an object, you will frequently be iterating over its elements dynamically.
 *  With that being said the type of each proerty cannot be infered accurately without it being
 *  specified. The purpose of an index signature is to allow for each item in the object to have
 *  a strict type
 */
type Handler = (args: any) => string;

// 1) TODO: `HandlerTable` = an object with string keys whose values are Handlers.
type HandlerTable = unknown; // hint: { [name: string]: Handler }

const handlers: HandlerTable = {
  create_file: () => "made a file",
  list_files: () => "a, b, c",
};
// @ts-expect-error — values must be Handlers, not numbers
const wrongValues: HandlerTable = { nope: 123 };

// 2) The point (and the risk): ANY string key is allowed by the type.
const fn = handlers["anything_at_all"]; // ✅ allowed by the type (undefined at runtime)

// 3) CONTRAST — a fixed-key object only allows the keys you declared:
type FixedTable = { create_file: Handler; list_files: Handler };
const fixed: FixedTable = {
  create_file: () => "ok",
  list_files: () => "ok",
};
// @ts-expect-error — `delete_all` was never declared on FixedTable
const oops = fixed.delete_all;

export {};
