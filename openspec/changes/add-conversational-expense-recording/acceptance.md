# Synthetic conversational acceptance review

## Evidence boundary

This is a client/model desk walkthrough of the current [MCP instructions and tool descriptions](../../../apps/supabase/functions/impulso-api/mcp.ts) against the accepted [Finance requirements](specs/finance-expenses/spec.md). The reviewer read the metadata and generated the next client action for each supplied scenario. Every session, context page, user reply, timestamp, tool result, and failure below is a synthetic fixture. No live MCP client, plugin, database, OAuth session, or Finance tool was called for this review. No workspace, book, account, expense, or audit was actually created.

The observed actions below are the reviewer's generated fixture responses, compared with the required next action. A PASS means that this fixture-only review follows the advertised contract; it does not establish how every external client will behave. Protocol tests separately assert the metadata and schemas, and integration tests separately exercise transactional behavior. Aggregate execution results belong in the change's verification record, not in these simulated outcomes.

Fixture identifiers use labels for readability: `W` is a supplied authorized workspace, `P` its verified active self, `B` an authorized active MXN book with minor unit two, and `A` an authorized active account. Each label stands for a distinct valid synthetic UUID. Mutation request labels `R-book`, `R-account`, and `R-expense` also stand for distinct valid synthetic UUIDs. They are never real user identifiers and are not literal wire values. Unless a scenario overrides it, a supplied complete session identifies `W`, and context has no further page, returns self `P`, and reports owner/editor rights for selected resources.

## 1. Hamburger request without onboarding or financial setup

**Supplied scenario:** The synthetic user says `compre una hamburguesa`. The supplied `get_session` response is `onboarding.status = required`. No amount, currency, attribution, date, or financial resource has been accepted.

**Observed reviewer action:** Retain the hamburger request, explain that initial workspace setup is needed, and follow the unchanged onboarding review. Do not invent the price or call a Finance mutation. After a supplied accepted onboarding result identifies `W`, plan `get_finance_context({workspace_id: W})`. Its supplied response has `books = []`, self `P`, workspace zone `America/Mexico_City`, and `current_local_date = 2026-10-13`. Ask for the missing amount and explicit currency, offer `Everyday`, `Main account`, and a starting tracking balance of `0`, and propose a clearly labeled self/shared choice and concrete date for review.

**Expected next action:** Only session/context reads and necessary conversational setup before accepted values. The original description remains a hamburger; no claim that it has been recorded. If session setup were `unavailable`, explain that state and do not restore resources.

**Verdict:** PASS, fixture-only. No write was executed or implied by the initial request.

## 2. Pesos remains ambiguous despite Spanish and a Mexico City zone

**Supplied scenario:** Complete session, no book yet, and context in Mexico City time. The synthetic user replies `Fueron 100 pesos` without specifying a country-specific currency.

**Observed reviewer response:** "Which pesos do you mean, for example Mexican pesos (MXN) or another country's currency?" Retain amount `100` and the description. Do not infer MXN from Spanish, the stored zone, server location, or a residence assumption.

**Expected next action:** Clarify currency before preparing the final setup/expense payload. A separately selected and accepted existing MXN book could resolve its own currency, but this fixture has none.

**Verdict:** PASS, fixture-only. No currency was guessed and no mutation was planned yet.

## 3. English setup suggestions, zero tracking balance, and self need one complete review

**Supplied scenario:** The user explicitly selects Mexican pesos, amount `100`, the suggested book/account names, self attribution, and the proposed date `2026-10-13`. There is no financial setup. These are supplied replies, not inferred defaults.

**Observed reviewer response:** "I'll create Everyday in MXN and Main account with a starting tracking balance of 0.00 MXN, associated with you. I'll record 100.00 MXN for the hamburger on October 13, 2026 from that account, for you. The date is the current workspace-local date supplied by Impulso. Continue or change anything?" The starting balance is described as a tracking value rather than a bank balance. Before acceptance, plan no mutation.

**Supplied continuation:** The synthetic user accepts the complete review. Supplied tool results then report book creation `created` with `B`, account creation `created` with `A`, and expense creation `created` with a transaction identifier.

**Observed reviewer action:** Plan `create_book` with `R-book`, then `create_account` with `R-account`, `opening_balance: "0"`, and `person_id: P`, then `record_expense` with `R-expense`, `amount: "100"`, `occurred_on: "2026-10-13"`, and `beneficiary_person_id: P`. Substitute the supplied committed book/account IDs between calls. Report a recorded expense only after the supplied final success, using its canonical `100.00 MXN`, concrete date, account, and description; do not claim a bank payment.

**Expected next action:** Separate accepted calls, distinct keys, exact decimal strings, no client-supplied minor unit or actor, and verified context self only. Each actual server call must independently authorize the action; this review does not replace those checks.

**Verdict:** PASS, fixture-only. All successes are supplied results; no real resource or expense was created.

## 4. Custom Spanish names remain intact and shared attribution is explicit

**Supplied scenario:** Instead of the suggestions, the synthetic user chooses book `Mi dinero`, account `Caja de la casa`, description `Hamburguesa de Ángel`, and explicitly requests shared/unassigned account and expense attribution. Currency MXN, balance `0`, amount `100`, and the concrete date are otherwise resolved.

**Observed reviewer action:** Show the revised complete review with the supplied Spanish text unchanged and an understandable shared/unassigned label. After supplied acceptance, plan `person_id: null` and `beneficiary_person_id: null`; preserve `Mi dinero`, `Caja de la casa`, and `Hamburguesa de Ángel` in their corresponding payload fields. Generated explanatory text stays in English. No new person is planned.

**Expected next action:** Preserve user-provided language and obtain acceptance of the changed review. Null must represent the explicit shared choice, not a failed self lookup or an unasked default.

**Verdict:** PASS, fixture-only. No translation, self substitution, or actual write occurred.

## 5. A complete expense instruction needs no redundant confirmation

**Supplied scenario:** Complete session and previously accepted active book `B`, account `A`, and self `P`. The synthetic user says: "Record 100 MXN for Hamburguesa de Ángel on 2026-10-13 from Main account in Everyday, for me." Current supplied context confirms the same authorized choices, with no ambiguity or new setup required.

**Observed reviewer action:** Plan one `record_expense` using a fresh action UUID, `amount: "100"`, the explicit concrete date, preserved description, selected IDs, and self `P`. Do not ask the user to confirm the same resolved instruction, repeat onboarding, create another book/account, or propose a different date.

**Expected next action:** Submit the already resolved expense, then describe only its supplied committed/recovered outcome. Authorization remains the server's responsibility.

**Verdict:** PASS, fixture-only. No redundant review and no real submission.

## 6. Multiple accounts and incomplete pages do not establish a default

**Supplied scenario A:** Authorized book context returns two active accounts, `Main account` and `Card`, with `next_cursor: null`. The user has not selected an account.

**Observed reviewer response:** "Should I use Main account or Card?" Retain the amount, currency, date, description, and attribution already resolved. Do not choose the first account or ask those accepted values again.

**Supplied scenario B:** Book discovery returns a full first page of 50 authorized book summaries, one named `Everyday`, and nonnull `next_cursor`. The user requested Everyday without selecting an ID; a later supplied page contains another matching name.

**Observed reviewer action:** Plan continuation under the same workspace and query mode before treating a name as unique. After the second supplied page reveals the ambiguity, ask for the intended book using available selection details; only then request its account context. Never use cursor content as authority or create another book merely because discovery is incomplete.

**Expected next action:** Continue incomplete discovery and ask the focused unresolved resource question. No arbitrary first-row choice or mutation.

**Verdict:** PASS, fixture-only for both branches. All pages are supplied fixtures; no discovery request was executed.

## 7. Message-local date differs from server-current date and survives midnight retry

**Supplied scenario:** The reliable message instant is `2026-10-14T05:50:00Z`, which is October 13 in stored `America/Mexico_City`. By the time supplied context is read, the server instant is `2026-10-14T06:05:00Z` and `current_local_date` is October 14. The user omitted a purchase date.

**Observed reviewer response:** "Your message was sent on October 13 in your workspace's Mexico City time. I'll use October 13, 2026 for this expense; continue or change it?" Do not call the earlier message date "today," replace it with October 14, or change the stored zone from a client location hint.

**Supplied continuation:** The user accepts October 13. A simulated first expense response becomes uncertain; a later context still says October 14.

**Observed reviewer action:** Retain `occurred_on: "2026-10-13"`, `R-expense`, and all other submitted values. Plan the same expense retry; do not recompute the date from the new context. If no reliable message timestamp had been supplied, propose and disclose the server-provided current workspace date instead, requiring acceptance before submission.

**Expected next action:** Explain the date basis, accept a concrete date once, and preserve it through retries. An ambiguous user date such as `01/02/2026` would require clarification before either path.

**Verdict:** PASS, fixture-only. Timestamps, acceptance, uncertainty, and retry are synthetic; no actual expense or clock-dependent write occurred.

## 8. Cancellation before the first write leaves setup untouched

**Supplied scenario:** Context has no usable setup and a complete proposed review is shown, but no mutation has been submitted. The synthetic user says "Cancel."

**Observed reviewer response:** "Canceled. No book, account, or expense has been created." Plan no `create_book`, `create_account`, or `record_expense` call. A supplied correction before cancellation would revise the review rather than submit the old one.

**Expected next action:** Stop before all mutations and preserve the user's ability to return later. Read-only context is not creation authority.

**Verdict:** PASS, fixture-only. The no-write assertion follows the supplied pre-submission state and is not a live database check.

## 9. Partial setup is reported accurately after a later failure

**Supplied scenario A:** The user accepted the full setup/expense review. A supplied `create_book` result is `created` for `B`; the supplied account call then returns a controlled failure before a successful account result.

**Observed reviewer response/action:** "Everyday was created, but the account step failed and the expense has not been recorded." Keep `B` and `R-account`; if retrying is appropriate, plan the unchanged account action with its original key. Do not create a second book, claim the book rolled back, remove it to hide partial progress, or claim an expense exists.

**Supplied scenario B:** Supplied book and account creation both succeed; a later expense response explicitly fails without commit.

**Observed reviewer response/action:** "Everyday and Main account exist. The expense has not been recorded." Retain both committed IDs and the expense request key for the applicable unchanged retry. If the user cancels now, leave the separately accepted setup in place and explain that outcome.

**Expected next action:** Distinguish separate transaction outcomes, use controlled errors, and never imply cross-call rollback or bank payment.

**Verdict:** PASS, fixture-only for both branches. All successes/failures are supplied; no rollback, deletion, or creation was performed.

## 10. An uncertain expense is recovered before considering a correction

**Supplied scenario:** The client submitted a fully resolved `100.00 MXN` hamburger expense for October 13 with `R-expense`, but the simulated connection lost the response. The synthetic user now says "Actually it was 120."

**Observed reviewer action:** Explain that the earlier result is uncertain. First plan `record_expense` with the original `R-expense`, original amount/date/description/account/beneficiary, and unchanged scope. Do not put `120` under the existing key and do not use a fresh key to guess whether the first write committed.

**Supplied continuation:** Recovery reports `already_processed` for the original transaction and canonical `100.00 MXN`.

**Observed reviewer response:** "The original 100.00 MXN expense was recorded. Changing a recorded expense is not supported yet, so I have not entered another expense or changed it to 120." If recovery instead supplies an access denial or retired-action error, disclose only that controlled failure and do not claim authorized recovery or recreate the action.

**Expected next action:** Recover the unchanged original action before discussing an unsupported correction. A previous receipt never overrides current permissions.

**Verdict:** PASS, fixture-only. The uncertain submission and recovery result are supplied; no real transaction was inspected or changed.

## 11. Other-person, correction, and Health requests stay outside the expense boundary

**Supplied scenario A:** The synthetic user asks to record an expense for their mother, but context supplies only verified self `P` and no managed-person resolution operation.

**Observed reviewer response/action:** Explain that this slice supports verified self or explicitly shared/unassigned attribution and cannot resolve another person. Do not guess a same-name person, create a person, attach the mother's expense to self, or silently use null. A different explicitly accepted shared action would require a new resolved request, not an assumed substitution.

**Supplied scenario B:** The user requests a correction/void of a known committed expense, income, a transfer, a balance, or Health entry such as `Agrega mi medicamento`.

**Observed reviewer response/action:** Explain the requested operation is unavailable. Do not register a negative expense, compensating duplicate, surrogate expense, new Health record, or claimed bank transfer. No unrelated Finance mutation is planned.

**Expected next action:** Preserve narrow supported behavior and truthful outcomes without approximating excluded features.

**Verdict:** PASS, fixture-only for both branches. No supported or unsupported operation was executed.

## Review result

All eleven scenario groups produced a reviewer-generated next action consistent with the current metadata and accepted Finance requirements. The reviewed paths preserve missing-value questions, explicit setup acceptance, exact currency/money, authorized resource selection, message/workspace dates, cancellation, separate-call outcomes, same-key recovery, user language, and unsupported-operation boundaries. This is synthetic review evidence only. Live protocol and transaction checks, remote rollout, actual user authorization, and external-client behavior remain separate evidence categories.
