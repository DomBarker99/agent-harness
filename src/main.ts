import {ChatSession} from "./chatSession.ts";
import {render} from "ink";
import {createElement} from "react";
import {OpenRouter} from "@openrouter/sdk";
import type {ChatRequest} from "@openrouter/sdk/models";
import {prompts} from "./prompts.ts";
import {toolSchemas} from "./tools/toolRegistry.ts";
import {type InteractiveTUIConfig, type NonInteractiveTUIConfig, TUI} from "./TUI.tsx";
import {collectSystemInfo} from "./tools/systemInfo.ts";
import {getBraveSearchApiKey, loadRuntimeConfig, parseStartupArgs, USAGE} from "./config.ts";

/*
    CLI entry point: parses flags, validates configuration, then starts the Ink TUI in one
    of two session modes.

      Interactive     : the default. The user converses with the model, so chat history
                        holds multiple user messages and the model may ask questions.
      Non-interactive : --prompt. A single user message is the session goal; the model
                        works to completion without asking and ends with a final report.

    Multi-turn interaction is only available through the TUI.
 */

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
