import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Placeholder table so drizzle-kit generate/migrate works from day one.
 * Business schema (architecture §2) is owned by M1 and lands in this file.
 */
export const meta = sqliteTable("_meta", {
  key: text("key").primaryKey(),
  value: text("value"),
});
