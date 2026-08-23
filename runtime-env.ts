const RUNTIME_ENV_KEY = Symbol.for("aardras-library.runtime-env");

type RuntimeGlobal = typeof globalThis & {
  [RUNTIME_ENV_KEY]?: Record<string, unknown>;
};

export function setRuntimeEnv(value: object): void {
  (globalThis as RuntimeGlobal)[RUNTIME_ENV_KEY] = value as Record<string, unknown>;
}

export function getRuntimeEnv(): Record<string, unknown> {
  const workerEnv = (globalThis as RuntimeGlobal)[RUNTIME_ENV_KEY];

  // Vinext injects Cloudflare bindings through setRuntimeEnv(). Standard
  // Next.js hosts such as Vercel expose server variables through process.env.
  // Merge both so the storage layer works in either runtime, while preserving
  // non-string Worker bindings such as D1 and R2 when they are available.
  return {
    ...process.env,
    ...workerEnv,
  };
}
