import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import worker from "./early-access.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function env(overrides = {}) {
  return {
    BREVO_API_KEY: "test-key",
    BREVO_LIST_ID: "42",
    ...overrides,
  };
}

async function invoke(method, body, workerEnv = env(), brevoImpl) {
  if (brevoImpl) {
    globalThis.fetch = brevoImpl;
  }

  const init = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  return worker.fetch(new Request("https://happypixels.app/api/early-access", init), workerEnv);
}

async function readJson(response) {
  return {
    status: response.status,
    body: await response.json(),
  };
}

test("rejects non-POST methods with the live success=false contract", async () => {
  const { status, body } = await readJson(await invoke("GET"));
  assert.equal(status, 405);
  assert.deepEqual(body, { success: false, error: "Method not allowed." });
});

test("rejects invalid JSON", async () => {
  const { status, body } = await readJson(await invoke("POST", "{"));
  assert.equal(status, 400);
  assert.deepEqual(body, { success: false, error: "Invalid request body." });
});

test("rejects a JSON null body instead of crashing", async () => {
  const { status, body } = await readJson(await invoke("POST", "null"));
  assert.equal(status, 400);
  assert.deepEqual(body, { success: false, error: "Invalid request body." });
});

test("rejects an invalid email", async () => {
  const { status, body } = await readJson(await invoke("POST", { email: "not-an-email" }));
  assert.equal(status, 400);
  assert.deepEqual(body, { success: false, error: "Please enter a valid email address." });
});

test("returns success true when Brevo accepts the contact", async () => {
  const { status, body } = await readJson(
    await invoke("POST", { email: "Person@Example.com" }, env(), async (url, options) => {
      assert.equal(String(url), "https://api.brevo.com/v3/contacts");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["api-key"], "test-key");
      assert.deepEqual(JSON.parse(options.body), {
        email: "person@example.com",
        listIds: [42],
        updateEnabled: true,
      });
      return new Response(null, { status: 201 });
    })
  );

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.ok, true);
});

test("treats an existing Brevo contact as success", async () => {
  const { status, body } = await readJson(
    await invoke(
      "POST",
      { email: "repeat@example.com" },
      env(),
      async () =>
        new Response(JSON.stringify({ message: "Contact already exist" }), { status: 400 })
    )
  );

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.ok, true);
});
