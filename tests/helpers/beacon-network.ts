/**
 * Test doubles for the browser primitives the beacon transport relies on.
 *
 * Used by every test under `tests/contract/transport-beacon.contract.test.ts`,
 * `tests/security/transport-beacon-*`, `tests/integration/transport-beacon-*`,
 * `tests/unit/transport-beacon/**`, and `tests/performance/transport-beacon-*`.
 *
 * Each `installXDouble()` / `installXSpy()` helper:
 *   - Captures the original primitive (if any) at install time.
 *   - Replaces it with a recording stand-in.
 *   - Returns a controller object exposing recorded calls plus an
 *     `uninstall()` that restores the original verbatim.
 *
 * The helpers patch globals on `globalThis` and `globalThis.navigator`.
 * They MUST NOT import from `src/internal/**`; they MUST NOT import any
 * observability-vendor SDK. The only `src/` import is type-only.
 *
 * Tests SHOULD call `uninstall()` in an `afterEach` or `finally` to avoid
 * cross-test leakage. The transport doubles installed here intentionally
 * patch globals (not Window-only) because tsup builds the package for a
 * browser target but the test runner is happy-dom, which exposes both
 * `globalThis.navigator` and `globalThis.fetch` on the same object.
 */

// ---------------------------------------------------------------------------
// `navigator.sendBeacon` double
// ---------------------------------------------------------------------------

export interface SendBeaconCall {
  /** The endpoint string passed to `navigator.sendBeacon`. */
  readonly endpoint: string;
  /** The body argument the transport passed (always a `Blob` per D-4, but we coerce to string for assertions). */
  readonly body: string | null;
  /** The `Blob.type` if the body was a Blob; otherwise `null`. */
  readonly bodyType: string | null;
}

export interface InstallSendBeaconDoubleOptions {
  /**
   * What the double returns. Either a fixed boolean, or a function called
   * with `(endpoint, body)` returning a boolean — useful when the test wants
   * the double to "refuse" only on certain payloads (size-limit simulation).
   * Defaults to `true` (sendBeacon accepts every payload).
   */
  returnValue?: boolean | ((endpoint: string, body: string | null) => boolean);
}

export interface SendBeaconDoubleController {
  /** Every call to `navigator.sendBeacon` since install, in order. */
  readonly calls: ReadonlyArray<SendBeaconCall>;
  /** Restore the original primitive (or remove the property if there was none). */
  uninstall(): void;
}

export function installSendBeaconDouble(
  options: InstallSendBeaconDoubleOptions = {},
): SendBeaconDoubleController {
  const calls: SendBeaconCall[] = [];
  const fixedReturn =
    typeof options.returnValue === 'boolean' ? options.returnValue : true;
  const decide: (endpoint: string, body: string | null) => boolean =
    typeof options.returnValue === 'function'
      ? options.returnValue
      : (): boolean => fixedReturn;

  const nav = ensureNavigator();
  const hadOriginal = Object.prototype.hasOwnProperty.call(nav, 'sendBeacon');
  const original = (nav as { sendBeacon?: unknown }).sendBeacon;

  (nav as { sendBeacon: (endpoint: string, data?: BodyInit | null) => boolean }).sendBeacon = (
    endpoint: string,
    data?: BodyInit | null,
  ): boolean => {
    const recorded = recordBeaconCall(endpoint, data);
    calls.push(recorded);
    return decide(endpoint, recorded.body);
  };

  return {
    get calls(): ReadonlyArray<SendBeaconCall> {
      return calls;
    },
    uninstall(): void {
      if (hadOriginal) {
        (nav as { sendBeacon: unknown }).sendBeacon = original;
      } else {
        delete (nav as { sendBeacon?: unknown }).sendBeacon;
      }
    },
  };
}

/**
 * Convenience: install a `sendBeacon` double that's missing entirely
 * (simulates the `beacon_unavailable` path). Returns a controller whose
 * `calls` will stay empty.
 */
export function installSendBeaconUnavailable(): SendBeaconDoubleController {
  const calls: SendBeaconCall[] = [];
  const nav = ensureNavigator();
  const hadOriginal = Object.prototype.hasOwnProperty.call(nav, 'sendBeacon');
  const original = (nav as { sendBeacon?: unknown }).sendBeacon;
  delete (nav as { sendBeacon?: unknown }).sendBeacon;

  return {
    get calls(): ReadonlyArray<SendBeaconCall> {
      return calls;
    },
    uninstall(): void {
      if (hadOriginal) {
        (nav as { sendBeacon: unknown }).sendBeacon = original;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// `fetch` double
// ---------------------------------------------------------------------------

export interface FetchCall {
  /** The first argument the transport passed (always a string per D-5). */
  readonly url: string;
  /** The init object the transport passed. */
  readonly init: RequestInit | undefined;
  /** The body coerced to string (`init.body` is a string per D-5). */
  readonly body: string | null;
}

export type FetchDoubleBehavior =
  | { kind: 'resolve'; status?: number /* default 204 */ }
  | { kind: 'reject'; reason?: unknown /* default new TypeError('Failed to fetch') */ }
  | { kind: 'unavailable' /* fetch is undefined on globalThis */ }
  | { kind: 'function'; fn: (url: string, init?: RequestInit) => Promise<Response> | Response };

export interface InstallFetchDoubleOptions {
  behavior?: FetchDoubleBehavior;
}

export interface FetchDoubleController {
  readonly calls: ReadonlyArray<FetchCall>;
  uninstall(): void;
}

export function installFetchDouble(
  options: InstallFetchDoubleOptions = {},
): FetchDoubleController {
  const calls: FetchCall[] = [];
  const behavior: FetchDoubleBehavior = options.behavior ?? { kind: 'resolve' };

  const hadOriginal = Object.prototype.hasOwnProperty.call(globalThis, 'fetch');
  const original = (globalThis as { fetch?: unknown }).fetch;

  if (behavior.kind === 'unavailable') {
    delete (globalThis as { fetch?: unknown }).fetch;
  } else {
    (globalThis as { fetch: (url: string, init?: RequestInit) => Promise<Response> }).fetch = (
      url: string,
      init?: RequestInit,
    ): Promise<Response> => {
      const body = readInitBody(init);
      calls.push({ url, init, body });
      if (behavior.kind === 'resolve') {
        const status = behavior.status ?? 204;
        return Promise.resolve(makeFakeResponse(status));
      }
      if (behavior.kind === 'reject') {
        return Promise.reject(behavior.reason ?? new TypeError('Failed to fetch'));
      }
      // kind: 'function' — passes through user-supplied handler.
      const out = behavior.fn(url, init);
      return out instanceof Promise ? out : Promise.resolve(out);
    };
  }

  return {
    get calls(): ReadonlyArray<FetchCall> {
      return calls;
    },
    uninstall(): void {
      if (hadOriginal) {
        (globalThis as { fetch: unknown }).fetch = original;
      } else {
        delete (globalThis as { fetch?: unknown }).fetch;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// `globalThis.addEventListener` / `removeEventListener` spy
// ---------------------------------------------------------------------------

export interface ListenerRegistration {
  readonly type: string;
  readonly listener: EventListenerOrEventListenerObject;
  readonly options: boolean | AddEventListenerOptions | undefined;
}

export interface AddEventListenerSpyController {
  /** Every `addEventListener` call since install, in order. */
  readonly registrations: ReadonlyArray<ListenerRegistration>;
  /** Every `removeEventListener` call since install, in order. */
  readonly removals: ReadonlyArray<ListenerRegistration>;
  uninstall(): void;
}

export function installAddEventListenerSpy(): AddEventListenerSpyController {
  const registrations: ListenerRegistration[] = [];
  const removals: ListenerRegistration[] = [];

  const originalAdd = globalThis.addEventListener;
  const originalRemove = globalThis.removeEventListener;

  globalThis.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    listenerOptions?: boolean | AddEventListenerOptions,
  ): void => {
    registrations.push({ type, listener, options: listenerOptions });
    originalAdd.call(
      globalThis,
      type,
      listener as EventListener,
      listenerOptions as boolean | AddEventListenerOptions | undefined,
    );
  }) as typeof globalThis.addEventListener;

  globalThis.removeEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    listenerOptions?: boolean | EventListenerOptions,
  ): void => {
    removals.push({ type, listener, options: listenerOptions as AddEventListenerOptions | boolean | undefined });
    originalRemove.call(
      globalThis,
      type,
      listener as EventListener,
      listenerOptions as boolean | EventListenerOptions | undefined,
    );
  }) as typeof globalThis.removeEventListener;

  return {
    get registrations(): ReadonlyArray<ListenerRegistration> {
      return registrations;
    },
    get removals(): ReadonlyArray<ListenerRegistration> {
      return removals;
    },
    uninstall(): void {
      globalThis.addEventListener = originalAdd;
      globalThis.removeEventListener = originalRemove;
    },
  };
}

// ---------------------------------------------------------------------------
// `setTimeout` / `clearTimeout` spy
// ---------------------------------------------------------------------------

export interface TimerCreation {
  readonly id: number;
  readonly delay: number;
}

export interface SetTimeoutSpyController {
  readonly creations: ReadonlyArray<TimerCreation>;
  readonly clears: ReadonlyArray<number>;
  /** Manually fire a recorded timer by index. Returns the fn's return value (typically undefined). */
  fire(creationIndex: number): unknown;
  uninstall(): void;
}

export function installSetTimeoutSpy(): SetTimeoutSpyController {
  const creations: TimerCreation[] = [];
  const clears: number[] = [];
  const callbacks = new Map<number, () => unknown>();
  let nextId = 1;

  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  globalThis.setTimeout = ((handler: TimerHandler, timeout: number = 0): number => {
    const id = nextId++;
    creations.push({ id, delay: timeout });
    callbacks.set(id, () => {
      if (typeof handler === 'function') return handler();
      // String handlers are obsolete; not supported by the spy.
      return undefined;
    });
    return id;
  }) as unknown as typeof globalThis.setTimeout;

  globalThis.clearTimeout = ((id?: number): void => {
    if (id !== undefined) {
      clears.push(id);
      callbacks.delete(id);
    }
  }) as unknown as typeof globalThis.clearTimeout;

  return {
    get creations(): ReadonlyArray<TimerCreation> {
      return creations;
    },
    get clears(): ReadonlyArray<number> {
      return clears;
    },
    fire(creationIndex: number): unknown {
      const creation = creations[creationIndex];
      if (creation === undefined) {
        throw new Error(`installSetTimeoutSpy.fire: no timer at index ${creationIndex}`);
      }
      const cb = callbacks.get(creation.id);
      if (cb === undefined) {
        throw new Error(
          `installSetTimeoutSpy.fire: timer id=${creation.id} was cleared or already fired`,
        );
      }
      callbacks.delete(creation.id);
      return cb();
    },
    uninstall(): void {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ensureNavigator(): Navigator {
  // happy-dom always provides globalThis.navigator; this guard is here in
  // case a future runtime (or a Node-only test) lacks it.
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (nav === undefined) {
    const replacement = {} as Navigator;
    (globalThis as { navigator: Navigator }).navigator = replacement;
    return replacement;
  }
  return nav;
}

function recordBeaconCall(endpoint: string, data?: BodyInit | null): SendBeaconCall {
  if (data === undefined || data === null) {
    return { endpoint, body: null, bodyType: null };
  }
  if (data instanceof Blob) {
    // happy-dom's Blob exposes `.text()` async, but tests run synchronously
    // through the spy. Read via the constructor parts we already know about
    // by leveraging Blob's `type` and storing the inputs at construction.
    // Since we can't await here, we synchronously stringify the Blob via
    // a known-good pathway: FileReaderSync is unavailable, so we rely on
    // the package code always passing a string-source Blob and on the
    // double-recipient calling `toString()` on the result of `_$parts`
    // when available (happy-dom internal). For broad compatibility we
    // fall back to a best-effort coerce.
    const blobAny = data as Blob & { _$parts?: unknown[]; _buffer?: ArrayBuffer };
    if (Array.isArray(blobAny._$parts)) {
      return {
        endpoint,
        body: blobAny._$parts.map((part) => String(part)).join(''),
        bodyType: data.type,
      };
    }
    if (blobAny._buffer instanceof ArrayBuffer) {
      return {
        endpoint,
        body: new TextDecoder().decode(new Uint8Array(blobAny._buffer)),
        bodyType: data.type,
      };
    }
    // Last resort — happy-dom version drift. Tests that depend on body
    // inspection will surface this as a string `[object Blob]`.
    return { endpoint, body: String(data), bodyType: data.type };
  }
  if (typeof data === 'string') {
    return { endpoint, body: data, bodyType: null };
  }
  if (data instanceof ArrayBuffer) {
    return { endpoint, body: new TextDecoder().decode(new Uint8Array(data)), bodyType: null };
  }
  if (ArrayBuffer.isView(data)) {
    return {
      endpoint,
      body: new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
      bodyType: null,
    };
  }
  // FormData / URLSearchParams etc. — the transport contract forbids these,
  // so tests using the double should never pass them.
  return { endpoint, body: String(data), bodyType: null };
}

function readInitBody(init: RequestInit | undefined): string | null {
  if (init === undefined || init.body === undefined || init.body === null) return null;
  if (typeof init.body === 'string') return init.body;
  if (init.body instanceof Blob) return '[Blob]';
  return String(init.body);
}

function makeFakeResponse(status: number): Response {
  // Construct via the standard Response constructor where possible. happy-dom
  // ships a working `Response`; in environments without it we fall back to a
  // duck-typed object.
  const ResponseCtor = (globalThis as { Response?: typeof Response }).Response;
  if (typeof ResponseCtor === 'function') {
    return new ResponseCtor(null, { status });
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: new Map() as unknown as Headers,
    redirected: false,
    type: 'basic',
    url: '',
    body: null,
    bodyUsed: false,
    clone(): Response {
      return this as Response;
    },
    arrayBuffer(): Promise<ArrayBuffer> {
      return Promise.resolve(new ArrayBuffer(0));
    },
    blob(): Promise<Blob> {
      return Promise.resolve(new Blob([]));
    },
    formData(): Promise<FormData> {
      return Promise.resolve(new FormData());
    },
    json(): Promise<unknown> {
      return Promise.resolve(null);
    },
    text(): Promise<string> {
      return Promise.resolve('');
    },
    bytes(): Promise<Uint8Array> {
      return Promise.resolve(new Uint8Array(0));
    },
  } as unknown as Response;
}
