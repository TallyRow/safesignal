# Contract: Redaction

## Interface

```ts
type Redactor = (event: LogEvent) => LogEvent | null;

interface RedactionRule {
  key?: string | RegExp;     // case-insensitive key match anywhere in event tree
  shape?: RegExp;            // value-shape match (applied regardless of key name)
  replacement?: string;      // default '[REDACTED]'
}

function createRedactor(rules?: RedactionRule[]): Redactor;
```

## Where the redactor runs

The redactor runs in the pipeline **after** the sanitizer and URL scrubber
have normalized the event, and **before** the control-char guard and any
backend or transport. It walks:

- `event.message` (string scan; only `shape` rules apply, since there's no key)
- `event.attributes` (recursive walk; `key` and `shape` rules apply)
- `event.context.attributes` (recursive walk; `key` and `shape` rules apply)
- `event.error.name`, `event.error.message`, `event.error.stack` (string
  scan; only `shape` rules apply)

The redactor MUST be synchronous.

## Default denylist (built-in `createRedactor()`)

### Key rules (case-insensitive; key-name only, never value substring)

```
/^password$|^passwd$/i
/^token$|access[_-]?token|refresh[_-]?token|bearer[_-]?token/i
/^authorization$|^auth$/i
/^cookie$|^set-cookie$/i
/^secret$/i
/api[_-]?key/i
/session[_-]?id|^sid$/i
/^ssn$/i
/credit[_-]?card|^cardNumber$|^cvv$/i
```

### Shape rules (applied to all string values regardless of key)

```
/^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/   // JWT
/^Bearer\s+[A-Za-z0-9._\-]+$/i                                 // Bearer prefix
```

Notes:
- Email is NOT in the default denylist. Many applications log email
  intentionally; consumers who want it masked should pass a custom rule.
- The default redactor does NOT shape-match raw long high-entropy strings
  on their own (too many false positives); shape matching is intersection
  with key context where appropriate.

## Match semantics

- **Key match**: a rule's `key` is tested against the **immediate property
  name** of the value being inspected. The test is case-insensitive. A match
  replaces the value with `replacement` (default `'[REDACTED]'`). Nested
  matching is by walk; e.g., a `password` key at any depth is masked.
- **Shape match**: a rule's `shape` is tested against the string value. A
  match replaces the value with `replacement`. Shape rules do NOT match
  inside an object or array — they apply to leaf string values only.
- **Combination**: if both `key` and `shape` are set on a rule, the value
  is replaced when EITHER matches.

## Custom redactors

A `LoggerConfig.redactor` value **fully replaces** the default. Consumers
who want to extend the default should compose:

```ts
const composed: Redactor = (event) => {
  const base = createRedactor()(event);
  if (base === null) return null;
  return createRedactor([{ key: /internal[_-]?secret/i }])(base);
};
```

Custom redactors run inside the dispatcher's try/catch.

## Fail-closed behavior

If the redactor throws OR returns a value that is not a `LogEvent` or
`null`, the dispatcher **drops the event** and invokes `onInternalError`.

There is no partial emission. There is no "best effort" mode. This is the
explicit contract.

## Tested behavior

| ID | Behavior |
|----|----------|
| R-1 | Each default key rule masks values for matching keys at any depth |
| R-2 | Each default shape rule masks matching leaf string values |
| R-3 | Safe values containing denylist substrings in non-key positions are NOT mangled (e.g., a string value `"tokenizer is great"` under key `"product"` is untouched) |
| R-4 | A custom `RedactionRule[]` replaces the default rules |
| R-5 | A custom `Redactor` replaces `createRedactor()` entirely |
| R-6 | A redactor that throws causes the event to be dropped and `onInternalError` invoked |
| R-7 | A redactor returning a non-event, non-null value causes the event to be dropped |
| R-8 | Redaction runs after sanitization (verified by feeding a class instance with a `password` getter — getter is NOT invoked because the sanitizer reduced it to a type tag before the redactor saw it) |
| R-9 | Redaction runs before any transport (`Transport.send` never sees an unredacted event) |
| R-10 | `event.message`, `event.error.message`, and `event.error.stack` are also scanned by shape rules |

## Limitations (documented, not bugs)

- Key-name matching does not catch sensitive values stored under unexpected
  key names (e.g., `"x-internal-secret"`). Consumers SHOULD audit their
  attribute keys and extend the denylist as appropriate.
- The package cannot detect every encoded credential (e.g., base64 of a
  random key with no obvious pattern). Consumers SHOULD avoid logging such
  values regardless.
