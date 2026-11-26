/**
 * Persistence. One logical "records" store: every row of every table is a JSON document tagged with its table.
 *  - Source rows are stored verbatim (including import-retry duplicates) so tests can run against the original data.
 *  - Edits to history tables are APPENDED as new versions (never overwritten) -> point-in-time analytics stay correct.
 *  - Operational tables (tasks, campaign_plan, payments, targets) are updated in place, with an audit_log row.
 *
 * Backends:
 *  - Supabase (production / Vercel): table public.records (see supabase/schema.sql). Used when SUPABASE_URL +
 *    SUPABASE_SERVICE_ROLE_KEY are set.
 *  - Local JSON file (.data/store.json) for development without credentials.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { DB, TableName } from "./types";
import seedJson from "@/data/seed.json";

const seed = seedJson as unknown as DB;
export const TABLES = Object.keys(seed) as TableName[];

export const ID_FIELD: Record<TableName, string> = {
  readme: "topic", field_guide: "field", event: "event_name", targets: "target_version", brands: "brand_id",
  contacts: "contact_id", campaigns: "sponsor_campaign_id", interactions: "interaction_id", qualification: "history_id",
  opportunities: "opportunity_id", opp_history: "history_id", activations: "activation_id",
  campaign_plan: "sponsor_campaign_id", payments: "payment_id", tasks: "task_id", audit_log: "audit_id",
};

export interface Store {
  kind: "supabase" | "local-file";
  load(): Promise<DB>;
  insert(table: TableName, row: Record<string, unknown>): Promise<void>;
  update(table: TableName, id: string, patch: Record<string, unknown>): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  reset(): Promise<void>;
}

const emptyDB = (): DB => Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as DB;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// ------------------------------------------------------------------ Supabase backend
class SupabaseStore implements Store {
  kind = "supabase" as const;
  constructor(private sb: SupabaseClient) {}
  async load(): Promise<DB> {
    const db = emptyDB();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.sb.from("records").select("table_name,data,seq").order("seq").range(from, from + PAGE - 1);
      if (error) throw new Error(`Supabase load failed: ${error.message}`);
      for (const r of data ?? []) (db[r.table_name as TableName] as unknown[])?.push(r.data);
      if (!data || data.length < PAGE) break;
    }
    if (db.brands.length === 0) { await this.reset(); return clone(seed); }
    return db;
  }
  async insert(table: TableName, row: Record<string, unknown>) {
    const { error } = await this.sb.from("records").insert({ table_name: table, record_id: String(row[ID_FIELD[table]]), data: row });
    if (error) throw new Error(error.message);
  }
  async update(table: TableName, id: string, patch: Record<string, unknown>) {
    const { data, error } = await this.sb.from("records").select("seq,data").eq("table_name", table).eq("record_id", id).order("seq").limit(1);
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error(`${table} ${id} not found`);
    const { error: e2 } = await this.sb.from("records").update({ data: { ...data[0].data, ...patch } }).eq("seq", data[0].seq);
    if (e2) throw new Error(e2.message);
  }
  async remove(table: TableName, id: string) {
    const { error } = await this.sb.from("records").delete().eq("table_name", table).eq("record_id", id);
    if (error) throw new Error(error.message);
  }
  async reset() {
    const { error } = await this.sb.from("records").delete().gte("seq", 0);
    if (error) throw new Error(error.message);
    const rows = TABLES.flatMap((t) => (seed[t] as unknown as Record<string, unknown>[]).map((r) => ({ table_name: t, record_id: String(r[ID_FIELD[t]]), data: r })));
    for (let i = 0; i < rows.length; i += 500) {
      const { error: e } = await this.sb.from("records").insert(rows.slice(i, i + 500));
      if (e) throw new Error(`Seed insert failed: ${e.message}`);
    }
  }
}

// ------------------------------------------------------------------ Local file backend
class FileStore implements Store {
  kind = "local-file" as const;
  private file = path.join(process.cwd(), ".data", "store.json");
  private async read(): Promise<DB> {
    try { return JSON.parse(await fs.readFile(this.file, "utf-8")); } catch { await this.reset(); return clone(seed); }
  }
  private async write(db: DB) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(db));
  }
  async load() { return this.read(); }
  async insert(table: TableName, row: Record<string, unknown>) { const db = await this.read(); (db[table] as unknown[]).push(row); await this.write(db); }
  async update(table: TableName, id: string, patch: Record<string, unknown>) {
    const db = await this.read();
    const rows = db[table] as unknown as Record<string, unknown>[];
    const i = rows.findIndex((r) => String(r[ID_FIELD[table]]) === id);
    if (i < 0) throw new Error(`${table} ${id} not found`);
    rows[i] = { ...rows[i], ...patch };
    await this.write(db);
  }
  async remove(table: TableName, id: string) {
    const db = await this.read();
    (db as unknown as Record<string, unknown[]>)[table] = (db[table] as unknown as Record<string, unknown>[]).filter((r) => String(r[ID_FIELD[table]]) !== id);
    await this.write(db);
  }
  async reset() { await this.write(clone(seed)); }
}

let store: Store | null = null;
export function getStore(): Store {
  if (store) return store;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  store = url && key ? new SupabaseStore(createClient(url, key, { auth: { persistSession: false } })) : new FileStore();
  return store;
}
