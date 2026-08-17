## Title
Fix the failing `encodeSegment` injectivity test (tilde omitted from the safe-alphabet regex)

## Evidence
`npm test` is RED on main (e021337). One test fails:
`src/__tests__/session.test.ts` → `store` → "encodes unsafe path segments injectively".

The helper `decodeRoundTrips()` asserts:
  expect(encodeSegment(s)).toMatch(/^[A-Za-z0-9._-]+$/);
for samples including `"with space"`. But `encodeSegment` (src/session/store.ts)
emits `~XXXX` tilde-hex escapes for every non-safe code unit, so
`encodeSegment("with space") === "with~0020space"`, which contains `~` and does
NOT match `/^[A-Za-z0-9._-]+$/`.

The implementation is CORRECT: its documented contract is "Safe code units remain
literal; every other unit becomes `~XXXX`", and the output alphabet is
`[A-Za-z0-9._-~]` (the tilde is the escape marker). The test regex is the bug —
it omits the tilde from the safe alphabet.

## Impact
The gate (Rule 3: build + test + lint) cannot pass while this test is red, so no
cycle can merge. The encodeSegment contract (injective, neutralizes `../`, NUL,
separators) is otherwise sound and already asserted by the sibling expectations
(`..` → `~002E~002E`, `a/b` → `a~002Fb`, NUL → `~0000`).

## Suggestion
- Fix the test regex in `decodeRoundTrips()` to include the tilde:
  `/^[A-Za-z0-9._-~]+$/`.
- Do NOT change `encodeSegment` — its tilde-hex output is the intended injective
  encoding.
- Optionally strengthen the test to assert injectivity explicitly (two distinct
  inputs never encode to the same segment) and that the round-trip decode of a
  `~XXXX` escape recovers the original code unit.
- Re-run the full gate: `npm run build`, `npm test`, `npm run lint` — all green.

## Scope
Single-file test fix in `src/__tests__/session.test.ts`. No production code
change required.
