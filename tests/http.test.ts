import assert from "node:assert/strict";
import test from "node:test";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyCors,
  STATUS_CACHE_CONTROL,
} from "../api/_lib/http.ts";

function responseHarness() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body: unknown = null;
  const response = {
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), String(value));
      return response;
    },
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(value: unknown) {
      body = value;
      return response;
    },
    end() {
      return response;
    },
  } as unknown as VercelResponse;
  return {
    response,
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

test("CORS responses always vary by Origin and allow GitHub Pages", () => {
  const harness = responseHarness();
  const request = {
    method: "GET",
    headers: { origin: "https://lordboby-crypto.github.io" },
  } as VercelRequest;

  assert.equal(applyCors(request, harness.response), false);
  assert.equal(harness.headers.get("vary"), "Origin");
  assert.equal(
    harness.headers.get("access-control-allow-origin"),
    "https://lordboby-crypto.github.io",
  );
});

test("status cache policy cannot reuse an origin-specific CORS response", () => {
  assert.equal(STATUS_CACHE_CONTROL, "private, no-store");
});
