import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { createNeonAuthForNextRequest } from "@/lib/neon/server-client";
import { createSeaweedStorage } from "@/lib/neon/storage-adapter";
import { createPool } from "@/lib/agent-engine/db/pool";

type NeonAuth = ReturnType<typeof createNeonAuthForNextRequest>;
type PgRow = Record<string, unknown>;
type PgResponse<T = unknown> = {
  data: T;
  error: Error | null;
  count: number | null;
  status: number;
  statusText: string;
};
type Filter = { sql: string; values: unknown[] };
type RelationSelection = {
  output: string;
  table: string;
  foreignKey: string;
  columns: string;
  required: boolean;
};

type AdminQuery = PromiseLike<PgResponse> & {
  select: (columns?: string, options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) => AdminQuery;
  insert: (values: PgRow | PgRow[]) => AdminQuery;
  update: (values: PgRow) => AdminQuery;
  upsert: (values: PgRow | PgRow[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) => AdminQuery;
  delete: () => AdminQuery;
  eq: (column: string, value: unknown) => AdminQuery;
  neq: (column: string, value: unknown) => AdminQuery;
  gt: (column: string, value: unknown) => AdminQuery;
  gte: (column: string, value: unknown) => AdminQuery;
  lt: (column: string, value: unknown) => AdminQuery;
  lte: (column: string, value: unknown) => AdminQuery;
  is: (column: string, value: null | boolean) => AdminQuery;
  in: (column: string, values: unknown[]) => AdminQuery;
  like: (column: string, value: string) => AdminQuery;
  ilike: (column: string, value: string) => AdminQuery;
  not: (column: string, operator: string, value: unknown) => AdminQuery;
  or: (filters: string) => AdminQuery;
  match: (values: PgRow) => AdminQuery;
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => AdminQuery;
  limit: (count: number) => AdminQuery;
  range: (from: number, to: number) => AdminQuery;
  single: () => AdminQuery;
  maybeSingle: () => AdminQuery;
  throwOnError: () => Promise<unknown>;
};

type AdminClient = {
  from: (table: string) => AdminQuery;
  rpc: (functionName: string, args?: PgRow) => Promise<PgResponse>;
  auth: ReturnType<typeof authAdminSurface>;
  storage: ReturnType<typeof createSeaweedStorage>;
};

let adminClient: AdminClient | null = null;
let pool: pg.Pool | null = null;

function unsupported(operation: string): never {
  throw new Error(`neon_admin_operation_unavailable: ${operation}`);
}

function normalizeDatabaseError(error: unknown): Error {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  if (typeof code === "string") Object.assign(normalized, { code });
  return normalized;
}

function authAdminSurface() {
  const auth = createNeonAuthForNextRequest() as NeonAuth;
  const authRecord = auth as unknown as Record<string, unknown>;
  const admin = authRecord.admin as Record<string, unknown> | undefined;
  const invoke = async (operation: string, candidates: string[], input?: unknown) => {
    for (const candidate of candidates) {
      const fn = admin?.[candidate] ?? authRecord[candidate];
      if (typeof fn === "function") {
        return fn.call(admin?.[candidate] ? admin : auth, input);
      }
    }
    unsupported(operation);
  };

  return {
    admin: {
      getUserById: (userId: string) => invoke("getUserById", ["getUserById", "getUser"], { userId }),
      listUsers: (input?: unknown) => invoke("listUsers", ["listUsers"], input),
      createUser: (input?: unknown) => invoke("createUser", ["createUser"], input),
      updateUserById: (input?: unknown) => invoke("updateUserById", ["updateUser", "updateUserById"], input),
      deleteUser: (userId: string) => invoke("deleteUser", ["removeUser", "deleteUser"], { userId }),
    },
  };
}

function getPool(): pg.Pool {
  if (!pool) {
    if (!env.NEON_DATABASE_URL) {
      throw new Error("neon_database_url_missing: configure the private Neon PostgreSQL URL");
    }
    pool = createPool(env.NEON_DATABASE_URL);
  }
  return pool;
}

function identifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(value)) {
    throw new Error(`neon_admin_invalid_identifier: ${value}`);
  }
  return value
    .split(".")
    .map((part) => `"${part}"`)
    .join(".");
}

function columnList(columns: string | undefined): string {
  if (!columns || columns.trim() === "*") return "*";
  return columns
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (trimmed === "*") return "*";
      const asAlias = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
      if (asAlias) return `${identifier(asAlias[1] ?? "")} AS ${identifier(asAlias[2] ?? "")}`;
      const colonAlias = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*):([A-Za-z_][A-Za-z0-9_]*)$/);
      if (colonAlias) return `${identifier(colonAlias[2] ?? "")} AS ${identifier(colonAlias[1] ?? "")}`;
      return identifier(trimmed);
    })
    .join(", ");
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parsePostgrestCondition(expression: string, bind: (value: unknown) => string): string {
  const trimmed = expression.trim();
  const group = trimmed.match(/^(and|or)\((.*)\)$/i);
  if (group) {
    const joiner = group[1]?.toUpperCase() === "OR" ? " OR " : " AND ";
    return `(${splitTopLevel(group[2] ?? "").map((item) => parsePostgrestCondition(item, bind)).join(joiner)})`;
  }
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\.(eq|neq|gt|gte|lt|lte|in|is)\.(.*)$/i);
  if (!match) throw new Error(`neon_admin_invalid_or_filter:${trimmed}`);
  const [, rawColumn, rawOperator, rawValue] = match;
  const column = identifier(rawColumn ?? "");
  const operator = (rawOperator ?? "").toLowerCase();
  const value = rawValue ?? "";
  if (operator === "is") {
    if (value.toLowerCase() === "null") return `${column} IS NULL`;
    if (value.toLowerCase() === "true") return `${column} IS TRUE`;
    if (value.toLowerCase() === "false") return `${column} IS FALSE`;
    throw new Error(`neon_admin_invalid_is_filter:${value}`);
  }
  if (operator === "in") {
    if (!value.startsWith("(") || !value.endsWith(")")) throw new Error(`neon_admin_invalid_in_filter:${value}`);
    const values = splitTopLevel(value.slice(1, -1));
    return `${column} = ANY(${bind(values)})`;
  }
  const sqlOperator = operator === "eq" ? "=" : operator === "neq" ? "!=" : operator.toUpperCase();
  return `${column} ${sqlOperator} ${bind(value)}`;
}

function relationForeignKey(sourceTable: string, targetTable: string, explicitKey?: string): string {
  if (explicitKey) return explicitKey;
  if (targetTable === "organizations") return "organization_id";
  if (targetTable === "crm_stages") return "stage_id";
  if (targetTable === "contacts") return "contact_id";
  if (targetTable === "crm_leads") return "lead_id";
  if (targetTable === "channel_sessions") return "channel_session_id";
  throw new Error(`neon_admin_relation_key_unknown:${sourceTable}:${targetTable}`);
}

function parseSelection(columns: string): { base: string; relations: RelationSelection[] } {
  const relations: RelationSelection[] = [];
  const relationPattern = /([A-Za-z_][A-Za-z0-9_]*)(!inner)?(?::([A-Za-z_][A-Za-z0-9_]*))?\(([^()]*)\)/g;
  const baseParts: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = relationPattern.exec(columns)) !== null) {
    baseParts.push(columns.slice(cursor, match.index));
    const table = match[1] ?? "";
    const explicitKey = match[3];
    relations.push({
      output: table,
      table,
      foreignKey: relationForeignKey("", table, explicitKey),
      columns: match[4] ?? "*",
      required: Boolean(match[2]),
    });
    cursor = match.index + match[0].length;
  }
  baseParts.push(columns.slice(cursor));
  const base = baseParts
    .join(",")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
  return { base: base || "*", relations };
}

async function hydrateRelations(rows: PgRow[], relations: RelationSelection[]): Promise<PgRow[]> {
  if (relations.length === 0 || rows.length === 0) return rows;
  const hydrated: PgRow[] = [];
  for (const row of rows) {
    let keep = true;
    for (const relation of relations) {
      const value = row[relation.foreignKey];
      if (value === null || value === undefined) {
        if (relation.required) keep = false;
        row[relation.output] = null;
        continue;
      }
      const result = await getPool().query<PgRow>(
        `SELECT ${columnList(relation.columns)} FROM ${identifier(`public.${relation.table}`)} WHERE "id" = $1 LIMIT 1`,
        [value],
      );
      const related = result.rows[0] ?? null;
      if (relation.required && related === null) keep = false;
      row[relation.output] = related;
    }
    if (keep) hydrated.push(row);
  }
  return hydrated;
}

function valuesForRow(row: PgRow, keys?: string[]): { keys: string[]; values: unknown[] } {
  const selected = keys ?? Object.keys(row).filter((key) => row[key] !== undefined);
  return { keys: selected, values: selected.map((key) => row[key]) };
}

class PostgresQuery implements AdminQuery {
  private operation: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: PgRow | PgRow[] | null = null;
  private returning = "*";
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private singleMode: "single" | "maybe" | null = null;
  private headOnly = false;
  private relations: RelationSelection[] = [];
  private orExpression: string | null = null;
  private upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};

  constructor(private readonly table: string) {}

  select(columns = "*", options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }): AdminQuery {
    const parsed = parseSelection(columns);
    this.returning = columnList(parsed.base);
    this.relations = parsed.relations;
    this.headOnly = options?.head === true;
    return this;
  }

  insert(values: PgRow | PgRow[]): AdminQuery {
    this.operation = "insert";
    this.payload = values;
    return this;
  }

  update(values: PgRow): AdminQuery {
    this.operation = "update";
    this.payload = values;
    return this;
  }

  upsert(values: PgRow | PgRow[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): AdminQuery {
    this.operation = "upsert";
    this.payload = values;
    this.upsertOptions = options ?? {};
    return this;
  }

  delete(): AdminQuery {
    this.operation = "delete";
    return this;
  }

  private addFilter(column: string, operator: string, value: unknown): AdminQuery {
    const safeColumn = identifier(column);
    if (value === null && operator === "=") {
      this.filters.push({ sql: `${safeColumn} IS NULL`, values: [] });
    } else if (value === null && operator === "!=") {
      this.filters.push({ sql: `${safeColumn} IS NOT NULL`, values: [] });
    } else {
      this.filters.push({ sql: `${safeColumn} ${operator} $VALUE`, values: [value] });
    }
    return this;
  }

  eq(column: string, value: unknown): AdminQuery { return this.addFilter(column, "=", value); }
  neq(column: string, value: unknown): AdminQuery { return this.addFilter(column, "!=", value); }
  gt(column: string, value: unknown): AdminQuery { return this.addFilter(column, ">", value); }
  gte(column: string, value: unknown): AdminQuery { return this.addFilter(column, ">=", value); }
  lt(column: string, value: unknown): AdminQuery { return this.addFilter(column, "<", value); }
  lte(column: string, value: unknown): AdminQuery { return this.addFilter(column, "<=", value); }
  is(column: string, value: null | boolean): AdminQuery { return this.addFilter(column, "=", value); }

  in(column: string, values: unknown[]): AdminQuery {
    const safeColumn = identifier(column);
    this.filters.push({ sql: `${safeColumn} = ANY($VALUE)`, values: [values] });
    return this;
  }

  like(column: string, value: string): AdminQuery { return this.addFilter(column, "LIKE", value); }
  ilike(column: string, value: string): AdminQuery { return this.addFilter(column, "ILIKE", value); }

  not(column: string, operator: string, value: unknown): AdminQuery {
    if (operator === "in") {
      const values = typeof value === "string" && value.startsWith("(") && value.endsWith(")")
        ? splitTopLevel(value.slice(1, -1))
        : Array.isArray(value) ? value : [value];
      this.filters.push({ sql: `NOT (${identifier(column)} = ANY($VALUE))`, values: [values] });
      return this;
    }
    const allowed = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is"]);
    if (!allowed.has(operator)) throw new Error(`neon_admin_invalid_filter_operator: ${operator}`);
    const sqlOperator = operator === "eq" ? "!=" : operator === "neq" ? "=" : operator.toUpperCase();
    return this.addFilter(column, sqlOperator, value);
  }

  or(filters: string): AdminQuery {
    this.orExpression = filters;
    return this;
  }

  match(values: PgRow): AdminQuery {
    for (const [key, value] of Object.entries(values)) this.eq(key, value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): AdminQuery {
    const direction = options?.ascending === false ? "DESC" : "ASC";
    const nulls = options?.nullsFirst === true ? " NULLS FIRST" : options?.nullsFirst === false ? " NULLS LAST" : "";
    this.orders.push(`${identifier(column)} ${direction}${nulls}`);
    return this;
  }

  limit(count: number): AdminQuery { this.limitValue = Math.max(0, count); return this; }
  range(from: number, to: number): AdminQuery {
    this.offsetValue = Math.max(0, from);
    this.limitValue = Math.max(0, to - from + 1);
    return this;
  }
  single(): AdminQuery { this.singleMode = "single"; this.limitValue = 2; return this; }
  maybeSingle(): AdminQuery { this.singleMode = "maybe"; this.limitValue = 2; return this; }

  async throwOnError(): Promise<unknown> {
    const result = await this.execute();
    if (result.error) throw result.error;
    return result.data;
  }

  then<TResult1 = PgResponse, TResult2 = never>(
    onfulfilled?: ((value: PgResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<PgResponse> {
    try {
      const params: unknown[] = [];
      const bind = (value: unknown): string => {
        params.push(value);
        return `$${params.length}`;
      };
      const conditions = this.filters.map((filter) => filter.sql.replace("$VALUE", bind(filter.values[0])));
      if (this.orExpression) conditions.push(parsePostgrestCondition(this.orExpression, bind));
      const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
      const order = this.orders.length ? ` ORDER BY ${this.orders.join(", ")}` : "";
      const limit = this.limitValue === null ? "" : ` LIMIT ${this.limitValue}`;
      const offset = this.offsetValue === null ? "" : ` OFFSET ${this.offsetValue}`;
      const table = identifier(this.table.includes(".") ? this.table : `public.${this.table}`);
      let sql: string;

      if (this.operation === "select") {
        sql = this.headOnly
          ? `SELECT count(*)::int AS count FROM ${table}${where}`
          : `SELECT ${this.returning} FROM ${table}${where}${order}${limit}${offset}`;
      } else if (this.operation === "insert" || this.operation === "upsert") {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
        const first = valuesForRow(rows[0] ?? {});
        if (first.keys.length === 0) throw new Error("neon_admin_empty_insert");
        const rowSql = rows.map((row) => {
          const current = valuesForRow(row, first.keys);
          return `(${current.values.map(bind).join(", ")})`;
        });
        sql = `INSERT INTO ${table} (${first.keys.map(identifier).join(", ")}) VALUES ${rowSql.join(", ")} `;
        if (this.operation === "upsert") {
          const conflict = this.upsertOptions.onConflict
            ? ` (${this.upsertOptions.onConflict.split(",").map((item) => identifier(item.trim())).join(", ")})`
            : "";
          if (this.upsertOptions.ignoreDuplicates) {
            sql += `ON CONFLICT${conflict} DO NOTHING `;
          } else {
            const updates = first.keys.map((key) => `${identifier(key)} = EXCLUDED.${identifier(key)}`).join(", ");
            sql += `ON CONFLICT${conflict} DO UPDATE SET ${updates} `;
          }
        }
        sql += `RETURNING ${this.returning}`;
      } else if (this.operation === "update") {
        const values = valuesForRow(this.payload as PgRow);
        if (values.keys.length === 0) throw new Error("neon_admin_empty_update");
        const assignments = values.keys.map((key, index) => `${identifier(key)} = ${bind(values.values[index])}`).join(", ");
        sql = `UPDATE ${table} SET ${assignments}${where} RETURNING ${this.returning}`;
      } else {
        sql = `DELETE FROM ${table}${where} RETURNING ${this.returning}`;
      }

      const result = await getPool().query<PgRow>(sql, params);
      if (this.headOnly) {
        const count = Number(result.rows[0]?.count ?? 0);
        return { data: null, error: null, count, status: 200, statusText: "OK" };
      }
      let rows = result.rows;
      rows = await hydrateRelations(rows, this.relations);
      let data: unknown = rows;
      if (this.singleMode === "single") {
        if (rows.length !== 1) throw new Error(`neon_admin_single_expected_one_row:${rows.length}`);
        data = rows[0];
      } else if (this.singleMode === "maybe") {
        if (rows.length > 1) throw new Error(`neon_admin_maybe_single_expected_at_most_one:${rows.length}`);
        data = rows[0] ?? null;
      }
      return { data, error: null, count: result.rowCount, status: 200, statusText: "OK" };
    } catch (error) {
      return { data: null, error: normalizeDatabaseError(error), count: null, status: 500, statusText: "PostgreSQL error" };
    }
  }
}

function createDirectAdminClient(): AdminClient {
  return {
    from: (table) => new PostgresQuery(table),
    rpc: async (functionName, args = {}) => {
      try {
        const safeName = identifier(functionName.includes(".") ? functionName : `public.${functionName}`);
        const entries = Object.entries(args);
        const sql = `SELECT * FROM ${safeName}(${entries
          .map(([key], index) => `${identifier(key)} => $${index + 1}`)
          .join(", ")})`;
        const result = await getPool().query<PgRow>(sql, entries.map(([, value]) => value));
        return { data: result.rows, error: null, count: result.rowCount, status: 200, statusText: "OK" };
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        return { data: null, error: normalized, count: null, status: 500, statusText: "PostgreSQL error" };
      }
    },
    auth: authAdminSurface(),
    storage: createSeaweedStorage(),
  };
}

export function createAdminClient(): SupabaseClient {
  if (!adminClient) adminClient = createDirectAdminClient();
  return adminClient as unknown as SupabaseClient;
}

export type NeonAdminClient = SupabaseClient;
