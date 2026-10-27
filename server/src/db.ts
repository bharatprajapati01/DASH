import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Missing required environment variable DATABASE_URL");

// Prisma 6 "client" engine: queries run in JS through the pg driver adapter (no native query-engine binary).
const url = new URL(connectionString);
const schema = url.searchParams.get("schema") ?? "public";
url.searchParams.delete("schema");

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
});
