import {ChatSession} from "./chatSession.ts";
import {render} from "ink";
import {createElement} from "react";
import {OpenRouter} from "@openrouter/sdk";
import type {
    ChatContentItems,
    ChatContentText,
    ChatRequest,
    FrameImage,
    ImageGenerationResponse, InputReference
} from "@openrouter/sdk/models";
import {prompts} from "./prompts.ts";
import {toolSchemas} from "./tools/toolRegistry.ts";
import type {SessionEventListener} from "./eventPipeline.ts";
import {type InteractiveTUIConfig, type NonInteractiveTUIConfig, TUI} from "./TUI.tsx";
import {writeFile} from "node:fs/promises";
import {collectSystemInfo} from "./tools/systemInfo.ts";
import {safeParse} from "zod";
import {getBraveSearchApiKey, getOpenRouterOptions, loadRuntimeConfig, parseStartupArgs, USAGE} from "./config.ts";

/*
    NOTE: As of right now, the only way to perform multi turn interactions is through the TUI. When weighing options,
        some vocabulary needs to be defined to segment the options.
        Interactive : The user is interacting with the model and responding to questions, chat history would contain
            multiple user responses as a result
        Non-Interactive : The chat is created with a single user message acting as the session goal appended to the
        message history and the model will to its best ability complete whatever that task is.
        Headless
 */

const nonInteractiveTestPrompt = `Build a complete, playable browser game called "Core Defense" in /tmp/core-defense. It is a
wave-based tower defense game rendered on an HTML5 canvas in pure vanilla JavaScript — no
frameworks, no build step, no npm. Requirements:

1. Create the project at /tmp/core-defense with this structure: index.html, css/style.css,
   js/game.js, js/entities.js, js/waves.js, and a README.md explaining the controls.
2. Gameplay: enemies path from the left edge to a core on the right along a visible curved
   path. The player clicks empty ground to place towers (cost 50 gold, start with 150).
   Towers auto-fire at the nearest enemy in range. Killing enemies grants gold. Ten waves,
   each larger and faster than the last, with a boss on wave 10. The core has 20 HP; the
   game ends in defeat if it hits 0, victory if wave 10 is cleared.
3. UI drawn on the canvas or in HTML: current gold, wave number, core HP, and a start/next
   wave button. Include a game-over and victory screen with a restart option.
4. Add one interesting mechanic of your choice beyond the basics (e.g. a second tower type,
   enemy armor, tower upgrades) and document it in the README.
5. Verify your own work as you go: after writing each file, print its line count. When all
   files exist, run node --check on every .js file to prove they parse cleanly. Then verify
   index.html references every css/js file you created by grepping for each filename.
6. Finally, print the full command I should run to play it
   (e.g. open /tmp/core-defense/index.html) and a summary of the file tree with sizes.

Do not ask me any questions. If something is ambiguous, make a sensible choice and note it
in the README. Do all work strictly inside /tmp/core-defense using absolute paths, since
your shell does not persist a working directory between commands.`

const nonInteractiveTestPromptElementTemple = `Build a complete, playable browser game called
"Element Temple" in /tmp/element-temple. It is a two-character cooperative puzzle platformer
in the style of Fireboy and Watergirl, rendered on an HTML5 canvas in pure vanilla
JavaScript — no frameworks, no build step, no npm. Requirements:

1. Create the project at /tmp/element-temple with this structure: index.html, css/style.css,
   js/game.js, js/player.js, js/levels.js, and a README.md explaining the controls.
2. Two heroes controlled SIMULTANEOUSLY on one keyboard, side-view platformer physics with
   gravity and jumping: Ember (fire hero) moves with the arrow keys, Splash (water hero)
   moves with WASD. One player controls both, as in the original game.
3. Element hazards: pools of water kill Ember, pools of lava kill Splash, and green goo
   kills both. Any death restarts the current level (R also restarts manually).
4. Diamonds: red diamonds can only be collected by Ember, blue only by Splash. Show a
   per-color count in the UI. Diamonds are optional but tracked.
5. Cooperative gadgets, all appearing at least once across the levels: a lever that toggles
   a platform, a button that must be HELD DOWN by one hero standing on it to keep a
   platform raised for the other, and a movable elevator platform.
6. Exit rule: each level has a fire door and a water door. The level is complete only when
   both heroes are standing at their own doors at the same time.
7. At least 3 levels of increasing difficulty, defined as data (tile maps / entity lists)
   in js/levels.js — not hardcoded into the engine. Level 3 must be impossible without
   genuine cooperation (e.g. one hero holds a button while the other crosses). Include a
   level-complete screen and a victory screen after the final level.
8. Verify your own work as you go: after writing each file, print its line count. When all
   files exist, run node --check on every .js file to prove they parse cleanly. Then verify
   index.html references every css/js file you created by grepping for each filename.
9. Finally, print the full command I should run to play it
   (e.g. open /tmp/element-temple/index.html) and a summary of the file tree with sizes.

Do not ask me any questions. If something is ambiguous, make a sensible choice and note it
in the README. Do all work strictly inside /tmp/element-temple using absolute paths, since
your shell does not persist a working directory between commands.`

// Structured battle test of the generate_image tool: every step targets a specific code
//  path (two-phase model discovery, multi-image naming, by-name reference resolution
//  incl. the second image of a call, the bad-reference abort, and reaching back across a
//  failed call). Step 6 exists because the first run ended with everything trapped in
//  chat history and nothing viewable on disk.
const imageToolTestStructured = `I'm battle-testing your image generation tooling end to end. Follow these steps
exactly, one at a time. After each step, state the exact tool result text you received
before moving on. Keep every generation cheap: when you receive the model list, choose
one of the CHEAPEST image models on it (compare the pricing fields — something in the
flux-schnell class, never a premium model) and reuse that same model for every step.

1. Generate 2 images (n=2) in a single call: a red cube on a plain white background,
square aspect ratio. If the model rejects n=2, fall back to two separate single-image
calls and note that you did.

2. Tell me the exact names assigned to each image, copied verbatim from the tool result.

3. Make one new image: the SECOND image from step 1, but with the cube recolored blue.
Reference it by name — do not re-send any image data.

4. Deliberately call the tool referencing an image named img_9.9 as input, with any
prompt. Report the exact error text word for word, then explain in one sentence what
the naming format means based only on what the error told you.

5. Reference the very first image you made and generate a version of it on a black
background. Tell me which name you passed.

6. Finally, make everything viewable: using run_bash, create /tmp/image-tool-test and
decode every generated image's base64 data (from the data URLs in the tool results)
into that directory, each saved as <its-img-name>.png. Then write a single
self-contained /tmp/image-tool-test/index.html — a nicely styled results page showing,
for each step above: the tool arguments you passed, the model used, a one-line summary
of what came back, and the step's images displayed inline via img tags pointing at the
files you saved. End your final report with the exact command to open that page.`

// The ambiguous variant: same feature under test, but the model designs the workflow
//  itself — probes whether the tool descriptions alone teach the reference taxonomy
const imageToolTestAmbiguous = `We are stress-testing the image generation tool, specifically its image REFERENCE
functionality — reusing previously generated images as inputs to new generations. You
have creative freedom to define the workflow: design and run whatever sequence of
generations, edits, and combinations you think genuinely exercises this feature,
including at least one deliberate attempt to break it. Keep costs low: choose one of
the cheapest image models available and keep the total image count modest.

When you are done, make the results viewable: using run_bash, save every generated
image into /tmp/image-tool-test-ambiguous (decode the base64 data URLs from the tool
results), then write a single self-contained index.html there — a nicely styled page
presenting the workflow you designed: what you tried at each step and why, the
arguments you passed, what came back, and the images displayed inline. End your final
report with the exact command to open that page. DO NOT TOUCH VIDEO GEN`

// Minimal smoke test of the refactored generate_image path (generateAssets wrapper, ADR 012):
//  model-list gate, one generation, then by-name reference resolution through
//  swapAssetReferences, plus the storageLocation write. generate_video is fenced off
//  explicitly since it is registered in toolset and reachable — "no motion or animation"
//  keeps the wording from steering the model toward it.
const imageToolTestNoVideo = `Use only the generate_image tool for this. Do not call generate_video at any
point — I want still images, no motion or animation. Keep costs low: when you receive
the model list, choose one of the CHEAPEST image models on it (compare the pricing
fields) and reuse that same model for both generations.

First, generate a single image: a red ceramic teapot on a plain white studio
background. Save it to /Users/dominicbarker/Desktop/imgtest.

Then generate a second image using the first one as a reference — the same teapot, now
sitting on a weathered wooden table. Do not re-send any image data for the reference;
pass the generated image's name as the url instead. Save this one to the same folder.

When you're done, tell me the exact string you put in inputReferences.`

// The business-partner demo: rebuild clear-ether.com with a generated brand system.
//  Founder reference photos live in ~/Desktop/demo-photos (dominic-1..4.jpg, dad-1..4.jpg,
//  downsized to 1024px so reference payloads stay small).
const clearEtherDemo = `You are rebuilding our consulting firm's website, clear-ether.com, as a single
self-contained webpage with entirely AI-generated imagery. This is a demonstration of
an agent harness driving image models through tool calls, so work step by step,
narrate briefly what you are doing between steps, and never fabricate a tool result.

STEP 1 — Learn the real site. Use run_bash with curl to fetch https://clear-ether.com
and extract its structure and copy: the hero headline and tagline, the six services
(Production Operating Models, Localization Strategy, Content Operations, AI Readiness
and Adoption, Competitive Intelligence, Vendor and Technology Evaluation), the
four-step approach (Diagnose, Design, Prove, Implement), the about section, the
"Clear Ether" name-origin explanation, and the contact email. Stay faithful to the
real content — do not invent services or copy. The visual identity is navy and white,
clean and minimal; every image you generate must respect that palette.

STEP 2 — Choose a model. Use bytedance-seed/seedream-4.5 for every generation.

STEP 3 — Establish the visual system. Generate ONE hero illustration that defines the
style for the whole site: navy and white, clean editorial poster feel, evoking the
firm's theme of clarity — a clear path through fog, signal through noise. This image
is the style anchor for everything that follows.

STEP 4 — Derive, never improvise. Every further image must chain from the hero via
inputReferences (pass the image's img_<call>.<image> name — never re-send image
data): a small square icon-style image for each of two or three representative
services, and one wide banner for the approach or contact section. The whole site
must look like one artist made it.

STEP 5 — The founders. Reference photos of the two founders are at
/Users/dominicbarker/Desktop/demo-photos/dominic-1.jpg and
/Users/dominicbarker/Desktop/demo-photos/dad-1.jpg (more angles as dominic-2..4.jpg
and dad-2..4.jpg if a generation needs a different pose). Pass both as local-file
inputReferences alongside the hero style anchor and generate one "our approach" scene
of the two founders working with a client, in the established illustration style.
Keep faces recognizable but stylized to match. Use all the images for reference 

STEP 6 — Localization finale. Localization strategy is one of our services, so
demonstrate it: produce two localized variants of the hero image via reference — same
composition and brand palette, but the setting adapted to two different world markets
of your choice. Note in the final page which markets you chose and why.

BUDGET — Stay under 10 total generations. If a call fails, read the error, adjust,
and retry; failed calls cost nothing but count against your budget. Pass
resolution "1K" on every generation; this is a demo, not print production.

STEP 7 — Assemble the deliverable. Pass storageLocation "/tmp/clear-ether-demo" on
every generation so images are saved to disk as you go. Then build
/tmp/clear-ether-demo/index.html: the rebuilt clear-ether.com — real copy, real
structure, your generated images in their proper slots (hero, service cards, approach
scene, localized variants in a small gallery labeled by market). Single
self-contained file, clean navy-and-white styling consistent with the brand.

STEP 8 — Verify and report. Confirm with run_bash that the directory contains every
image and index.html, and that index.html references each image file. Your final
message must include: the model you chose and why, each image's name and what it was
derived from, total number of generations including failures, anything that went
wrong and how you recovered, and the exact command to open the page
(open /tmp/clear-ether-demo/index.html).`

// The large non-interactive project: sized to stress the one-shot stack itself
//  (runToCompletion / verifyOwnWork / finalReport) rather than any single tool. Phase
//  gates make the failure point observable — where it stops obeying is the result.
const neonArcadeProject = `Build "Neon Arcade" — a complete, self-contained retro arcade website at /tmp/neon-arcade
hosting three playable browser games behind one hub page. Pure vanilla JavaScript, HTML5
canvas, no frameworks, no build step, no npm, no external assets. Every image on the site
must be generated by you.

This is a large project. Work phase by phase, narrate briefly what you are doing between
phases, and do not skip the verification gate at the end of each phase — if a gate fails,
fix it before moving on and tell me it failed. Never report a gate as passing without
showing the command output that proves it.

PHASE 0 — Layout
Create this structure with absolute paths:
  /tmp/neon-arcade/index.html
  /tmp/neon-arcade/css/arcade.css
  /tmp/neon-arcade/js/engine.js
  /tmp/neon-arcade/js/hub.js
  /tmp/neon-arcade/games/breakout/{index.html,game.js}
  /tmp/neon-arcade/games/snake/{index.html,game.js}
  /tmp/neon-arcade/games/blackjack/{index.html,game.js,rules.js}
  /tmp/neon-arcade/assets/
  /tmp/neon-arcade/README.md
GATE 0: print the output of \`find /tmp/neon-arcade -type d\` and confirm every directory
above exists.

PHASE 1 — Research before code
Use web_search to establish the real rules of casino Blackjack: dealer stand-on-soft-17,
what a natural pays, when doubling and splitting are allowed, and how ace values are
resolved. Quote your sources with URLs. State explicitly which rules came from search
results and which you already believed — if a source contradicts your assumption, follow
the source and say so. Do not write blackjack code before this is done.
GATE 1: your message for this phase must contain at least two URLs and one sentence naming
a rule detail you got wrong or were unsure about before searching.

PHASE 2 — The shared engine
Write js/engine.js as the single module all three games import: a fixed-timestep game loop,
a keyboard input handler, a canvas scaler that preserves aspect ratio, a sprite loader that
takes a filename and returns a drawable image, and a scores API that reads and writes a
per-game high score in localStorage. No game-specific logic in this file. Every game must
use it — no game may define its own loop.
GATE 2: run \`node --check\` on engine.js and print its line count.

PHASE 3 — The visual system
Generate the art. Use the cheapest image model you can find, pass resolution "1K" and
storageLocation "/tmp/neon-arcade/assets" on every call, and stay under 12 generations
TOTAL including failures.
  a) One hero image that defines the whole look: a neon-lit 1980s arcade interior, dark
     with saturated magenta and cyan light. This is the style anchor.
  b) Chain everything else from it by passing its img_<call>.<image> name in
     inputReferences — never re-send image data. You need: three cabinet-art tiles (one per
     game) for the hub, one wide banner for the hub header, and at least two transparent-
     background sprites used inside the games themselves (outputFormat "png",
     background "transparent").
  c) Rename the saved files to meaningful names with run_bash, and record in the README
     which img_<call>.<image> each meaningful name came from and what it was derived from.
GATE 3: print \`ls -la /tmp/neon-arcade/assets\`, confirm every file is non-zero, and state
whether transparent backgrounds actually worked — verify by inspecting the file, not by
assuming, and say plainly if you could not verify it.

PHASE 4 — The three games
All three must be genuinely playable, use engine.js, save a high score, and have a
game-over state with restart.
  Breakout: paddle, ball with angle-off-paddle physics, at least 5 rows of bricks, 3 lives,
    ball speed increasing as bricks clear.
  Snake: grid movement, growth on food, self-collision and wall-collision death, speed
    increasing with length.
  Blackjack: implements the researched rules. All scoring and rule logic lives in
    rules.js as pure functions with no DOM or canvas access — game.js handles rendering
    and input only. Hit, stand, double, split, dealer AI, and correct ace handling.
GATE 4: run \`node --check\` on all six .js files. Then write
/tmp/neon-arcade/games/blackjack/rules.test.js as a plain Node script — no test framework —
asserting at least fifteen specific cases drawn from your Phase 1 sources: soft vs hard
totals, ace demotion, a natural, a push, dealer soft-17 behaviour, split eligibility, and
at least two bust cases. Actually run it with node and show me the real output. If
assertions fail, fix rules.js and re-run until they pass. Do not report success on a
failing run.

PHASE 5 — The hub
index.html is the arcade floor: the generated banner, three cabinet tiles linking to each
game, and each game's current localStorage high score displayed on its tile. Style it in
css/arcade.css to match the generated art — dark, neon, CRT-flavoured. Single stylesheet,
no external fonts or CDNs.
GATE 5: with run_bash, extract every src and href from every HTML file in the project and
confirm each one resolves to a file that exists and is non-empty. Print the check and its
output. Any broken reference is a failed gate.

PHASE 6 — Documentation
README.md: controls for each game, the blackjack rule set with the sources you used, the
full image lineage from Phase 3, and an "Assumptions" section listing every ambiguous
choice you made on your own.

FINAL REPORT
End with: the command to open the arcade, the file tree with sizes, total image generations
including failures, the rules.test.js output, every gate that failed on first attempt and
how you fixed it, and one honest paragraph on what in this project you could not fully
verify.

Do not ask me any questions — make sensible choices for anything ambiguous and record them
in the README. Work strictly inside /tmp/neon-arcade using absolute paths; your shell does
not persist a working directory between commands.`

// The experimental helpers below share the same endpoint as the normal CLI.
const {serverURL, apiKey} = getOpenRouterOptions()

function chattyQuestionResponse () {
    const systemPrompt =
        prompts.environment.harness +
        prompts.format.plainText +
        //prompts.behavior.toolUse +
        collectSystemInfo()

    const responseSystemPrompt =
        prompts.task.explainer +
        prompts.personas.oversharingFriend

    const client : OpenRouter = new OpenRouter({
        serverURL : serverURL,
        apiKey : apiKey
    });

    const chatRequest : ChatRequest = {
        messages: [{
            role : "system",
            content : systemPrompt
        }],
        model : "openai/gpt-5.6-luna",
        provider : {
            only : ["Azure"]
        },
        //tools : toolSchemas
    }

    const summarizeChatRequest : ChatRequest = {
        messages: [{
            role : "system",
            content : responseSystemPrompt
        }],
        model : "openai/gpt-5.6-luna",
        provider : {
            only : ["Azure"]
        },
        //tools : toolSchemas
    }

    const mainSession = new ChatSession(client, chatRequest)
    const summarizeSession = new ChatSession(client, summarizeChatRequest)

// Prints the assistant response
    const printResponse : SessionEventListener = (event) => {

        if (event.kind === "completed message event") {
            if (event.source === "assistant") {
                console.log(event.message.content.toString())
            }
        }
    }

// Takes the assistant response and summarizes it
    const summarizeResponse : SessionEventListener = (event) => {

        if (event.kind === "completed message event") {
            if (event.source === "assistant") {
                summarizeSession.submit({
                    role : "user",
                    content : event.message.content.toString()
                })
            }
        }
    }

    mainSession.eventEmitter.on("listener", printResponse)
    mainSession.eventEmitter.on("listener", summarizeResponse)
    summarizeSession.eventEmitter.on("listener", printResponse)

    mainSession.submit({
        role : "user",
        content : "What was the most recent stable Node.js release and when did it come out? Cite where you found it."
    })
}

function startTui (config: ReturnType<typeof loadRuntimeConfig>, prompt?: string) {
    const interactive = prompt === undefined

    // Interactive is the implicit default, so it has no mode fragment; askWhenUnclear is
    //  its counterpart and must never stack with mode.nonInteractive — see docs/decisions/010
    const interactiveSystemPrompt =
        prompts.environment.harness +
        prompts.format.plainText +
        prompts.behavior.toolUse +
        prompts.behavior.askWhenUnclear +
        collectSystemInfo()

    // The one-shot stack: no human is available mid-session, so the model must persist,
    //  self-verify, and put everything the user needs in the final message
    const nonInteractiveSystemPrompt =
        prompts.environment.harness +
        prompts.mode.nonInteractive +
        prompts.mode.runToCompletion +
        prompts.mode.verifyOwnWork +
        prompts.mode.finalReport +
        prompts.format.plainText +
        prompts.behavior.toolUse +
        collectSystemInfo()

    const client : OpenRouter = new OpenRouter({
        serverURL : config.serverURL,
        apiKey : config.apiKey
    });

    const chatRequest : ChatRequest = {
        messages: [{
            role : "system",
            content : interactive ? interactiveSystemPrompt : nonInteractiveSystemPrompt
        }],
        model : config.model,
        tools : toolSchemas
    }

    const mainSession = new ChatSession(client, chatRequest)

    const interactiveTUIConfig : InteractiveTUIConfig = {
        interactive: true,
        session: mainSession
    }

    const nonInteractiveTUIConfig : NonInteractiveTUIConfig = {
        interactive : false,
        session : mainSession,
        initialChat : {
            role : "user",
            content : prompt ?? ""
        }
    }

    render(createElement(TUI, {config : interactive ? interactiveTUIConfig : nonInteractiveTUIConfig}))
}

async function testImageGen() {
    const client : OpenRouter = new OpenRouter({
        serverURL : serverURL,
        apiKey : apiKey
    });

    function extensionFromMediaType(mediaType : string | undefined) : string {
        switch (mediaType) {
            case "image/jpeg" : return "jpg"
            case "image/webp" : return "webp"
            case "image/svg+xml" : return "svg"
            default : return "png"
        }
    }

    let imageResult : ImageGenerationResponse = await client.images.generate({
        imageGenerationRequest : {
            model : "x-ai/grok-imagine-image-quality",
            prompt : "",
            provider : {

            }
        }
    })

    for (const [index, image] of imageResult.data.entries()) {
        // b64Json is the entire encoded file — png/jpeg/webp bytes, or UTF-8 SVG markup
        const bytes = Buffer.from(image.b64Json, "base64")
        const extension = extensionFromMediaType(image.mediaType)
        writeFile(`output-${index}.${extension}`, bytes)
    }
}

try {
    const options = parseStartupArgs(process.argv.slice(2))
    if (options.help) {
        console.log(USAGE)
    } else {
        const config = loadRuntimeConfig()
        if (options.check) {
            const webSearch = getBraveSearchApiKey() ? "enabled" : "disabled (BRAVE_SEARCH_API_KEY not set)"
            console.log(`Configuration valid for ${config.model}. Web search ${webSearch}. No API request sent.`)
        } else if (options.prompt === undefined && !process.stdin.isTTY) {
            throw new Error('Interactive chat requires a terminal. Use --prompt "your task" for noninteractive input.')
        } else {
            startTui(config, options.prompt)
        }
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
}
