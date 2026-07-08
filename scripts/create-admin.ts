import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adminUsers } from "@/db/schema";
import { hashPassword } from "@/features/admin/auth";

type CreateAdminArgs = {
  email: string;
  password: string;
  name: string | null;
  role: "owner" | "manager";
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const passwordHash = await hashPassword(args.password);
  const now = new Date();

  const [existingAdmin] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, args.email))
    .limit(1);

  if (existingAdmin) {
    await db
      .update(adminUsers)
      .set({
        fullName: args.name,
        role: args.role,
        passwordHash,
        isActive: true,
        passwordChangedAt: now
      })
      .where(eq(adminUsers.id, existingAdmin.id));

    console.log(`Admin updated: ${args.email}`);
    return;
  }

  await db.insert(adminUsers).values({
    email: args.email,
    fullName: args.name,
    role: args.role,
    passwordHash,
    isActive: true,
    passwordChangedAt: now
  });

  console.log(`Admin created: ${args.email}`);
}

function parseArgs(argv: string[]): CreateAdminArgs {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];

    if (!item.startsWith("--")) {
      continue;
    }

    const key = item.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    values.set(key, value);
    index += 1;
  }

  const email = values.get("email")?.trim().toLowerCase();
  const password = values.get("password") ?? "";
  const role = values.get("role") ?? "owner";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Use --email with a valid email address.");
  }

  if (password.length < 10) {
    throw new Error("Use --password with at least 10 characters.");
  }

  if (role !== "owner" && role !== "manager") {
    throw new Error("--role must be owner or manager.");
  }

  return {
    email,
    password,
    name: values.get("name")?.trim() || null,
    role
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
