import assert from "node:assert/strict";
import {spawn, spawnSync} from "node:child_process";
import {createServer} from "node:http";
import {once} from "node:events";
import {test} from "node:test";
import {DEFAULT_BASE_URL, getOpenRouterOptions, loadRuntimeConfig, parseStartupArgs} from "../src/config.ts";

const testEnv = {
    ...process.env,
    OPENROUTER_API_KEY: "test-key-not-a-real-credential",
    OPENROUTER_MODEL: "test/model",
    OPENROUTER_BASE_URL: "http://127.0.0.1:9/api/v1",
    BRAVE_SEARCH_API_KEY: "",
    FORCE_COLOR: "0"
};

function runCli(args: string[], env = testEnv) {
    return spawnSync(process.execPath, ["--import", "tsx", "src/main.ts", ...args], {
        cwd: new URL("..", import.meta.url), env, encoding: "utf8", timeout: 10000
    });
}

test("interactive input is the default; a one-shot task must be explicit", () => {
    assert.equal(parseStartupArgs([]).prompt, undefined);
    assert.equal(parseStartupArgs(["--prompt", "Explain this project"]).prompt, "Explain this project");
    assert.throws(() => parseStartupArgs(["--prompt", " "]), /non-empty/);
    assert.throws(() => parseStartupArgs(["--check", "--prompt", "task"]), /not both/);
    assert.throws(() => parseStartupArgs(["--unknown"]), /Unknown option/);
});

test("public OpenRouter is the default and an explicit proxy is normalized", () => {
    const config = loadRuntimeConfig({...testEnv, OPENROUTER_BASE_URL: ""});
    assert.equal(config.serverURL, DEFAULT_BASE_URL);
    assert.equal(config.model, "test/model");
    assert.equal(getOpenRouterOptions({...testEnv, OPENROUTER_BASE_URL: " http://localhost:8080/api/v1/ "}).serverURL,
        "http://localhost:8080/api/v1");
});

test("incomplete or invalid configuration produces actionable errors without echoing secrets", () => {
    assert.throws(() => loadRuntimeConfig({...testEnv, OPENROUTER_API_KEY: " "}), /OPENROUTER_API_KEY/);
    assert.throws(() => loadRuntimeConfig({...testEnv, OPENROUTER_MODEL: " "}), /OPENROUTER_MODEL/);
    for (const url of ["not-a-url", "file:///tmp/api", "https://user:secret@example.com/api/v1", "https://example.com/?key=secret"]) {
        assert.throws(() => loadRuntimeConfig({...testEnv, OPENROUTER_BASE_URL: url}), error => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /OPENROUTER_BASE_URL/);
            assert.ok(!error.message.includes("secret"));
            return true;
        });
    }
});

test("CLI help works without configuration or a terminal", () => {
    const result = runCli(["--help"], {...testEnv, OPENROUTER_API_KEY: "", OPENROUTER_MODEL: ""});
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /interactive terminal chat/);
    assert.match(result.stdout, /--prompt/);
});

test("configuration check needs no reachable endpoint and never prints the key", () => {
    const result = runCli(["--check"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Configuration valid for test\/model/);
    assert.match(result.stdout, /Web search disabled \(BRAVE_SEARCH_API_KEY not set\)/);
    assert.ok(!result.stdout.includes(testEnv.OPENROUTER_API_KEY));
    assert.ok(!result.stderr.includes(testEnv.OPENROUTER_API_KEY));
});

test("a missing model and non-terminal interactive startup fail before sending a prompt", () => {
    const missing = runCli([], {...testEnv, OPENROUTER_MODEL: ""});
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Set OPENROUTER_MODEL/);
    const noTerminal = runCli([]);
    assert.equal(noTerminal.status, 1);
    assert.match(noTerminal.stderr, /requires a terminal/);
    assert.match(noTerminal.stderr, /--prompt/);
});

test("one-shot startup uses the configured model, endpoint and supplied prompt", {timeout: 15000}, async () => {
    const requests: {url: string; body: string; authorization?: string}[] = [];
    const server = createServer(async (req, res) => {
        let body = "";
        for await (const chunk of req) body += chunk;
        requests.push({url: req.url ?? "", body, authorization: req.headers.authorization});
        if (req.url === "/api/v1/model/test/model") {
            res.writeHead(404, {"content-type": "application/json"});
            res.end('{"error":{"message":"No metadata in this local fixture"}}');
            return;
        }
        if (req.url !== "/api/v1/chat/completions") {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, {"content-type": "text/event-stream"});
        for (const [delta, finishReason] of [[{role: "assistant", content: "Local mock response"}, null], [{}, "stop"]]) {
            res.write(`data: ${JSON.stringify({id: "mock-1", object: "chat.completion.chunk", created: 1,
                model: "test/model", choices: [{index: 0, delta, finish_reason: finishReason}]})}\n\n`);
        }
        res.end("data: [DONE]\n\n");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const child = spawn(process.execPath, ["--import", "tsx", "src/main.ts", "--prompt", "Reply with the local mock response"], {
        cwd: new URL("..", import.meta.url),
        env: {...testEnv, OPENROUTER_BASE_URL: `http://127.0.0.1:${address.port}/api/v1`},
        stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let errors = "";
    child.stdout.on("data", chunk => output += chunk);
    child.stderr.on("data", chunk => errors += chunk);
    const timeout = setTimeout(() => child.kill(), 10000);
    try {
        const [code] = await once(child, "close");
        assert.equal(code, 0, errors);
        assert.match(output, /Local mock response/);
        const chats = requests.filter(request => request.url === "/api/v1/chat/completions");
        assert.equal(chats.length, 1);
        assert.equal(chats[0].authorization, `Bearer ${testEnv.OPENROUTER_API_KEY}`);
        const body = JSON.parse(chats[0].body);
        assert.equal(body.model, "test/model");
        assert.equal(body.messages.at(-1).content, "Reply with the local mock response");
        assert.equal(body.provider, undefined);
        assert.ok(requests.some(request => request.url === "/api/v1/model/test/model"));
    } finally {
        clearTimeout(timeout);
        if (child.exitCode === null) child.kill();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
