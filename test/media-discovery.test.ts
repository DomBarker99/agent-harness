import assert from "node:assert/strict";
import {once} from "node:events";
import {createServer} from "node:http";
import {test} from "node:test";
import type {SessionInfo} from "../src/eventPipeline.ts";
import {toolset} from "../src/tools/toolRegistry.ts";

/*
    Media-tool endpoint test. Before generating anything, generate_image and generate_video
    ask the API which models exist; with toolCallCount at 0 they stop after that lookup.
    A local server stands in for OpenRouter to confirm the lookup honours
    OPENROUTER_BASE_URL and that no generation request is sent.
 */

test("both media tools return discovery results from the configured endpoint without generating assets", {timeout: 10000}, async () => {
    const requests: string[] = [];
    const server = createServer((req, res) => {
        requests.push(`${req.method} ${req.url}`);
        res.writeHead(200, {"content-type": "application/json"});
        res.end(JSON.stringify({data: [{id: "test/media-model"}]}));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const previousUrl = process.env.OPENROUTER_BASE_URL;
    process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${address.port}/custom/api`;
    const session: SessionInfo = {
        toolCallCount: () => 0,
        getNthToolCallResult: () => undefined,
        getImageFromName: () => undefined,
        getModelInputModalities: () => [],
        modelAcceptsImageInput: () => false,
        modelAcceptsVideoInput: () => false
    };
    try {
        for (const tool of [toolset.generate_image, toolset.generate_video]) {
            const result = await tool.run({prompt: "Discovery only", model: "test/media-model"}, session);
            assert.deepEqual(result, [{type: "text", text: '{"data":[{"id":"test/media-model"}]}'}]);
        }
        assert.deepEqual(requests, ["GET /custom/api/images/models", "GET /custom/api/videos/models"]);
    } finally {
        if (previousUrl === undefined) delete process.env.OPENROUTER_BASE_URL;
        else process.env.OPENROUTER_BASE_URL = previousUrl;
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
