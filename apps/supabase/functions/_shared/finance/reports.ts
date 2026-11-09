// Read-only views: transaction listing and period summaries.
import type { GetSummaryInput, ListTransactionsInput } from "../finance_contracts.ts";
import { compact, fail, resolveWorkspace, type Row, type Sql, today } from "./common.ts";

export async function listTransactions(sql: Sql, userId: string, input: ListTransactionsInput) {
  const workspace = await resolveWorkspace(sql, userId, input.workspace_id);
  const limit = input.limit ?? 25;
  let cursor: { date: string; id: string } | null = null;
  if (input.cursor) {
    const [date, id] = input.cursor.split("|");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !/^[0-9a-f-]{36}$/i.test(id ?? "")) {
      throw fail(400, "invalid_cursor", "Use next_cursor exactly as returned.");
    }
    cursor = { date, id };
  }
  const pattern = input.search
    ? `%${input.search.replace(/[\\%_]/g, (match) => `\\${match}`)}%`
    : null;
  const accountFilter = input.account_id
    ? sql`AND (t.account_id = ${input.account_id} OR t.to_account_id = ${input.account_id})`
    : sql``;
  const cursorFilter = cursor
    ? sql`AND (t.occurred_on, t.id) < (${cursor.date}::date, ${cursor.id}::uuid)`
    : sql``;
  const rows = await sql<Row[]>`
    SELECT t.id, t.kind, t.amount::text AS amount, a.currency, t.occurred_on::text AS date,
      a.name AS account, ta.name AS to_account, p.name AS payee, c.name AS category,
      pr.name AS project, t.notes, CASE WHEN t.deleted_at IS NOT NULL THEN true END AS deleted
    FROM finance.transactions t
    JOIN finance.accounts a ON a.id = t.account_id
    LEFT JOIN finance.accounts ta ON ta.id = t.to_account_id
    LEFT JOIN finance.payees p ON p.id = t.payee_id
    LEFT JOIN finance.categories c ON c.id = t.category_id
    LEFT JOIN finance.projects pr ON pr.id = t.project_id
    WHERE t.workspace_id = ${workspace.id}
      ${input.include_deleted ? sql`` : sql`AND t.deleted_at IS NULL`}
      ${input.from ? sql`AND t.occurred_on >= ${input.from}` : sql``}
      ${input.to ? sql`AND t.occurred_on <= ${input.to}` : sql``}
      ${accountFilter}
      ${input.category_id ? sql`AND t.category_id = ${input.category_id}` : sql``}
      ${input.payee_id ? sql`AND t.payee_id = ${input.payee_id}` : sql``}
      ${input.project_id ? sql`AND t.project_id = ${input.project_id}` : sql``}
      ${input.kind ? sql`AND t.kind = ${input.kind}` : sql``}
      ${pattern ? sql`AND (p.name ILIKE ${pattern} OR t.notes ILIKE ${pattern})` : sql``}
      ${cursorFilter}
    ORDER BY t.occurred_on DESC, t.id DESC
    LIMIT ${limit + 1}`;
  const page = rows.slice(0, limit).map(compact);
  const last = page[page.length - 1];
  return {
    workspace: workspace.name,
    transactions: page,
    next_cursor: rows.length > limit && last ? `${last.date}|${last.id}` : null,
  };
}

/** Income, expense and net per currency for a period; transfers are never counted. */
export async function getSummary(sql: Sql, userId: string, input: GetSummaryInput) {
  const workspace = await resolveWorkspace(sql, userId, input.workspace_id);
  const to = input.to ?? await today(sql, workspace.timezone);
  const from = input.from ?? `${to.slice(0, 7)}-01`;
  if (from > to) throw fail(400, "invalid_period", "from must not be after to.");
  const base = sql`
    FROM finance.transactions t
    JOIN finance.accounts a ON a.id = t.account_id
    LEFT JOIN finance.payees p ON p.id = t.payee_id
    LEFT JOIN finance.categories c ON c.id = t.category_id
    LEFT JOIN finance.categories pc ON pc.id = c.parent_id
    LEFT JOIN finance.projects pr ON pr.id = t.project_id
    WHERE t.workspace_id = ${workspace.id} AND t.deleted_at IS NULL AND t.kind <> 'transfer'
      AND t.occurred_on BETWEEN ${from}::date AND ${to}::date`;
  const measures = sql`
    COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'income'), 0)::text AS income,
    COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'expense'), 0)::text AS expense,
    (COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'income'), 0)
      - COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'expense'), 0))::text AS net,
    count(*)::int AS count`;
  const totals = await sql<Row[]>`
    SELECT a.currency, ${measures} ${base} GROUP BY a.currency ORDER BY a.currency`;
  if (!input.group_by) return { workspace: workspace.name, from, to, totals };

  const byCategory = input.group_by === "category";
  const key = {
    category: sql`c.name`,
    payee: sql`p.name`,
    project: sql`pr.name`,
    account: sql`a.name`,
    month: sql`to_char(t.occurred_on, 'YYYY-MM')`,
  }[input.group_by];
  const order = input.group_by === "month"
    ? sql`1`
    : sql`SUM(t.amount) FILTER (WHERE t.kind = 'expense') DESC NULLS LAST`;
  const groups = await sql<Row[]>`
    SELECT ${key} AS key, ${byCategory ? sql`pc.name AS parent,` : sql``} a.currency,
      ${measures}
    ${base}
    GROUP BY 1, ${byCategory ? sql`pc.name,` : sql``} a.currency
    ORDER BY ${order}
    LIMIT 100`;
  return { workspace: workspace.name, from, to, totals, groups: groups.map(compact) };
}
