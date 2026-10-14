import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { LEDGER_TOOL_SCHEMAS } from "../_shared/ledger_contracts.ts";
import { DOMAIN_TOOL_SCHEMAS } from "../_shared/planning_contracts.ts";
import { IMPORT_TOOL_SCHEMAS } from "../_shared/import_contracts.ts";
import { reportInputSchema, reportOutputSchema } from "../_shared/report_contracts.ts";
import type { VerifiedIdentity } from "../_shared/auth.ts";
import { ApiError, errorResponse, jsonResponse } from "../_shared/http.ts";
import {
  type OnboardingInput,
  type OnboardingResult,
  validateOnboardingInput,
} from "../_shared/onboarding.ts";
import {
  type CreateAccountInput,
  type CreateAccountResult,
  type CreateBookInput,
  type CreateBookResult,
  type FinanceContextInput,
  type FinanceContextResult,
  type RecordExpenseInput,
  type RecordExpenseResult,
  validateCreateAccountInput,
  validateCreateBookInput,
  validateFinanceContextInput,
  validateRecordExpenseInput,
} from "../_shared/finance_contracts.ts";

export interface McpConfiguration {
  readonly resourceUrl: string;
  readonly authorizationServer: string;
}

export interface OnboardingStatus {
  readonly status: "required" | "complete" | "unavailable";
  readonly workspace_id?: string;
  readonly person_id?: string;
}

export interface McpDependencies {
  readonly runExtendedFinance?: (
    identity: VerifiedIdentity,
    name: ExtendedFinanceToolName,
    input: unknown,
  ) => Promise<unknown>;
  readonly onboard?: (
    identity: VerifiedIdentity,
    input: OnboardingInput,
  ) => Promise<OnboardingResult>;
  readonly onboardingStatus?: (identity: VerifiedIdentity) => Promise<OnboardingStatus>;
  readonly getFinanceContext?: (
    identity: VerifiedIdentity,
    input: FinanceContextInput,
  ) => Promise<FinanceContextResult>;
  readonly createBook?: (
    identity: VerifiedIdentity,
    input: CreateBookInput,
  ) => Promise<CreateBookResult>;
  readonly createAccount?: (
    identity: VerifiedIdentity,
    input: CreateAccountInput,
  ) => Promise<CreateAccountResult>;
  readonly recordExpense?: (
    identity: VerifiedIdentity,
    input: RecordExpenseInput,
  ) => Promise<RecordExpenseResult>;
}

export const EXTENDED_FINANCE_SCHEMAS = {
  ...LEDGER_TOOL_SCHEMAS,
  ...DOMAIN_TOOL_SCHEMAS,
  get_finance_report: { input: reportInputSchema, output: reportOutputSchema },
  ...IMPORT_TOOL_SCHEMAS,
} as const;
export type ExtendedFinanceToolName = keyof typeof EXTENDED_FINANCE_SCHEMAS;

const financeDescriptions: Record<ExtendedFinanceToolName, string> = {
  configure_account:
    "Review and configure an account's kind and opening tracking date with its current version. Unknown dates stay unknown; existing entries cannot precede the accepted opening date.",
  manage_category:
    "Create, rename, archive or list a book's income and expense categories, or classify a versioned transaction. Categories are labels, not accounts or ledger entries.",
  record_transaction:
    "Record a complete income, expense or transfer, or an atomic group of 2–10 reviewed components. Transfers move signed account positions without income or expense. Separate debt principal from interest and fees; do not invent an unresolved split. Reuse the action UUID and exact payload after uncertain results.",
  correct_transaction:
    "Void or replace a versioned ledger entry for an accepted reason. Posted facts are immutable. Explicitly reconcile every dependent settlement allocation; a retry uses the original UUID. Never treat a correction as a new unrelated expense.",
  list_transactions:
    "Read a bounded, authorized ledger interval with optional account, category, kind and state filters. Follow next_cursor with unchanged filters. This read creates nothing and shows correction history separately from effective entries.",
  manage_budget:
    "Create, revise, archive, get or list versioned book or category spending limits for explicit dates. Budgets are limits, never expected payments, account balances or ledger movements.",
  manage_plan:
    "Create, revise, cancel, get or list expected commitments and monthly or annual rules; materialize a bounded accepted horizon, or link/revoke actual settlement amounts. Review day-31 short-month behavior. Partial payments reduce remaining amounts; overdue is independent. Canceling preserves history. An unresolved debt installment may retain only its quoted total until principal, interest and fees are known.",
  manage_debt:
    "Create, revise, archive, get or list a loan or credit-card account's known terms. Keep unknown terms null. Loan proceeds and principal repayments are transfers; interest and fees are expenses. Card purchases count once as expenses, and card payments are transfers. This tool never initiates a bank payment.",
  manage_goal:
    "Create, revise, cancel, get or list savings goals, or set/release versioned earmarks of existing funds. Earmarks are not expenses, transfers or additional wealth. Cash/bank accounts use ledger backing; investments use the explicitly accepted ledger or fresh valuation basis. Never silently switch the accepted basis; report later underfunding honestly.",
  manage_asset:
    "Create, revise, archive, get or list manual assets and append or revise dated sourced valuations. Preserve identity and ownership text. Unknown or stale values remain visible as incomplete; do not duplicate an account as an asset or fabricate market prices.",
  get_finance_report:
    "Read bounded balances, cash flow, plan versus actual, upcoming commitments, goals or net worth. Use exact decimal strings. Report complete and issues with the result: unknown baselines, missing valuations and summary-only months are not zeros. Forecasts use actual balances and remaining expected amounts, never budget limits or already paid amounts. Summary coverage must be reviewed; never add overlapping summaries and detail.",
  preview_finance_import:
    "Freeze a reviewed, bounded source manifest (at most 100 rows and 32 KiB), parse its explicit numeric locale and save preview metadata only. Preserve source text, cell, sheet, formula and date precision. Explicitly map currency, role, category, account and targets; do not invent a daily transaction from monthly totals. Backups, hidden and derived sheets are excluded or reference-only unless deliberately reviewed. Display blockers and reconciliation; the known annual/monthly discrepancy is not verified savings. Preview never posts financial facts.",
  commit_finance_import:
    "Commit only the exact accepted ready batch using its version and review digest after presenting roles, targets, exclusions, coverage, dates and reconciliation. Revalidate all current access and targets. Reuse UUID and payload on retry; never bypass duplicate provenance with a new UUID. Changed consumed source cells require explicit reviewed replacement and allocation reconciliation. Each bounded batch commits atomically; never claim the entire workbook is imported.",
  get_finance_import:
    "Read an authorized bounded import batch, blockers, immutable source evidence, result references and current coverage count/digest. Follow next_cursor. This read posts nothing and never implies whole-workbook completion.",
};

function mcpObjectSchema(schema: z.ZodType) {
  // SDK 1.32 discovery drops root unions and cannot serialize output transforms.
  // Publish the exact wire branches; the callback validates both boundaries with the original schema.
  const json = z.toJSONSchema(schema, { io: "input", target: "draft-7" });
  const branches = (json.anyOf ?? json.oneOf ?? []) as { properties?: Record<string, unknown> }[];
  return z.looseObject({}).meta({
    ...json,
    type: "object",
    properties: json.properties ??
      Object.fromEntries(
        branches.flatMap((branch) => Object.keys(branch.properties ?? {}).map((key) => [key, {}])),
      ),
    additionalProperties: false,
  });
}

export function protectedResourceMetadata(configuration: McpConfiguration): Response {
  return jsonResponse({
    resource: configuration.resourceUrl,
    resource_name: "Impulso",
    authorization_servers: [configuration.authorizationServer],
    bearer_methods_supported: ["header"],
    // Supabase OIDC scopes describe identity data, not application permissions.
    scopes_supported: ["openid", "email", "profile", "offline_access"],
  });
}

export function mcpChallenge(configuration: McpConfiguration, insufficientScope = false): string {
  const metadata = configuration.resourceUrl.replace(
    /\/mcp$/,
    "/.well-known/oauth-protected-resource",
  );
  return `Bearer resource_metadata="${metadata}", scope="openid"` +
    (insufficientScope ? ', error="insufficient_scope"' : "");
}

export function requireMcpIdentity(identity: VerifiedIdentity): void {
  if (!identity.oauth_client_id) {
    throw new ApiError(401, "oauth_required", "Connect this client using Impulso OAuth.");
  }
  if (!identity.oauth_scopes?.includes("openid")) {
    throw new ApiError(403, "insufficient_scope", "The openid identity scope is required.");
  }
  if (!identity.google_authenticated) {
    throw new ApiError(
      403,
      "google_sign_in_required",
      "A verified Google-linked account is required.",
    );
  }
}

async function toolResult(operation: () => Promise<Record<string, unknown>>) {
  try {
    const result = await operation();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      structuredContent: result,
    };
  } catch (error) {
    const response = errorResponse(error);
    const result = await response.json();
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }], isError: true };
  }
}

export async function handleMcpRequest(
  request: Request,
  identity: VerifiedIdentity,
  dependencies: McpDependencies,
): Promise<Response> {
  requireMcpIdentity(identity);
  // Each request has its own server and verified identity. No cross-client memory or transport state.
  const server = new McpServer({ name: "Impulso", version: "0.1.0" }, {
    instructions: [
      "Use get_session before the first Impulso action. Guide setup only when onboarding.status is " +
      "required. If complete, skip initial setup; if unavailable, explain that setup is unavailable " +
      "and do not call onboard. Retain the user's original request without claiming it is complete.",
      "A workspace organizes the user's data. If its name is missing, offer exactly these three " +
      "numbered suggestions: 1. Orbit (recommended), 2. Momentum, 3. Launchpad. Also allow a custom " +
      "name. Accept a name, its displayed number, or the recommended choice without requiring the " +
      "user to invent or retype a name. Selecting a name alone does not authorize creation. Ask " +
      "for a display name only when missing. Preserve user-provided names and their language; " +
      "never infer a display name from email or assume profile details that were not supplied.",
      "Suggest a time zone using the user's explicit preference or an unambiguous stated city and " +
      "country first, otherwise a valid time-zone hint actually available in the current client " +
      "context. A hint is a suggestion, not proof of residence. The backend does not know the user's " +
      "location. Never infer it from email, language, IP address, the execution host, or server region, " +
      "and never silently default to UTC or assume another client's context is available.",
      "Describe the proposed time zone with a familiar city or regional label, such as Mexico City " +
      "time, and offer to continue or change it. Accept a different city or region in everyday " +
      "language; do not require the user to type an IANA identifier. If context is missing, ask for " +
      "a city and any necessary country or region. Clarify ambiguous cities, multi-zone countries, " +
      "fixed offsets, or uncertain mappings, using a nearby major city if helpful. Resolve the " +
      "location to a named IANA zone internally only when confident; a correction overrides a hint.",
      "Once all values are resolved, show one concise review containing the display name, workspace " +
      "name, and city-based time zone, and ask the user to confirm whether to continue or change " +
      "anything. For example, after the name Alex is supplied and Mexico City time is available: " +
      "'I'll set up your profile as Alex, name your workspace Orbit, and use Mexico City time. " +
      "Would you like to continue or change anything? You can name another city if needed.' " +
      "These example values are not global defaults. Call onboard only after acceptance of the " +
      "complete review. Show a revised review after a correction. Cancellation performs no write. " +
      "Do not ask users to repeat accepted values or confirm each field separately.",
      "After acceptance, call onboard with only the confirmed display_name, workspace_name, canonical " +
      "IANA timezone, and a new UUID request_id. Preserve that UUID and the unchanged payload for an " +
      "identical retry. Check get_session after an uncertain result before submitting changed values; " +
      "a changed submission needs a fresh UUID and must not silently change an existing workspace.",
      "Never send tokens, passwords, SQL, actor IDs, raw client/location context, or health records " +
      "as tool input. Contextual suggestions never establish identity or permissions. Finance " +
      "supports the advertised closed tools for ledger, planning, debts, goals, assets, reports " +
      "and reviewed imports. Other managed people, sharing, files, Health and purge execution " +
      "remain unavailable. Never approximate an unsupported operation as an expense.",
      "For a purchase, retain the original request after onboarding and call get_finance_context " +
      "with the selected workspace_id. Without book_id it lists accessible active books; with " +
      "book_id it lists that book's active accounts. Follow next_cursor before assuming a page " +
      "contains every choice. Reuse already accepted authorized books, accounts and attribution. " +
      "Ask only missing or ambiguous details, including amount and unresolved currency/account. " +
      "Never infer MXN from Spanish, location, time zone, or the word pesos alone. Use the selected " +
      "book's currency or clarify the country-specific currency. Supply money as exact decimal " +
      "strings, never JSON numbers; do not round or convert currencies.",
      "When financial setup is needed, offer Everyday as the book name, Main account as the " +
      "account name, and 0 as a starting tracking balance. These are suggestions, not automatic " +
      "defaults or a bank balance. Review the names, explicit currency, opening balance, and " +
      "self or shared/unassigned attribution together before create_book or create_account. " +
      "Preserve user-provided names and descriptions. Null person IDs require an accepted shared " +
      "or unassigned choice; nonnull attribution can only use the verified self returned by " +
      "context. Never create or guess another person. A complete review can authorize setup and " +
      "the resolved expense together. Complete explicit expense instructions need no redundant " +
      "confirmation; proposed defaults or ambiguous values need acceptance first.",
      "Resolve occurred_on to a concrete YYYY-MM-DD before submitting: prefer reliable message " +
      "time in the stored workspace zone; otherwise propose current_local_date from context, " +
      "explain that fallback, and obtain acceptance. Clarify ambiguous dates, freeze the accepted " +
      "date across midnight and retries, and do not change the workspace time zone from client " +
      "location. Cancellation before submission performs no write; corrections update the review.",
      "Use a different UUID request_id for each accepted book, account and expense action. " +
      "Retain each UUID and unchanged payload for an identical or uncertain retry; never blindly " +
      "use a fresh key or treat an expense retry as a correction. Distinct keys are separate " +
      "actions, even if names and amounts match. Each call commits separately: report exactly " +
      "which setup steps succeeded if a later call fails or is canceled. Only a committed expense " +
      "or authorized already_processed result means the expense was recorded. Summarize its " +
      "canonical amount, currency, date and account, and never claim a bank payment occurred.",
      "For every new Finance mutation, resolve its full typed intent, exact amount, explicit book " +
      "currency, dates, authorized targets and current versions first. Do not ask again about " +
      "complete explicit instructions. Review suggestions and unresolved assumptions; cancellation " +
      "writes nothing. Preserve the same request_id and payload after an uncertain result. A changed " +
      "intent needs a fresh UUID; version conflicts require rereading and a revised accepted review. " +
      "Use get/list branches for current planning resources. Never use a family tool as generic CRUD.",
      "Keep budgets, commitments, actual ledger entries, debts, earmarked funds, valuations and " +
      "monthly source summaries distinct. Unknown opening dates are not the beginning of history. " +
      "Transfers and loan principal do not create income or expense. Split accepted debt payments " +
      "into principal transfer and interest/fee expenses atomically. Report a credit-card purchase " +
      "once; the later card payment is a transfer. Dates are concrete in the stored workspace zone. " +
      "For reports disclose completeness, basis, coverage and issues rather than inventing zeros.",
      "Imports require a bounded frozen manifest followed by preview, user review and a separate " +
      "accepted commit. Preserve user source labels and formulas, distinguish planned from actual " +
      "and day precision from month precision, exclude duplicate source sheets and totals, and " +
      "resolve blockers before commit. Never count summary coverage together with its detail, " +
      "manufacture first-of-month movements, infer currency from pesos, or claim an arithmetic " +
      "discrepancy is savings. A batch result covers only its selected rows, never the whole workbook.",
    ].join("\n\n"),
  });
  server.registerTool("get_session", {
    title: "Get Impulso session",
    description:
      "Read the connected user's identity and initial setup status before the first Impulso action. " +
      "If required, preserve supplied names and their language. Ask for a display name only when " +
      "missing; never derive it from email. If the workspace name is missing, offer Orbit " +
      "(recommended), Momentum, Launchpad, or a custom name. Suggest a city-based time zone from " +
      "available user/client context, clarify " +
      "missing or ambiguous locations, and review all values before creation. If complete, skip " +
      "initial setup; if unavailable, explain it without creating resources. This response contains " +
      "no display name, time-zone hint, or location; use only context actually available to the client.",
    inputSchema: z.object({}).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, () =>
    toolResult(async () => ({
      user: {
        id: identity.user_id,
        ...(identity.oauth_scopes?.includes("email") ? { email: identity.email } : {}),
      },
      onboarding: dependencies.onboardingStatus
        ? await dependencies.onboardingStatus(identity)
        : { status: "unavailable" },
    })));
  server.registerTool("onboard", {
    title: "Set up Impulso account",
    description:
      "Create the connected user's personal workspace and self profile only after they accept a " +
      "complete review of display name, workspace name, and city-based time zone. Offer Orbit " +
      "(recommended), Momentum, Launchpad, or a custom name only when the workspace name is missing. " +
      "Preserve supplied names and their language; ask for a display name only when missing and " +
      "never derive it from email. Prefer explicit user " +
      "location/preferences over a real client time-zone hint; ask for a city/country when missing " +
      "or ambiguous. Resolve city corrections internally to a canonical IANA zone without requiring " +
      "the user to type it. Corrections need a revised review; cancellation performs no write. " +
      "Retry with the same request_id and unchanged values to avoid duplicates. Check get_session " +
      "after uncertain results before a changed submission, which needs a fresh request_id.",
    inputSchema: z.object({
      request_id: z.string().uuid().describe(
        "A UUID for this confirmed action; reuse it on retries.",
      ),
      display_name: z.string().min(1).max(400).describe("The display name confirmed by the user."),
      workspace_name: z.string().min(1).max(400).describe(
        "The workspace name confirmed by the user.",
      ),
      timezone: z.string().min(1).max(200).describe(
        "The canonical IANA time zone resolved from the city or region accepted in the complete " +
          "setup review. Resolve it for the user; do not submit a city label or fixed offset.",
      ),
    }).strict(),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, (input: Record<string, unknown>) =>
    toolResult(async () => {
      const validated = validateOnboardingInput(input);
      if (!dependencies.onboard) {
        throw new ApiError(503, "service_unavailable", "The service is not configured.");
      }
      return { ...await dependencies.onboard(identity, validated) };
    }));

  const uuid = z.string().uuid();
  const currency = z.string().regex(/^[A-Z]{3}$/);
  const money = z.string().min(1).max(128).describe(
    "An exact decimal string in the book currency; never a JSON number.",
  );
  const status = z.enum(["created", "already_processed"]);
  const bookSummary = z.object({
    id: uuid,
    name: z.string(),
    currency,
    minor_unit: z.number().int().min(0).max(4),
    role: z.enum(["owner", "editor", "viewer"]),
    can_create_account: z.boolean(),
    can_record_expense: z.boolean(),
  }).strict();
  const accountSummary = z.object({
    id: uuid,
    name: z.string(),
    currency,
    person_id: uuid.nullable(),
  }).strict();
  const mutationAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  server.registerTool("get_finance_context", {
    title: "Get financial choices",
    description:
      "Read authorized active books, or accounts for a selected book, before resolving an expense. " +
      "Returns workspace time and verified self choice, never balances or ledger history. Follow next_cursor; " +
      "an empty page means no accessible active choices. This call creates nothing.",
    inputSchema: z.object({
      workspace_id: uuid,
      book_id: uuid.optional(),
      cursor: z.string().max(1024).optional(),
    }).strict(),
    outputSchema: z.object({
      workspace_id: uuid,
      timezone: z.string(),
      current_local_date: z.string(),
      self: z.object({ person_id: uuid, display_name: z.string() }).strict().nullable(),
      books: z.array(bookSummary).max(50),
      accounts: z.array(accountSummary).max(50),
      selected_book: bookSummary.nullable(),
      next_cursor: z.string().nullable(),
      can_create_book: z.boolean(),
    }).strict(),
    annotations: { ...mutationAnnotations, readOnlyHint: true },
  }, (input: Record<string, unknown>) =>
    toolResult(async () => {
      const validated = validateFinanceContextInput(input);
      if (!dependencies.getFinanceContext) {
        throw new ApiError(503, "service_unavailable", "The service is not configured.");
      }
      return { ...await dependencies.getFinanceContext(identity, validated) };
    }));
  server.registerTool("create_book", {
    title: "Create a financial book",
    description:
      "Create a book and its owner grant only after accepting its name and explicit currency. " +
      "Everyday is an optional suggestion, not a default. Reuse the same request_id and payload after uncertain results.",
    inputSchema: z.object({
      request_id: uuid,
      workspace_id: uuid,
      name: z.string().min(1).max(400),
      currency,
    }).strict(),
    outputSchema: z.object({
      status,
      workspace_id: uuid,
      book_id: uuid,
      name: z.string(),
      currency,
      minor_unit: z.number().int().min(0).max(4),
    }).strict(),
    annotations: mutationAnnotations,
  }, (input: Record<string, unknown>) =>
    toolResult(async () => {
      const validated = validateCreateBookInput(input);
      if (!dependencies.createBook) {
        throw new ApiError(503, "service_unavailable", "The service is not configured.");
      }
      return { ...await dependencies.createBook(identity, validated) };
    }));
  server.registerTool("create_account", {
    title: "Create a financial account",
    description:
      "Create an account in an authorized book after accepting its name, book currency, exact opening balance, " +
      "and verified self or shared/unassigned attribution. Main account and 0 are suggestions only. Retry the same request_id and payload.",
    inputSchema: z.object({
      request_id: uuid,
      workspace_id: uuid,
      book_id: uuid,
      name: z.string().min(1).max(400),
      currency,
      opening_balance: money,
      person_id: uuid.nullable(),
    }).strict(),
    outputSchema: z.object({
      status,
      workspace_id: uuid,
      book_id: uuid,
      account_id: uuid,
      name: z.string(),
      currency,
      opening_balance: z.string(),
      person_id: uuid.nullable(),
    }).strict(),
    annotations: mutationAnnotations,
  }, (input: Record<string, unknown>) =>
    toolResult(async () => {
      const validated = validateCreateAccountInput(input);
      if (!dependencies.createAccount) {
        throw new ApiError(503, "service_unavailable", "The service is not configured.");
      }
      return { ...await dependencies.createAccount(identity, validated) };
    }));
  server.registerTool("record_expense", {
    title: "Record an expense",
    description:
      "Record a resolved expense using an authorized source account, positive decimal-string amount, matching " +
      "currency, concrete YYYY-MM-DD, description, and verified self or accepted shared/unassigned beneficiary. Ask only missing " +
      "or ambiguous details; complete explicit instructions need no redundant confirmation. Preserve the same UUID, date and " +
      "payload on uncertain retries. This records a ledger entry, not a bank payment. Use correct_transaction for corrections; other people are unsupported.",
    inputSchema: z.object({
      request_id: uuid,
      workspace_id: uuid,
      book_id: uuid,
      source_account_id: uuid,
      amount: money,
      currency,
      occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      description: z.string().min(1).max(4000),
      beneficiary_person_id: uuid.nullable(),
    }).strict(),
    outputSchema: z.object({
      status,
      workspace_id: uuid,
      book_id: uuid,
      source_account_id: uuid,
      transaction_id: uuid,
      amount: z.string(),
      currency,
      occurred_on: z.string(),
      description: z.string(),
      beneficiary_person_id: uuid.nullable(),
    }).strict(),
    annotations: mutationAnnotations,
  }, (input: Record<string, unknown>) =>
    toolResult(async () => {
      const validated = validateRecordExpenseInput(input);
      if (!dependencies.recordExpense) {
        throw new ApiError(503, "service_unavailable", "The service is not configured.");
      }
      return { ...await dependencies.recordExpense(identity, validated) };
    }));

  for (const name of Object.keys(EXTENDED_FINANCE_SCHEMAS) as ExtendedFinanceToolName[]) {
    const schemas = EXTENDED_FINANCE_SCHEMAS[name];
    const readOnly = ["list_transactions", "get_finance_report", "get_finance_import"].includes(
      name,
    );
    server.registerTool(name, {
      title: name.replaceAll("_", " "),
      description: financeDescriptions[name],
      inputSchema: mcpObjectSchema(schemas.input),
      outputSchema: mcpObjectSchema(schemas.output),
      annotations: {
        readOnlyHint: readOnly,
        destructiveHint: !readOnly && name !== "record_transaction" &&
          name !== "preview_finance_import",
        idempotentHint: true,
        openWorldHint: false,
      },
    }, (input: unknown) =>
      toolResult(async () => {
        const parsed = schemas.input.safeParse(input);
        if (!parsed.success) {
          throw new ApiError(
            400,
            "invalid_input",
            "A supported closed Finance action is required.",
          );
        }
        if (!dependencies.runExtendedFinance) {
          throw new ApiError(503, "service_unavailable", "The service is not configured.");
        }
        const result = schemas.output.safeParse(
          await dependencies.runExtendedFinance(identity, name, parsed.data),
        );
        if (!result.success) {
          throw new ApiError(
            500,
            "invalid_service_response",
            "The Finance response could not be verified.",
          );
        }
        return result.data;
      }));
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 32_768,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
