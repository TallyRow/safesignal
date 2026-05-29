/**
 * Stable bag of secret-looking values for testing. Every value here is
 * fake but shaped like the real thing — long enough that finding it in
 * a URL, query string, log payload, etc. is meaningful evidence of a
 * leak (no false positives from short substrings).
 *
 * Consumers (and the package's own tests T028, T041, T058) place these
 * values in attributes/context/etc. then assert downstream sinks never
 * see any of them.
 *
 * The keys mirror the documented default redaction denylist in
 * `contracts/redaction.md` so any new key here should track a denylist
 * entry — making the fixture the canonical "things the package promises
 * to mask" reference for consumers.
 */

/**
 * Concrete shape of {@link makeSecretFixture}'s return value. Named
 * `string` fields (rather than `Record<string, string>`) so callers get
 * `string` — not `string | undefined` — per-field under the package's
 * `noUncheckedIndexedAccess` setting. Not part of the public `/testing`
 * surface; it only types the helper's return.
 *
 * Declared as a `type` (not an `interface`) on purpose: a type alias
 * whose properties are all `string` gets an *implicit* index signature,
 * so the fixture stays assignable to `Record<string, string>` / OTel
 * `Attributes` — while `keyof SecretFixture` remains the precise named-key
 * union, keeping dynamic `fixture[someKey]` access typed `string`.
 */
type SecretFixture = {
  readonly password: string;
  readonly passwd: string;
  readonly token: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly bearerToken: string;
  readonly authorization: string;
  readonly auth: string;
  readonly cookie: string;
  readonly setCookie: string;
  readonly secret: string;
  readonly apiKey: string;
  readonly sessionId: string;
  readonly sid: string;
  readonly ssn: string;
  readonly creditCard: string;
  readonly cardNumber: string;
  readonly cvv: string;
  readonly jwt: string;
};

/**
 * Return a stable record of secret-looking values keyed by category.
 * Values are deterministic across calls so tests can assert against
 * exact strings. Never mutate the returned object across tests — call
 * `makeSecretFixture()` again to get a fresh copy.
 */
export function makeSecretFixture(): SecretFixture {
  return {
    password: 'p4ssw0rd-correct-horse-battery-staple',
    passwd: 'p4ssw0rd-shadow-file-style',
    token: 'tok_AAAABBBBCCCCDDDD1234EEEEFFFFGGGG',
    accessToken: 'access_AAAA1111BBBB2222CCCC3333DDDD4444EEEE5555',
    refreshToken: 'refresh_FFFF6666GGGG7777HHHH8888IIII9999JJJJ0000',
    bearerToken:
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.bearerFixtureSignature',
    authorization: 'Basic dXNlcjpwYXNzOmZpeHR1cmUtbm90LXJlYWw',
    auth: 'auth_KKKK1111LLLL2222MMMM3333NNNN4444',
    cookie:
      'sessionId=fixture-session-id-not-real-abc123; Secure; HttpOnly; SameSite=Strict',
    setCookie:
      'auth=fixture-auth-cookie-not-real-xyz789; Path=/; Secure; HttpOnly',
    secret: 'sk_test_FIXTURE_4eC39HqLyjWDarjtT1zdp7dc_NOT_REAL',
    apiKey: 'pk_live_FIXTURE_ABCD1234EFGH5678IJKL9012MNOP_NOT_REAL',
    sessionId: 'sess_01HXYZ123ABCDEFGHIJKLMNOPQR',
    sid: 'sid_FIXTURE_QQQQ1111RRRR2222SSSS3333',
    ssn: '123-45-6789',
    creditCard: '4242 4242 4242 4242',
    cardNumber: '5555555555554444',
    cvv: '123',
    jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.fixtureJwtSignatureNotReal',
  };
}

/**
 * The complete list of fixture VALUES. Useful when scanning an
 * arbitrary string (e.g., a captured URL or POST body) for any leaked
 * fixture: `if (FIXTURE_VALUES.some((v) => url.includes(v))) { leak! }`.
 */
export const FIXTURE_VALUES: ReadonlyArray<string> = Object.values(
  makeSecretFixture(),
);
