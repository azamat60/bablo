import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const ledgers = sqliteTable("ledgers", {
  owner: text("owner").primaryKey(),
  state: text("state").notNull(),
  revision: integer("revision").notNull().default(0),
});
