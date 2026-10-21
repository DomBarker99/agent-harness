import {parseArgs} from "node:util";

/*
    Startup configuration: command-line flags and the environment variables that select the
    model endpoint. Kept separate from main.ts so it can be tested without starting the TUI,
    and shared with the media and web-search tools so every request uses the same settings.

    Nothing here makes a network request or prints a credential; errors name the variable
    to fix, never its value.
 */

export const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export const USAGE = `Usage: npm start -- [options]

Without options, open the interactive terminal chat.

Options:
  -h, --help       Show this help without requiring credentials.
  --check          Validate configuration without making API requests.
  --prompt TEXT    Run one explicit prompt without interactive input.

Environment:
  OPENROUTER_API_KEY   Your OpenRouter API key (required).
  OPENROUTER_MODEL     A model ID with tool-calling support (required).
  OPENROUTER_BASE_URL  Optional API base URL, including /api/v1.
                      Defaults to https://openrouter.ai/api/v1.
  BRAVE_SEARCH_API_KEY Optional. Enables the web_search tool.
`;

export function parseStartupArgs(args: string[]) {
    const {values} = parseArgs({
        args,
        options: {
            help: {type: "boolean", short: "h"},
            check: {type: "boolean"},
            prompt: {type: "string"}
        },
        allowPositionals: false
    });

    if (values.prompt !== undefined && !values.prompt.trim()) {
        throw new Error("--prompt requires a non-empty prompt.");
    }
    if (values.check && values.prompt !== undefined) {
        throw new Error("Use --check or --prompt, not both.");
    }
    return values;
}

// Shared by chat and media tools so an explicitly selected endpoint is used consistently.
export function getOpenRouterOptions(env: NodeJS.ProcessEnv = process.env) {
    return {
        apiKey: env.OPENROUTER_API_KEY?.trim() ?? "",
        serverURL: (env.OPENROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "")
    };
}

// Web search is optional: without a key the tool stays registered but reports that it is
//  not configured instead of sending a request.
export function getBraveSearchApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
    return env.BRAVE_SEARCH_API_KEY?.trim() || undefined;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
    const options = getOpenRouterOptions(env);
    const model = env.OPENROUTER_MODEL?.trim();

    if (!options.apiKey) throw new Error("Set OPENROUTER_API_KEY in .env or your environment.");
    if (!model) throw new Error("Set OPENROUTER_MODEL to a tool-capable model ID available to your account.");

    let url: URL;
    try {
        url = new URL(options.serverURL);
    } catch {
        throw new Error("OPENROUTER_BASE_URL must be an absolute HTTP(S) API base URL.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("OPENROUTER_BASE_URL must use HTTP or HTTPS.");
    }
    if (url.username || url.password || url.search || url.hash) {
        throw new Error("OPENROUTER_BASE_URL must not contain credentials, query parameters or a fragment.");
    }
    return {...options, model};
}
