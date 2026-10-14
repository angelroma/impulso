import { isUuid } from "./auth.ts";
import { CURRENCY_MINOR_UNITS } from "./currency_snapshot.ts";
import { ApiError } from "./http.ts";

export interface FinanceContextInput {
  readonly workspace_id: string;
  readonly book_id?: string;
  readonly cursor?: string;
}

export interface CreateBookInput {
  readonly request_id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly currency: string;
}

export interface CreateAccountInput extends CreateBookInput {
  readonly book_id: string;
  readonly opening_balance: string;
  readonly person_id: string | null;
}

export interface RecordExpenseInput {
  readonly request_id: string;
  readonly workspace_id: string;
  readonly book_id: string;
  readonly source_account_id: string;
  readonly amount: string;
  readonly currency: string;
  readonly occurred_on: string;
  readonly description: string;
  readonly beneficiary_person_id: string | null;
}

export interface FinanceBookSummary {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly minor_unit: number;
  readonly role: "owner" | "editor" | "viewer";
  readonly can_create_account: boolean;
  readonly can_record_expense: boolean;
}

export interface FinanceAccountSummary {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly person_id: string | null;
}

export interface FinanceContextResult {
  readonly workspace_id: string;
  readonly timezone: string;
  readonly current_local_date: string;
  readonly self: { readonly person_id: string; readonly display_name: string } | null;
  readonly books: readonly FinanceBookSummary[];
  readonly accounts: readonly FinanceAccountSummary[];
  readonly selected_book: FinanceBookSummary | null;
  readonly next_cursor: string | null;
  readonly can_create_book: boolean;
}

export interface CreateBookResult {
  readonly status: "created" | "already_processed";
  readonly workspace_id: string;
  readonly book_id: string;
  readonly name: string;
  readonly currency: string;
  readonly minor_unit: number;
}

export interface CreateAccountResult {
  readonly status: "created" | "already_processed";
  readonly workspace_id: string;
  readonly book_id: string;
  readonly account_id: string;
  readonly name: string;
  readonly currency: string;
  readonly opening_balance: string;
  readonly person_id: string | null;
}

export interface RecordExpenseResult {
  readonly status: "created" | "already_processed";
  readonly workspace_id: string;
  readonly book_id: string;
  readonly source_account_id: string;
  readonly transaction_id: string;
  readonly amount: string;
  readonly currency: string;
  readonly occurred_on: string;
  readonly description: string;
  readonly beneficiary_person_id: string | null;
}

function closedObject(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_input", "A Finance input object is required.");
  }
  if (Object.keys(value).some((field) => !fields.includes(field))) {
    throw new ApiError(400, "unknown_field", "The request contains an unsupported field.");
  }
  return value as Record<string, unknown>;
}

function uuid(value: unknown, field: string): string {
  if (!isUuid(value)) {
    throw new ApiError(
      400,
      field === "request_id" ? "invalid_request_id" : "invalid_input",
      `${field} must be a valid UUID.`,
    );
  }
  return value.toLowerCase();
}

function nullableUuid(value: unknown, field: string): string | null {
  return value === null ? null : uuid(value, field);
}

function text(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_input", `${field} must be a nonempty string.`);
  }
  const normalized = value.trim();
  if (
    !normalized || !normalized.isWellFormed() || normalized.includes("\0") ||
    Array.from(normalized).length > maxLength
  ) {
    throw new ApiError(
      400,
      "invalid_input",
      `${field} must contain between 1 and ${maxLength} characters.`,
    );
  }
  return normalized;
}

export function supportedCurrency(code: unknown): number {
  if (
    typeof code !== "string" || !/^[A-Z]{3}$/.test(code) ||
    !Object.hasOwn(CURRENCY_MINOR_UNITS, code)
  ) {
    throw new ApiError(400, "invalid_currency", "A supported uppercase currency code is required.");
  }
  return CURRENCY_MINOR_UNITS[code];
}

function currency(value: unknown): string {
  supportedCurrency(value);
  return value as string;
}

export function normalizeMoney(value: unknown, minorUnit: number, positive: boolean): string {
  if (!Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > 4) {
    throw new ApiError(
      400,
      "invalid_currency",
      "Currency precision must be between zero and four.",
    );
  }
  const match = typeof value === "string" ? /^(-?)(\d+)(?:\.(\d+))?$/.exec(value) : null;
  if (!match || (positive && match[1] === "-")) {
    throw new ApiError(400, "invalid_amount", "A valid plain decimal string is required.");
  }
  const integer = match[2].replace(/^0+(?=\d)/, "");
  const fraction = match[3] ?? "";
  const nonzero = /[1-9]/.test(integer + fraction);
  // Check the raw fraction before padding or stripping zeros; precision must never be rounded away.
  if (integer.length > 16 || fraction.length > minorUnit || (positive && !nonzero)) {
    throw new ApiError(
      400,
      "invalid_amount",
      "The amount exceeds its allowed precision or range, or must be positive.",
    );
  }
  return `${match[1] && nonzero ? "-" : ""}${integer}${
    minorUnit === 0 ? "" : "." + fraction.padEnd(minorUnit, "0")
  }`;
}

function rawMoney(value: unknown, positive: boolean): string {
  normalizeMoney(value, 4, positive);
  // Stored book precision is authoritative and must validate the original spelling before hashing.
  return value as string;
}

export function validateDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, "invalid_date", "A real date in YYYY-MM-DD form is required.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year === 0 || month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) {
    throw new ApiError(400, "invalid_date", "A real date in YYYY-MM-DD form is required.");
  }
  return value;
}

export function workspaceLocalDate(timezone: string, now: Date = new Date()): string {
  if (!Number.isFinite(now.getTime())) {
    throw new ApiError(400, "invalid_date", "A valid date instant is required.");
  }
  let formatter: Intl.DateTimeFormat;
  try {
    if (/^[+-]/.test(timezone)) throw new Error();
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      calendar: "gregory",
      numberingSystem: "latn",
      era: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    throw new ApiError(400, "invalid_timezone", "A valid IANA time zone is required.");
  }
  const parts = formatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value;
  if (part("era") !== "AD") {
    throw new ApiError(400, "invalid_date", "The local date must be in years 0001 through 9999.");
  }
  return validateDate(`${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`);
}

export function validateFinanceContextInput(value: unknown): FinanceContextInput {
  const body = closedObject(value, ["workspace_id", "book_id", "cursor"]);
  const result: FinanceContextInput = {
    workspace_id: uuid(body.workspace_id, "workspace_id"),
    ...(Object.hasOwn(body, "book_id") ? { book_id: uuid(body.book_id, "book_id") } : {}),
  };
  if (!Object.hasOwn(body, "cursor")) return result;
  if (
    typeof body.cursor !== "string" || body.cursor.length < 1 || body.cursor.length > 1024 ||
    body.cursor.includes("\0") || !body.cursor.isWellFormed()
  ) {
    throw new ApiError(400, "invalid_cursor", "A valid bounded continuation cursor is required.");
  }
  return { ...result, cursor: body.cursor };
}

export function validateCreateBookInput(value: unknown): CreateBookInput {
  const body = closedObject(value, ["request_id", "workspace_id", "name", "currency"]);
  return {
    request_id: uuid(body.request_id, "request_id"),
    workspace_id: uuid(body.workspace_id, "workspace_id"),
    name: text(body.name, "name", 200),
    currency: currency(body.currency),
  };
}

export function validateCreateAccountInput(value: unknown): CreateAccountInput {
  const body = closedObject(value, [
    "request_id",
    "workspace_id",
    "book_id",
    "name",
    "currency",
    "opening_balance",
    "person_id",
  ]);
  return {
    request_id: uuid(body.request_id, "request_id"),
    workspace_id: uuid(body.workspace_id, "workspace_id"),
    book_id: uuid(body.book_id, "book_id"),
    name: text(body.name, "name", 200),
    currency: currency(body.currency),
    opening_balance: rawMoney(body.opening_balance, false),
    person_id: nullableUuid(body.person_id, "person_id"),
  };
}

export function validateRecordExpenseInput(value: unknown): RecordExpenseInput {
  const body = closedObject(value, [
    "request_id",
    "workspace_id",
    "book_id",
    "source_account_id",
    "amount",
    "currency",
    "occurred_on",
    "description",
    "beneficiary_person_id",
  ]);
  return {
    request_id: uuid(body.request_id, "request_id"),
    workspace_id: uuid(body.workspace_id, "workspace_id"),
    book_id: uuid(body.book_id, "book_id"),
    source_account_id: uuid(body.source_account_id, "source_account_id"),
    amount: rawMoney(body.amount, true),
    currency: currency(body.currency),
    occurred_on: validateDate(body.occurred_on),
    description: text(body.description, "description", 2000),
    beneficiary_person_id: nullableUuid(body.beneficiary_person_id, "beneficiary_person_id"),
  };
}
