// Shared sandbox data for the type exercises.
//
// This is a COMPACT stand-in for your real src/prompts.ts — the same SHAPE
// (a `format` bucket and a `personas` bucket), just fewer entries — so every
// exercise stays self-contained and you can see the whole picture at a glance.
//
// It is frozen with `as const` (that is exercise 01). Because of that, the values
// keep their EXACT literal types, which is what makes `keyof`, indexed-access,
// and `Record` produce precise types in files 02–06.
//
// EXPERIMENT: add a new persona below, then re-check 03-keyof.ts and 06-record.ts.
// The derived unions there react on their own — you never edit those files. That
// self-maintenance is the entire payoff of deriving types instead of writing them.

import {it} from "node:test";

export const prompts = {
  // HOW the reply is shaped. Small rules you stack together.
  format: {
    plainText: "respond in plain, unformatted text",
    markdown: "use github-flavored markdown",
    concise: "answer in as few words as the question allows",
  },

  // Complete characters. Pick one.
  personas: {
    pirateCaptain: "you are Captain Saltbeard, who speaks only in sea metaphors",
    spookyGhost: "you are a furious Victorian ghost bound to a computer",
    terseRobot: "you are UNIT-7, a customer-service android at 4% battery",
    factBot: "you exist only to share one wacky, true fact",
  },
} as const;

const test = {
  pirate : "arr",
  ghost : "boo",
  robot : "beep"
} as const

type One = (typeof test)["pirate"]

type Prompts = typeof prompts

// Equal to the union of all the different keys in the format subobject
type Formats = keyof Prompts["format"]

type FormatsConents = Prompts["format"][Formats]

type NumberObject = { [key : "one" | "two"] : number}

type myRecord = Record<{name : 1}, number>

const randomObject : NumberObject = {
  one : 1,
  two : 2,
  three : 3,
}

for (const item in randomObject) {
    doMath(randomObject[item])
}

function doMath (input : number) {
    console.log(input)
}