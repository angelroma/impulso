import assert from "node:assert/strict";
import { CURRENCY_MINOR_UNITS, CURRENCY_SNAPSHOT } from "./currency_snapshot.ts";
import {
  normalizeMoney,
  supportedCurrency,
  validateCreateAccountInput,
  validateCreateBookInput,
  validateDate,
  validateFinanceContextInput,
  validateRecordExpenseInput,
  workspaceLocalDate,
} from "./finance_contracts.ts";
import { ApiError } from "./http.ts";

const requestId = "C3069373-D597-4289-AAC6-89F092B93830";
const workspaceId = "5BC98F78-B1B2-4E97-AE3B-BB2AA3C2B26C";
const bookId = "42F7ECDB-96C8-4C55-923B-715226DB647E";
const accountId = "BD6EE804-0365-496E-BD40-2834B7040E87";
const personId = "7A226DBF-B462-40FE-82E3-86F7DD43710C";
const book = {
  request_id: requestId,
  workspace_id: workspaceId,
  name: "Everyday",
  currency: "MXN",
};
const account = {
  ...book,
  book_id: bookId,
  name: "Main account",
  opening_balance: "-0010.20",
  person_id: personId,
};
const expense = {
  request_id: requestId,
  workspace_id: workspaceId,
  book_id: bookId,
  source_account_id: accountId,
  amount: "00100.0",
  currency: "MXN",
  occurred_on: "2026-10-13",
  description: "  Hamburguesa de Ángel  ",
  beneficiary_person_id: personId,
};

function expectedError(code: string) {
  return (error: unknown) =>
    error instanceof ApiError && error.status === 400 && error.code === code;
}

Deno.test("currency snapshot is versioned, deduplicated and limited to current numeric units", () => {
  const codes = Object.keys(CURRENCY_MINOR_UNITS);
  assert.equal(CURRENCY_SNAPSHOT.publication_date, "2026-09-17");
  assert.match(CURRENCY_SNAPSHOT.source, /^https:\/\/www\.six-group\.com\//);
  assert.match(CURRENCY_SNAPSHOT.source_sha256, /^[0-9a-f]{64}$/);
  assert.equal(codes.length, 165);
  assert.deepEqual(codes, [...new Set(codes)].sort());
  for (const code of codes) {
    assert.match(code, /^[A-Z]{3}$/);
    assert.ok(Number.isInteger(CURRENCY_MINOR_UNITS[code]));
    assert.ok(CURRENCY_MINOR_UNITS[code] >= 0 && CURRENCY_MINOR_UNITS[code] <= 4);
  }
  assert.equal(supportedCurrency("JPY"), 0);
  assert.equal(supportedCurrency("MXN"), 2);
  assert.equal(supportedCurrency("BHD"), 3);
  assert.equal(supportedCurrency("CLF"), 4);
  assert.equal(supportedCurrency("UYW"), 4);
  assert.ok(Object.isFrozen(CURRENCY_MINOR_UNITS));
});

Deno.test("currencies reject unknown, withdrawn, N.A., lowercase and coercible input", () => {
  for (
    const code of [
      "ZZZ",
      "MXP",
      "HRK",
      "XAU",
      "XAG",
      "XTS",
      "XXX",
      "mxn",
      " M X",
      " MXN",
      "MXN ",
      "N.A.",
      "constructor",
      "__proto__",
      "",
      null,
      undefined,
      2,
      {},
    ]
  ) {
    assert.throws(() => supportedCurrency(code), expectedError("invalid_currency"));
  }
});

Deno.test("exact money canonicalizes without floating point or rounding", () => {
  const cases: [string, number, boolean, string][] = [
    ["000100", 0, true, "100"],
    ["00100.0", 2, true, "100.00"],
    ["100", 3, true, "100.000"],
    ["0.0001", 4, true, "0.0001"],
    ["-0001.2", 2, false, "-1.20"],
    ["-0.00", 2, false, "0.00"],
    ["-000", 0, false, "0"],
    ["0", 4, false, "0.0000"],
    ["9999999999999999.9999", 4, true, "9999999999999999.9999"],
    ["-9999999999999999.9999", 4, false, "-9999999999999999.9999"],
    ["9007199254740993.01", 2, true, "9007199254740993.01"],
  ];
  for (const [value, scale, positive, canonical] of cases) {
    assert.equal(normalizeMoney(value, scale, positive), canonical);
  }
  assert.equal(normalizeMoney("01.2", 2, true), normalizeMoney("1.20", 2, true));
});

Deno.test("exact money rejects numbers, notation, separators, malformed strings and nonfinite values", () => {
  for (
    const value of [
      100,
      0.1,
      NaN,
      Infinity,
      -Infinity,
      1n,
      undefined,
      null,
      {},
      "",
      "NaN",
      "Infinity",
      "-Infinity",
      "1e2",
      "1E+2",
      "1,000.00",
      "1,25",
      "1_000",
      "+1",
      ".1",
      "1.",
      " 1",
      "1 ",
      "1\n",
      "1\0",
      "--1",
      "１",
      "1 000",
      "0x10",
    ]
  ) {
    assert.throws(() => normalizeMoney(value, 4, false), expectedError("invalid_amount"));
  }
});

Deno.test("money rejects raw excess scale, overflow, and nonpositive expense", () => {
  for (
    const [value, scale] of [
      ["1.0", 0],
      ["100.000", 2],
      ["0.000", 2],
      ["1.0000", 3],
      ["1.00000", 4],
      ["10000000000000000", 4],
      ["-10000000000000000", 4],
    ] as const
  ) {
    assert.throws(() => normalizeMoney(value, scale, false), expectedError("invalid_amount"));
  }
  for (const value of ["0", "000.00", "-0", "-0.00", "-1", "-0.01"]) {
    assert.throws(() => normalizeMoney(value, 2, true), expectedError("invalid_amount"));
  }
  for (const unit of [-1, 5, 1.5, NaN, Infinity]) {
    assert.throws(() => normalizeMoney("1", unit, true), expectedError("invalid_currency"));
  }
});

Deno.test("Finance contracts normalize only UUIDs and surrounding user text", () => {
  assert.deepEqual(validateCreateBookInput({ ...book, name: "  Mi dinero de Ángel  " }), {
    ...book,
    request_id: requestId.toLowerCase(),
    workspace_id: workspaceId.toLowerCase(),
    name: "Mi dinero de Ángel",
  });
  const parsedAccount = validateCreateAccountInput(account);
  assert.equal(parsedAccount.book_id, bookId.toLowerCase());
  assert.equal(parsedAccount.person_id, personId.toLowerCase());
  assert.equal(parsedAccount.opening_balance, "-0010.20");
  assert.equal(validateCreateAccountInput({ ...account, person_id: null }).person_id, null);
  const parsedExpense = validateRecordExpenseInput(expense);
  assert.equal(parsedExpense.source_account_id, accountId.toLowerCase());
  assert.equal(parsedExpense.beneficiary_person_id, personId.toLowerCase());
  assert.equal(parsedExpense.description, "Hamburguesa de Ángel");
  assert.equal(parsedExpense.amount, "00100.0");
  assert.equal(
    validateRecordExpenseInput({ ...expense, beneficiary_person_id: null }).beneficiary_person_id,
    null,
  );
});

Deno.test("stored book precision must validate the original spelling before normalization or hashing", () => {
  const parsed = validateRecordExpenseInput({ ...expense, amount: "100.000" });
  assert.equal(parsed.amount, "100.000");
  assert.throws(() => normalizeMoney(parsed.amount, 2, true), expectedError("invalid_amount"));
  assert.equal(normalizeMoney(parsed.amount, 3, true), "100.000");
  const parsedAccount = validateCreateAccountInput({ ...account, opening_balance: "-1.000" });
  assert.throws(
    () => normalizeMoney(parsedAccount.opening_balance, 2, false),
    expectedError("invalid_amount"),
  );
});

Deno.test("all four Finance inputs are closed and require object shapes", () => {
  for (
    const [validate, valid] of [
      [validateFinanceContextInput, { workspace_id: workspaceId }],
      [validateCreateBookInput, book],
      [validateCreateAccountInput, account],
      [validateRecordExpenseInput, expense],
    ] as const
  ) {
    for (const value of [undefined, null, 1, "input", [], [valid]]) {
      assert.throws(() => validate(value), expectedError("invalid_input"));
    }
    for (
      const field of [
        "actor_user_id",
        "token",
        "sql",
        "kind",
        "minor_unit",
        "destination_account_id",
      ]
    ) {
      assert.throws(
        () => validate({ ...valid, [field]: "injected" }),
        expectedError("unknown_field"),
      );
    }
  }
});

Deno.test("mutation inputs require each explicit field, including nullable attribution", () => {
  for (
    const [validate, valid] of [
      [validateCreateBookInput, book],
      [validateCreateAccountInput, account],
      [validateRecordExpenseInput, expense],
    ] as const
  ) {
    for (const field of Object.keys(valid)) {
      const candidate = { ...valid } as Record<string, unknown>;
      delete candidate[field];
      assert.throws(() => validate(candidate), (error) => error instanceof ApiError);
    }
  }
  for (const request_id of ["not-a-uuid", " " + requestId, 42, null]) {
    assert.throws(
      () => validateCreateBookInput({ ...book, request_id }),
      expectedError("invalid_request_id"),
    );
  }
  for (const field of ["workspace_id", "book_id", "source_account_id", "beneficiary_person_id"]) {
    assert.throws(
      () => validateRecordExpenseInput({ ...expense, [field]: "not-a-uuid" }),
      expectedError("invalid_input"),
    );
  }
});

Deno.test("names and descriptions use code-point limits and preserve well-formed user content", () => {
  assert.equal(validateCreateBookInput({ ...book, name: "😀".repeat(200) }).name, "😀".repeat(200));
  assert.equal(
    validateRecordExpenseInput({ ...expense, description: "😀".repeat(2000) }).description,
    "😀".repeat(2000),
  );
  for (const name of ["😀".repeat(201), "\ud800", "a\0b", "", "  ", 12]) {
    assert.throws(() => validateCreateBookInput({ ...book, name }), expectedError("invalid_input"));
    assert.throws(
      () => validateCreateAccountInput({ ...account, name }),
      expectedError("invalid_input"),
    );
  }
  for (const description of ["😀".repeat(2001), "\udfff", "a\0b", "", "  ", 12]) {
    assert.throws(
      () => validateRecordExpenseInput({ ...expense, description }),
      expectedError("invalid_input"),
    );
  }
});

Deno.test("context validates optional selectors and bounded cursors without treating them as authority", () => {
  assert.deepEqual(validateFinanceContextInput({ workspace_id: workspaceId }), {
    workspace_id: workspaceId.toLowerCase(),
  });
  assert.deepEqual(
    validateFinanceContextInput({ workspace_id: workspaceId, book_id: bookId, cursor: "opaque" }),
    {
      workspace_id: workspaceId.toLowerCase(),
      book_id: bookId.toLowerCase(),
      cursor: "opaque",
    },
  );
  for (const cursor of [null, undefined, 1, "", "a".repeat(1025), "a\0b", "\ud800"]) {
    assert.throws(
      () => validateFinanceContextInput({ workspace_id: workspaceId, cursor }),
      expectedError("invalid_cursor"),
    );
  }
  assert.throws(
    () => validateFinanceContextInput({ workspace_id: workspaceId, book_id: null }),
    expectedError("invalid_input"),
  );
});

Deno.test("calendar dates support years 0001 and 0099 without JavaScript's constructor remapping", () => {
  for (
    const date of [
      "0001-01-01",
      "0099-12-31",
      "0004-02-29",
      "1600-02-29",
      "2000-02-29",
      "2024-02-29",
      "9999-12-31",
    ]
  ) {
    assert.equal(validateDate(date), date);
  }
  for (
    const date of [
      "0000-01-01",
      "0001-02-29",
      "0099-02-29",
      "1900-02-29",
      "2100-02-29",
      "2026-02-29",
      "2026-04-31",
      "2026-00-01",
      "2026-13-01",
      "2026-01-00",
      "2026-01-32",
      "2026-2-01",
      "26-01-01",
      "10000-01-01",
      "2026-01-01T00:00:00Z",
      "today",
      "01/02/2026",
      "2026-01-01\n",
      null,
      20261013,
    ]
  ) {
    assert.throws(() => validateDate(date), expectedError("invalid_date"));
  }
});

Deno.test("workspace-local dates cross midnight and DST using stored IANA zones", () => {
  const instant = new Date("2026-10-14T05:59:59Z");
  assert.equal(workspaceLocalDate("America/Mexico_City", instant), "2026-10-13");
  assert.equal(
    workspaceLocalDate("America/Mexico_City", new Date("2026-10-14T06:00:00Z")),
    "2026-10-14",
  );
  assert.equal(workspaceLocalDate("Pacific/Kiritimati", instant), "2026-10-14");
  assert.equal(
    workspaceLocalDate("Pacific/Pago_Pago", new Date("2026-01-01T01:00:00Z")),
    "2025-12-31",
  );
  assert.equal(
    workspaceLocalDate("America/New_York", new Date("2026-03-08T06:59:59Z")),
    "2026-03-08",
  );
  assert.equal(
    workspaceLocalDate("America/New_York", new Date("2026-03-08T07:00:00Z")),
    "2026-03-08",
  );
  assert.equal(workspaceLocalDate("UTC", new Date("0001-01-01T00:00:00Z")), "0001-01-01");
  assert.equal(workspaceLocalDate("UTC", new Date("0099-12-31T00:00:00Z")), "0099-12-31");
  for (const zone of ["Mars/Olympus", "+06:00", "UTC+6", ""]) {
    assert.throws(() => workspaceLocalDate(zone, instant), expectedError("invalid_timezone"));
  }
  for (
    const date of [
      new Date(NaN),
      new Date("0000-01-01T00:00:00Z"),
      new Date("+010000-01-01T00:00:00Z"),
    ]
  ) {
    assert.throws(() => workspaceLocalDate("UTC", date), expectedError("invalid_date"));
  }
});

Deno.test("resolved expense retry fixtures retain their concrete date across local midnight", () => {
  const occurred_on = workspaceLocalDate("America/Mexico_City", new Date("2026-10-14T05:59:59Z"));
  const accepted = validateRecordExpenseInput({ ...expense, occurred_on });
  const laterContextDate = workspaceLocalDate(
    "America/Mexico_City",
    new Date("2026-10-14T06:00:01Z"),
  );
  assert.notEqual(accepted.occurred_on, laterContextDate);
  const retry = validateRecordExpenseInput({ ...accepted });
  assert.deepEqual(retry, accepted);
  assert.equal(retry.occurred_on, "2026-10-13");
});
