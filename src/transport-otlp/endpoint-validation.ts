/**
 * Construction-time endpoint validation for `createOtlpTransport`.
 *
 * Locked behaviour (mirrors `./transport-beacon`, TO-5 / research D8):
 *   - HTTPS endpoints always pass.
 *   - HTTP endpoints pass IFF `allowInsecureLoopback === true` AND the
 *     parsed URL's hostname is in `{ localhost, 127.0.0.1, [::1] }`.
 *   - Every other case throws a typed error at construction time, before
 *     any logger derives the runtime and before any listener is attached.
 *
 * Pure and side-effect-free: parses via `new URL(...)` and inspects the
 * result. MUST NOT read ambient state (no `process.env`, no
 * `window.location`) and MUST NOT read `allowInsecureLoopback` from
 * anywhere except the argument the caller passed.
 *
 * The consumer supplies the FULL OTLP logs URL (e.g.
 * `https://otlp.example.com/v1/logs`); the transport appends nothing.
 *
 * Specs: `specs/007-transport-otlp/contracts/transport-otlp-public-api.md`
 * TO-5; `data-model.md` § validation rules.
 */

/**
 * Hostnames permitted under `allowInsecureLoopback: true`. WHATWG URL
 * normalises `http://[::1]` to hostname `[::1]` (with brackets).
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
]);

/**
 * Validate a consumer-supplied `endpoint`. Returns the parsed `URL` on
 * success; throws on every violation. The thrown error's `.message` names
 * the violated constraint and the offending endpoint string.
 */
export function validateEndpoint(
  endpoint: unknown,
  allowInsecureLoopback: boolean,
): URL {
  if (typeof endpoint !== 'string') {
    throw new TypeError(
      `otlp transport: endpoint must be a string, got ${typeName(endpoint)}`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new TypeError(`otlp transport: invalid endpoint URL: '${endpoint}'`);
  }

  if (parsed.protocol === 'https:') {
    return parsed;
  }

  if (parsed.protocol === 'http:') {
    if (!allowInsecureLoopback) {
      throw new Error(
        `otlp transport refuses non-HTTPS endpoint '${endpoint}'`,
      );
    }
    if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
      throw new Error(
        `otlp transport: allowInsecureLoopback permits only ` +
          `localhost / 127.0.0.1 / [::1]; got '${parsed.hostname}' ` +
          `in '${endpoint}'`,
      );
    }
    return parsed;
  }

  throw new Error(
    `otlp transport refuses non-HTTPS endpoint '${endpoint}' ` +
      `(scheme '${parsed.protocol}' is not permitted)`,
  );
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  return typeof value;
}
