// Read-only views: transaction listing and period summaries.
import type { GetSummaryInput, ListTransactionsInput } from "../finance_contracts.ts";
import {
  compact,
  fail,
  findAccount,
  resolveWorkspace,
  type Row,
  type Sql,
  today,
  withNotices,
  type Workspace,
} from "./common.ts";

const MAX_GROUPS = 100;
const MAX_STATEMENT_ROWS = 300;

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
      ${
    pattern
      ? sql`AND (p.name ILIKE ${pattern} OR t.notes ILIKE ${pattern} OR c.name ILIKE ${pattern}
          OR a.name ILIKE ${pattern} OR ta.name ILIKE ${pattern})`
      : sql``
  }
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
  if (input.statement) {
    if (input.group_by) {
      throw fail(400, "invalid_input", "A statement cannot be grouped; omit group_by.");
    }
    return await statement(sql, workspace, from, to, input.account_id);
  }
  if (input.account_id) {
    throw fail(400, "invalid_input", "account_id applies only with statement: true.");
  }
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
    top_category: sql`COALESCE(pc.name, c.name)`,
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
    LIMIT ${MAX_GROUPS + 1}`;
  return withNotices(
    {
      workspace: workspace.name,
      from,
      to,
      totals,
      groups: groups.slice(0, MAX_GROUPS).map(compact),
    },
    groups.length > MAX_GROUPS
      ? [`Only the first ${MAX_GROUPS} groups are shown; narrow the period.`]
      : [],
  );
}

/**
 * The period report: per currency, the balance carried over from before `from`, every transaction
 * of the period oldest first with a running balance, and the closing balance. It covers one
 * account or all active accounts together, so a report that reaches the last transaction closes
 * on the balances get_context shows. Everything is computed on read with exact decimals.
 */
async function statement(
  sql: Sql,
  workspace: Workspace,
  from: string,
  to: string,
  accountId: string | undefined,
) {
  const account = accountId ? await findAccount(sql, workspace.id, accountId) : null;
  const covered = sql`
    SELECT id, currency, opening_balance FROM finance.accounts
    WHERE workspace_id = ${workspace.id}
      ${account ? sql`AND id = ${account.id}` : sql`AND archived_at IS NULL`}`;
  // `change` is what a transaction does to the covered accounts: a transfer between two of them
  // changes nothing, and one that crosses the edge counts only on the covered side.
  const moves = sql`
    SELECT t.id, t.occurred_on, t.created_at, t.kind, t.amount, t.notes, t.payee_id,
      t.category_id, t.account_id, t.to_account_id, COALESCE(src.currency, dst.currency) AS currency,
      (CASE WHEN src.id IS NULL THEN 0 WHEN t.kind = 'income' THEN t.amount ELSE -t.amount END
        + CASE WHEN dst.id IS NULL THEN 0 ELSE t.amount END) AS change
    FROM finance.transactions t
    LEFT JOIN covered src ON src.id = t.account_id
    LEFT JOIN covered dst ON dst.id = t.to_account_id
    WHERE t.workspace_id = ${workspace.id} AND t.deleted_at IS NULL
      AND t.occurred_on <= ${to}::date AND (src.id IS NOT NULL OR dst.id IS NOT NULL)`;
  const opening = sql`
    SELECT currency, SUM(opening_balance) AS opening FROM covered GROUP BY currency`;
  const inPeriod = sql`m.occurred_on >= ${from}::date`;
  const totals = await sql<Row[]>`
    WITH covered AS (${covered}), moves AS (${moves}), opening AS (${opening})
    SELECT o.currency,
      (o.opening + COALESCE(SUM(m.change) FILTER (WHERE NOT ${inPeriod}), 0.00))::text
        AS opening_balance,
      COALESCE(SUM(m.amount) FILTER (WHERE ${inPeriod} AND m.kind = 'income'), 0.00)::text
        AS income,
      COALESCE(SUM(m.amount) FILTER (WHERE ${inPeriod} AND m.kind = 'expense'), 0.00)::text
        AS expense,
      COALESCE(SUM(m.change) FILTER (WHERE ${inPeriod} AND m.kind = 'transfer'), 0.00)::text
        AS transfers,
      (o.opening + COALESCE(SUM(m.change), 0.00))::text AS closing_balance,
      (count(m.id) FILTER (WHERE ${inPeriod}))::int AS count
    FROM opening o LEFT JOIN moves m ON m.currency = o.currency
    GROUP BY o.currency, o.opening ORDER BY o.currency`;
  // The running balance adds up from the very first transaction, then only the period is kept.
  const rows = await sql<Row[]>`
    WITH covered AS (${covered}), moves AS (${moves}), opening AS (${opening}),
    running AS (
      SELECT m.*, o.opening + SUM(m.change) OVER (
        PARTITION BY m.currency ORDER BY m.occurred_on, m.created_at, m.id) AS balance
      FROM moves m JOIN opening o ON o.currency = m.currency
    )
    SELECT m.currency, m.occurred_on::text AS date, m.kind, p.name AS payee, c.name AS category,
      a.name AS account, ta.name AS to_account, m.notes, m.amount::text AS amount,
      m.change::text AS change, m.balance::text AS balance
    FROM running m
    JOIN finance.accounts a ON a.id = m.account_id
    LEFT JOIN finance.accounts ta ON ta.id = m.to_account_id
    LEFT JOIN finance.payees p ON p.id = m.payee_id
    LEFT JOIN finance.categories c ON c.id = m.category_id
    WHERE ${inPeriod}
    ORDER BY m.occurred_on, m.created_at, m.id
    LIMIT ${MAX_STATEMENT_ROWS + 1}`;
  const [{ opening_date }] = await sql<{ opening_date: string }[]>`
    SELECT (${from}::date - 1)::text AS opening_date`;
  const shown = rows.slice(0, MAX_STATEMENT_ROWS);
  return withNotices(
    {
      workspace: workspace.name,
      ...(account ? { account: account.name } : {}),
      from,
      to,
      opening_date,
      statements: totals.map((total) => ({
        ...total,
        rows: shown.filter((row) => row.currency === total.currency)
          .map(({ currency: _currency, ...row }) => compact(row)),
      })),
    },
    rows.length > MAX_STATEMENT_ROWS
      ? [
        `Only the first ${MAX_STATEMENT_ROWS} transactions are listed; the balances cover the ` +
        "whole period. Ask for a shorter period to list the rest.",
      ]
      : [],
  );
}
