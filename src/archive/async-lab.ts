/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ASYNC LAB — isolated practice for Promises / async / await / setTimeout
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  No Ink, no JSX, no React. Pure async JavaScript so you can focus on ONE thing.
 *
 *  HOW TO USE
 *    1. Set RUN below to the exercise number you're working on.
 *    2. Run it:   npm run async-lab
 *    3. [STUDY] exercises are already written — read them, run them, tweak them.
 *       [IMPLEMENT] exercises have a TODO — write the code, then run to check.
 *
 *  A working `delay` helper is provided at the top so later exercises can use it
 *  even before you write your own in Exercise 2.
 */

const RUN = 5; // ← change this number (1–6) and re-run

// A ready-made "sleep": resolves after `ms` milliseconds. (You'll build your own
// version in Exercise 2 — this one is here so Exercises 4–5 work regardless.)
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercise 1 — [STUDY] Promise basics: resolve, .then, and await
// ─────────────────────────────────────────────────────────────────────────────
async function exercise1() {
    // A promise is "a value that will arrive later". Here we make one that
    // resolves immediately with the string "hello".
    const p: Promise<string> = new Promise((resolve) => {
        resolve("hello");
    });

    // Two ways to get the value OUT of a promise:

    // (a) the older .then() style — pass a callback that receives the value:
    p.then((value) => console.log("via .then():", value));

    // (b) the await style — pause until it resolves, then use the value directly:
    const value = await p;
    console.log("via await: ", value);

    // Notice: `p` is a Promise object, not the string. await (or .then) unwraps it.
    console.log("the promise itself is:", p); // Promise { 'hello' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercise 2 — [IMPLEMENT] Promisify setTimeout: write your own delay()
// ─────────────────────────────────────────────────────────────────────────────
async function exercise2() {
    // TODO: write a function mySleep(ms) that returns a Promise which resolves
    //       after `ms` milliseconds (don't use the `delay` helper — build it).
    //
    //   function mySleep(ms: number): Promise<void> {
    //       return new Promise(resolve => { ... setTimeout ... });
    //   }
    //
    // Then await it here and log before/after with timestamps so you SEE the gap.

    function mySleep(ms : number) : Promise<void> {

        /**
         * Returns a new void promise that stalls the async function it is in for
         *  however many ms the user passes in. Once the timeout has been completed,
         *  the promise's resolve function is called and it has gone from pending to fulfilled.
         *  There is no explicit rejected state but one would occur if an error was thrown within
         *  the function it is declared with
         */
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                resolve()
            }, ms)
        })
    }

    const sleepTime = 2000

    console.log("start:", Date.now());
    await mySleep(sleepTime);
    console.log("end:  ", Date.now(), `(should be ~${sleepTime}ms later)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercise 3 — [IMPLEMENT] Errors: reject + try/catch
// ─────────────────────────────────────────────────────────────────────────────
async function exercise3() {
    // A promise can FAIL by calling reject(...) instead of resolve(...).
    function riskyOperation(shouldFail: boolean): Promise<string> {
        return new Promise((resolve, reject) => {
            if (shouldFail) reject(new Error("the operation failed!"));
            else resolve("success!");
        });
    }

    // TODO: call riskyOperation(true) inside a try/catch and log the caught error.
    //       Then call riskyOperation(false) and log the success value.
    //
    //   try {
    //       const result = await riskyOperation(true);
    //       console.log("got:", result);
    //   } catch (err) {
    //       console.log("caught:", (err as Error).message);
    //   }

    riskyOperation(true).then(value => console.log(value))
                                    .catch(error => console.error("caught: " + error))
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercise 4 — [IMPLEMENT] Sequential vs parallel (the big one)
// ─────────────────────────────────────────────────────────────────────────────
async function exercise4() {
    // You have three 1-second tasks. Run them two ways and compare the time.

    // SEQUENTIAL: await them one after another.
    // TODO: await delay(1000) three times in a row. Time it with Date.now().
    //       Expected total: ~3000ms (each waits for the previous).
    const seqStart = Date.now();
    await delay(1000); await delay(1000); await delay(1000);
    console.log("sequential took:", Date.now() - seqStart, "ms");

    // PARALLEL: start all three, then wait for all together with Promise.all.
    // TODO: const tasks = [delay(1000), delay(1000), delay(1000)];
    //       await Promise.all(tasks);
    //       Expected total: ~1000ms (they overlap).
    const parStart = Date.now();
    await Promise.all([delay(1000), delay(1000), delay(1000)]);
    console.log("parallel took:  ", Date.now() - parStart, "ms");
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercise 5 — [IMPLEMENT] Promise.all returns an array of results
// ─────────────────────────────────────────────────────────────────────────────
async function exercise5() {
    // Simulate fetching three things concurrently, each taking a different time.
    function fetchThing(name: string, ms: number): Promise<string> {
        return delay(ms).then(() => `result of ${name}`);
    }

    // TODO: use Promise.all to run all three at once and collect their results.
    //       Promise.all resolves to an ARRAY of the resolved values, in order.
    //
    const parStart = Date.now();
      const results = await Promise.all([
          fetchThing("A", 500),
          fetchThing("B", 1000),
          fetchThing("C", 300),
      ]);

    console.log("parallel took:  ", Date.now() - parStart, "ms");
    console.log(results);   // ["result of A", "result of B", "result of C"]
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercise 6 — [STUDY] Common gotchas
// ─────────────────────────────────────────────────────────────────────────────
async function exercise6() {
    // GOTCHA 1: forgetting `await` gives you the Promise, not the value.
    const withoutAwait = delay(10).then(() => "the value");
    console.log("forgot await:", withoutAwait); // Promise { <pending> }  ← bug!
    const withAwait = await delay(10).then(() => "the value");
    console.log("with await:  ", withAwait); // "the value"  ← correct

    // GOTCHA 2: await inside forEach does NOT pause the loop. forEach ignores
    // the promise the async callback returns, so all three "start" immediately
    // and the loop finishes BEFORE they resolve.
    console.log("\n-- forEach (broken: 'done' prints first) --");
    [1, 2, 3].forEach(async (n) => {
        await delay(n * 100);
        console.log("forEach item", n);
    });
    console.log("forEach loop 'done' (but items haven't run yet!)");

    // To actually wait in a loop, use for...of with await — it pauses each turn.
    await delay(500); // let the broken ones finish printing first
    console.log("\n-- for...of (correct: waits each iteration) --");
    for (const n of [1, 2, 3]) {
        await delay(n * 100);
        console.log("for...of item", n);
    }
    console.log("for...of done (after all items)");
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner — picks the exercise based on RUN. Don't edit below.
// ─────────────────────────────────────────────────────────────────────────────
const exercises: Record<number, () => Promise<void>> = {
    1: exercise1, 2: exercise2, 3: exercise3,
    4: exercise4, 5: exercise5, 6: exercise6,
};

const chosen = exercises[RUN];
if (!chosen) {
    console.log(`No exercise ${RUN}. Set RUN to 1–6.`);
} else {
    console.log(`── Running exercise ${RUN} ──\n`);
    await chosen();
    console.log("\n── done ──");
}
