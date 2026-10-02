import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Configure the binding before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export function getD1() {
  if (!env.DB) throw new Error("Banco de dados temporariamente indisponível.");
  return env.DB;
}
