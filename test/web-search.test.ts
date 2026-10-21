/*
    Offline checks for the web_search tool's credential handling. global fetch is replaced
    with a local stub for each test, so no request reaches Brave and no real key is needed.
 */
import assert from "node:assert/strict";
import {test} from "node:test";
import type {SessionInfo} from "../src/eventPipeline.ts";
import {toolset} from "../src/tools/toolRegistry.ts";

const session = {} as SessionInfo; // web_search never reads session state

// Runs fn with BRAVE_SEARCH_API_KEY and fetch temporarily replaced, restoring both afterwards
async function withSearchEnvironment(key: string | undefined, stub: typeof fetch, fn: () => Promise<void>) {
    const previousKey = process.env.BRAVE_SEARCH_API_KEY;
    const previousFetch = globalThis.fetch;
    if (key === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = key;
    globalThis.fetch = stub;
    try {
        await fn();
    } finally {
        if (previousKey === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
        else process.env.BRAVE_SEARCH_API_KEY = previousKey;
        globalThis.fetch = previousFetch;
    }
}

test("without BRAVE_SEARCH_API_KEY the tool explains itself and sends no request", async () => {
    let calls = 0;
    await withSearchEnvironment(" ", async () => { calls++; return new Response("{}"); }, async () => {
        const result = await toolset.web_search.run({q: "node release"}, session);
        assert.equal(calls, 0);
        assert.deepEqual(result, [{type: "text", text: "web_search is not configured: set BRAVE_SEARCH_API_KEY to enable it."}]);
    });
});

test("the configured key is sent as the subscription token with the model's query", async () => {
    const requests: {url: string; init?: RequestInit}[] = [];
    const stub = (async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({url: String(url), init});
        return new Response('{"results":[]}', {status: 200});
    }) as typeof fetch;
    await withSearchEnvironment("test-search-key-not-real", stub, async () => {
        const result = await toolset.web_search.run({q: "node release"}, session);
        assert.deepEqual(result, [{type: "text", text: '{"results":[]}'}]);
    });
    assert.equal(requests.length, 1);
    const headers = requests[0].init?.headers as Record<string, string>;
    assert.equal(headers["X-Subscription-Token"], "test-search-key-not-real");
    assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {q: "node release"});
});

test("a rejected key is reported as a failure rather than returned as results", async () => {
    const stub = (async () => new Response('{"error":"invalid token"}', {status: 401})) as typeof fetch;
    await withSearchEnvironment("revoked-key-not-real", stub, async () => {
        const result = await toolset.web_search.run({q: "node release"}, session);
        assert.deepEqual(result, [{type: "text", text: 'web_search failed with HTTP 401: {"error":"invalid token"}'}]);
    });
});
