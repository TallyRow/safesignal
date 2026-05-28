/**
 * Construction-time endpoint validation for `createBeaconTransport`.
 *
 * Locked behaviour:
 *   - HTTPS endpoints always pass.
 *   - HTTP endpoints pass IFF `allowInsecureLoopback === true` AND the
 *     parsed URL's hostname is in `{ localhost, 127.0.0.1, [::1] }`.
 *   - Every other case throws a typed error at construction time, before
 *     any logger derives the runtime and before any listener is
 *     attached (FR-016).
 *
 * The function is pure and side-effect-free: it parses the endpoint via
 * `new URL(...)` and inspects the result. It MUST NOT read ambient state
 * (no `process.env`, no `window.location`, no build-define plugin), and
 * MUST NOT read `allowInsecureLoopback` from anywhere except the
 * argument the caller passed (FR-016 clarification).
 *
 * Specs: `specs/002-beacon-transport/contracts/failure-modes.md` F-1;
 * `specs/002-beacon-transport/contracts/transport-beacon-public-api.md`
 * TB-5; `specs/002-beacon-transport/spec.md` FR-016.
 */

/**
 * The exact set of hostnames permitted under
 * `allowInsecureLoopback: true`. WHATWG URL normalises `http://[::1]`
 * and `http://[0:0:0:0:0:0:0:1]` to hostname `[::1]` (with brackets),
 * so the allowlist matches the canonical form.
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
]);

/**
 * Validate a consumer-supplied `endpoint` string. Returns the parsed
 * `URL` on success. Throws on every form of violation.
 *
 * The thrown error's `.message` always names (a) the violated
 * constraint and (b) the offending endpoint string, so the consumer
 * can act on the diagnostic without parsing the error's stack.
 */
export function validateEndpoint(
  endpoint: unknown,
  allowInsecureLoopback: boolean,
): URL {
  if (typeof endpoint !== 'string') {
    throw new TypeError(
      `beacon transport: endpoint must be a string, got ${typeName(endpoint)}`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new TypeError(
      `beacon transport: invalid endpoint URL: '${endpoint}'`,
    );
  }

  if (parsed.protocol === 'https:') {
    return parsed;
  }

  if (parsed.protocol === 'http:') {
    if (!allowInsecureLoopback) {
      throw new Error(
        `beacon transport refuses non-HTTPS endpoint '${endpoint}'`,
      );
    }
    if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
      throw new Error(
        `beacon transport: allowInsecureLoopback permits only ` +
          `localhost / 127.0.0.1 / [::1]; got '${parsed.hostname}' ` +
          `in '${endpoint}'`,
      );
    }
    return parsed;
  }

  throw new Error(
    `beacon transport refuses non-HTTPS endpoint '${endpoint}' ` +
      `(scheme '${parsed.protocol}' is not permitted)`,
  );
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  return typeof value;
}
