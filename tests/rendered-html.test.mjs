import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("optionally protects the complete site with a server-side password", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("auth-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const runtimeEnv = {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    LIBRARY_ACCESS_USERNAME: "aardra",
    LIBRARY_ACCESS_PASSWORD: "private-test-password",
  };
  const executionContext = { waitUntil() {}, passThroughOnException() {} };

  const rejected = await worker.fetch(new Request("http://localhost/"), runtimeEnv, executionContext);
  assert.equal(rejected.status, 401);
  assert.match(rejected.headers.get("www-authenticate") || "", /^Basic /);

  const accepted = await worker.fetch(
    new Request("http://localhost/", {
      headers: {
        authorization: `Basic ${Buffer.from("aardra:private-test-password").toString("base64")}`,
      },
    }),
    runtimeEnv,
    executionContext,
  );
  assert.equal(accepted.status, 200);
});

function decodeMultipart(body, contentType) {
  const boundary = contentType.match(/boundary=([^;]+)/)?.[1];
  assert.ok(boundary, "multipart request includes a boundary");
  const bytes = body instanceof ArrayBuffer
    ? new Uint8Array(body)
    : ArrayBuffer.isView(body)
      ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
      : new TextEncoder().encode(String(body));
  const text = new TextDecoder().decode(bytes);
  const firstHeaderEnd = text.indexOf("\r\n\r\n");
  const secondBoundary = text.indexOf(`\r\n--${boundary}`, firstHeaderEnd + 4);
  const secondHeaderEnd = text.indexOf("\r\n\r\n", secondBoundary + 2);
  const finalBoundary = text.lastIndexOf(`\r\n--${boundary}--`);
  assert.ok(firstHeaderEnd > 0 && secondBoundary > firstHeaderEnd && secondHeaderEnd > secondBoundary);
  assert.ok(finalBoundary > secondHeaderEnd);
  return {
    metadata: JSON.parse(text.slice(firstHeaderEnd + 4, secondBoundary)),
    content: bytes.slice(secondHeaderEnd + 4, finalBoundary),
  };
}

test("persists library data and images through the Google Drive API", async () => {
  const originalFetch = globalThis.fetch;
  let storedJson = "";
  let storedImage = new Uint8Array();
  let deletedImage = false;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init.method || "GET";

    if (url.origin === "https://oauth2.googleapis.com") {
      return Response.json({ access_token: "test-access-token", expires_in: 3600 });
    }

    assert.equal(new Headers(init.headers).get("authorization"), "Bearer test-access-token");

    if (url.pathname === "/drive/v3/files" && method === "GET") {
      return Response.json({ files: [] });
    }

    if (url.pathname === "/drive/v3/files" && method === "POST") {
      return Response.json({ id: "folder-1", name: "Aardra's Library" });
    }

    if (url.pathname === "/upload/drive/v3/files" && method === "POST") {
      const multipart = decodeMultipart(init.body, new Headers(init.headers).get("content-type") || "");
      if (multipart.metadata.appProperties?.aardrasLibraryRole === "data") {
        storedJson = new TextDecoder().decode(multipart.content);
        return Response.json({ id: "data-file-1", name: "aardras-library-data.json" });
      }
      storedImage = multipart.content;
      return Response.json({ id: "image-file-1", name: multipart.metadata.name });
    }

    if (url.pathname === "/drive/v3/files/data-file-1" && method === "GET") {
      return new Response(storedJson, { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === "/upload/drive/v3/files/data-file-1" && method === "PATCH") {
      storedJson = String(init.body);
      return Response.json({ id: "data-file-1" });
    }

    if (url.pathname === "/drive/v3/files/image-file-1" && method === "GET") {
      return new Response(storedImage, { headers: { "Content-Type": "image/png" } });
    }

    if (url.pathname === "/drive/v3/files/image-file-1" && method === "DELETE") {
      deletedImage = true;
      return new Response(null, { status: 204 });
    }

    throw new Error(`Unhandled Google API request: ${method} ${url}`);
  };

  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("drive-test", `${process.pid}-${Date.now()}`);
    const { default: worker } = await import(workerUrl.href);
    const runtimeEnv = {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_REFRESH_TOKEN: "refresh-token",
    };
    const executionContext = {
      waitUntil() {},
      passThroughOnException() {},
    };
    const request = (path, options) =>
      worker.fetch(new Request(`http://localhost${path}`, options), runtimeEnv, executionContext);

    const libraryResponse = await request("/api/concepts");
    assert.equal(libraryResponse.status, 200);
    const library = await libraryResponse.json();
    assert.equal(library.concepts[0].title, "SQL");
    assert.equal(library.concepts[0].description, "");

    const conceptResponse = await request("/api/concepts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Agentic AI" }),
    });
    assert.equal(conceptResponse.status, 201);
    assert.ok(JSON.parse(storedJson).concepts.some((concept) => concept.title === "Agentic AI"));

    const form = new FormData();
    form.set("topicId", "4");
    form.set("file", new File(["small-image"], "learning.png", { type: "image/png" }));
    const uploadResponse = await request("/api/assets", { method: "POST", body: form });
    assert.equal(uploadResponse.status, 201);
    const { asset } = await uploadResponse.json();
    assert.equal(asset.filename, "learning.png");
    assert.equal(JSON.parse(storedJson).assets[0].driveFileId, "image-file-1");

    const imageResponse = await request(`/api/images/${asset.id}`);
    assert.equal(imageResponse.status, 200);
    assert.equal(await imageResponse.text(), "small-image");

    const deleteResponse = await request(`/api/assets?id=${asset.id}`, { method: "DELETE" });
    assert.equal(deleteResponse.status, 200);
    assert.equal(JSON.parse(storedJson).assets.length, 0);
    assert.equal(deletedImage, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
