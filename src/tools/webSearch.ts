import type {Tool, ToolFunction} from "./toolRegistry.ts";
import {z} from "zod";
import {getBraveSearchApiKey} from "../config.ts";

const webSearchFunction : ToolFunction = async (args : z.infer<typeof webSearchArgs>) => {

    // Read per call so the rest of the harness runs without a search key; the model is told
    //  the tool is unavailable instead of receiving a failed request
    const apiKey = getBraveSearchApiKey()
    if (!apiKey) {
        return [{
            type : "text",
            text : "web_search is not configured: set BRAVE_SEARCH_API_KEY to enable it."
        }]
    }

    const URL : string = "https://api.search.brave.com/res/v1/llm/context"

    const requestInit : RequestInit = {
        method : "POST",
        headers : {
            "accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token" : apiKey,
            "Content-Type": "application/json"
        },
        body : JSON.stringify(args)
    }

    // FIXME : For now, We are just going to send everything. In the future the response should
    //  be parsed into a specific ZOD type and then have its segments stripped out to reduce tokens
    try {
        // Await for the server to connect
        const response = await fetch(URL, requestInit)
        // Await for all the text to come true
        const responseBody =  await response.text()

        // An invalid or revoked key comes back as a non-2xx response; label it so the model
        //  does not mistake an error body for search results
        if (!response.ok) {
            return [{
                type : "text",
                text : `web_search failed with HTTP ${response.status}: ${responseBody}`
            }]
        }

        return [{
            type : "text",
            text : responseBody
        }]
    } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        return [{
            type : "text",
            text : reason
        }]
    }
}

const webSearchArgs = z.object({
    q : z.string(),
    country : z.string().optional(),
    search_lang : z.string().optional(),
    count : z.int().optional()
})

export const webSearchTool : Tool = {
    schema: {
        type : "function",
        function : {
            name: "web_search",
            description : `Search the web and return relevant text snippets with their \
source URLs. Use this when the answer depends on current events, external facts, or \
anything outside your training data. Results are extracted page content, not full pages.`,
            parameters : {
                type : "object",
                additionalProperties : false,
                properties : {
                    q : {
                        type : "string",
                        description : "The search query, 1-400 chars, max 50 words"
                    },
                    country : {
                        type : "string",
                        description : "Country for search results, 2-char code, default is us"
                    },
                    search_lang : {
                        type : "string",
                        description : "Language preference for results, 2+ char code, default is en"
                    },
                    count : {
                        type : "number",
                        description : "Maximum number of search results to consider, range 1-50, default 20"
                    }
                },
                required : ["q"]
            },
        }
    },
    args : webSearchArgs,
    run : webSearchFunction
}



