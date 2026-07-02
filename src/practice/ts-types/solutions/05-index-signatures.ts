// SOLUTION · 05 — index signatures

type Handler = (args: any) => string;

type HandlerTable = { [name: string]: Handler };

const handlers: HandlerTable = {
  create_file: () => "made a file",
  list_files: () => "a, b, c",
};
// @ts-expect-error — values must be Handlers, not numbers
const wrongValues: HandlerTable = { nope: 123 };

const fn = handlers["anything_at_all"];

type FixedTable = { create_file: Handler; list_files: Handler };
const fixed: FixedTable = {
  create_file: () => "ok",
  list_files: () => "ok",
};
// @ts-expect-error — `delete_all` was never declared on FixedTable
const oops = fixed.delete_all;

export {};
