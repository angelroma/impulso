import assert from "node:assert/strict";
import { ApiError } from "../_shared/http.ts";
import { validateOnboardingInput } from "../_shared/onboarding.ts";

const validInput = {
  request_id: "C3069373-D597-4289-AAC6-89F092B93830",
  display_name: "  Ángel  ",
  workspace_name: "  Familia de Ángel  ",
  timezone: "  America/Mexico_City  ",
};

function expectedError(code: string) {
  return (error: unknown) =>
    error instanceof ApiError && error.status === 400 && error.code === code;
}

Deno.test("onboarding validates and normalizes input without translating user names", () => {
  assert.deepEqual(validateOnboardingInput(validInput), {
    request_id: validInput.request_id.toLowerCase(),
    display_name: "Ángel",
    workspace_name: "Familia de Ángel",
    timezone: "America/Mexico_City",
  });
});

Deno.test("onboarding requires a UUID request identifier", () => {
  for (const requestId of [undefined, null, 123, "", "not-a-uuid", "  " + validInput.request_id]) {
    assert.throws(
      () => validateOnboardingInput({ ...validInput, request_id: requestId }),
      expectedError("invalid_request_id"),
    );
  }
});

Deno.test("onboarding requires explicit nonempty names and rejects null bytes", () => {
  for (const field of ["display_name", "workspace_name"] as const) {
    for (const value of [undefined, null, 123, {}, "", "  \t\n ", "user\0name", "\ud800"]) {
      assert.throws(
        () => validateOnboardingInput({ ...validInput, [field]: value }),
        expectedError("invalid_input"),
      );
    }
  }
});

Deno.test("onboarding name bounds match PostgreSQL Unicode character counts", () => {
  const name = "😀".repeat(200);
  assert.equal(validateOnboardingInput({ ...validInput, display_name: name }).display_name, name);
  for (const field of ["display_name", "workspace_name"] as const) {
    assert.throws(
      () => validateOnboardingInput({ ...validInput, [field]: name + "😀" }),
      expectedError("invalid_input"),
    );
  }
});

Deno.test("onboarding requires an explicit recognized IANA time zone", () => {
  for (const timezone of [undefined, null, 123, "", " ", "x".repeat(201)]) {
    assert.throws(
      () => validateOnboardingInput({ ...validInput, timezone }),
      expectedError("invalid_input"),
    );
  }
  for (const timezone of ["Not/A_Timezone", "UTC+6", "+06:00", "Mars/Olympus_Mons"]) {
    assert.throws(
      () => validateOnboardingInput({ ...validInput, timezone }),
      expectedError("invalid_timezone"),
    );
  }
  assert.equal(validateOnboardingInput({ ...validInput, timezone: "UTC" }).timezone, "UTC");
});

Deno.test("onboarding normalizes timezone aliases consistently for retry hashing", () => {
  const alias = validateOnboardingInput({ ...validInput, timezone: "US/Pacific" });
  const canonical = validateOnboardingInput({ ...validInput, timezone: "America/Los_Angeles" });
  assert.equal(alias.timezone, canonical.timezone);
});
