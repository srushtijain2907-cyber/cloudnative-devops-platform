const { test, before, after } = require("node:test");
const assert = require("node:assert");
const app = require("./server");

let server;
let base;

before(
  () =>
    new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        base = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    })
);

after(() => {
  server.closeAllConnections?.();
  server.close();
});

test("GET / returns project info", async () => {
  const res = await fetch(base + "/");
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.status, "running");
});

test("GET /health returns healthy", async () => {
  const res = await fetch(base + "/health");
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { status: "healthy" });
});

test("GET /metrics exposes Prometheus metrics", async () => {
  const res = await fetch(base + "/metrics");
  assert.strictEqual(res.status, 200);
  assert.match(await res.text(), /http_requests_total/);
});

test("GET /fail returns 500", async () => {
  const res = await fetch(base + "/fail");
  assert.strictEqual(res.status, 500);
});
