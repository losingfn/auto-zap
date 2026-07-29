import { createHash } from "node:crypto";

const PAYLOAD_SCHEMA_VERSION_PREFIX = "background-job-payload";

export function hashBackgroundJobPayload(input: {
  payload: Record<string, unknown>;
  payloadVersion: string;
}) {
  const canonicalPayload = canonicalizeBackgroundJobPayload(input.payload);
  return createHash("sha256")
    .update(`${PAYLOAD_SCHEMA_VERSION_PREFIX}:${input.payloadVersion}:${canonicalPayload}`)
    .digest("hex");
}

export function canonicalizeBackgroundJobPayload(payload: Record<string, unknown>) {
  return canonicalize(payload, new Set<object>());
}

function canonicalize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Background job payload contains a non-finite number.");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error("Background job payload cannot contain circular references.");
    ancestors.add(value);
    const result = `[${value.map((item) => canonicalize(item, ancestors)).join(",")}]`;
    ancestors.delete(value);
    return result;
  }
  if (value && typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error("Background job payload must contain only plain objects.");
    }
    if (ancestors.has(value)) throw new Error("Background job payload cannot contain circular references.");
    ancestors.add(value);
    const record = value as Record<string, unknown>;
    const result = `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], ancestors)}`)
      .join(",")}}`;
    ancestors.delete(value);
    return result;
  }

  throw new Error("Background job payload contains an unsupported value.");
}
