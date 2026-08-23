const RUNTIME_ENV_KEY = Symbol.for("aardras-library.runtime-env");

type RuntimeGlobal = typeof globalThis & {
  [RUNTIME_ENV_KEY]?: Record<string, unknown>;
};

export function setRuntimeEnv(value: object): void {
  (globalThis as RuntimeGlobal)[RUNTIME_ENV_KEY] = value as Record<string, unknown>;
}

export function getRuntimeEnv(): Record<string, unknown> {
  const value = (globalThis as RuntimeGlobal)[RUNTIME_ENV_KEY];
  if (!value) {
    throw new Error("The server runtime environment is unavailable.");
  }
  return value;
}
