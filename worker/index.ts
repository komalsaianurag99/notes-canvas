/** Cloudflare Worker entry point for the vinext-starter template. */
import handler from "vinext/server/app-router-entry";
import { setRuntimeEnv } from "../runtime-env";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: unknown;
  BUCKET: unknown;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  GOOGLE_DRIVE_FOLDER_NAME?: string;
  LIBRARY_ACCESS_USERNAME?: string;
  LIBRARY_ACCESS_PASSWORD?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length, 1);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function hasLibraryAccess(request: Request, env: Env): boolean {
  const password = env.LIBRARY_ACCESS_PASSWORD?.trim();
  if (!password) return true;

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return false;
  try {
    const decoded = atob(authorization.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    const username = decoded.slice(0, separator);
    const suppliedPassword = decoded.slice(separator + 1);
    return (
      constantTimeEqual(username, env.LIBRARY_ACCESS_USERNAME?.trim() || "aardra") &&
      constantTimeEqual(suppliedPassword, password)
    );
  } catch {
    return false;
  }
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    setRuntimeEnv(env);
    if (!hasLibraryAccess(request, env)) {
      return new Response("Authentication required", {
        status: 401,
        headers: {
          "WWW-Authenticate": `Basic realm="Aardra's Library", charset="UTF-8"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return handler.fetch(request, env, ctx);
  },
};

export default worker;
