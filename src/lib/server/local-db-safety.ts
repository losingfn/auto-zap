type LocalDatabaseSafetyOptions = {
  requiredFlag: "ALLOW_LOCAL_DB_INTEGRATION_TESTS" | "ALLOW_LOCAL_READ_ONLY_BENCHMARK";
  purpose: string;
};

export function assertLocalTestDatabase(options: LocalDatabaseSafetyOptions) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${options.purpose} refuses NODE_ENV=production.`);
  }
  if (process.env[options.requiredFlag] !== "1") {
    throw new Error(`${options.requiredFlag}=1 is required.`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL URL.");
  }
  if (!new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(url.hostname)) {
    throw new Error(`${options.purpose} permits only localhost PostgreSQL.`);
  }
  const databaseName = decodeURIComponent(url.pathname).replace(/^\//, "");
  if (!databaseName || (!databaseName.includes("_test") && !databaseName.includes("integration"))) {
    throw new Error(`${options.purpose} requires a database name containing _test or integration.`);
  }
  if (databaseName === "autozap") {
    throw new Error(`${options.purpose} refuses the known production-like database name.`);
  }

  return { databaseUrl, databaseName };
}
