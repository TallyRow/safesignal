/**
 * Lazy lifecycle helper for the beacon transport's `pagehide` handler.
 *
 * Per FR-008 and contract D-10, the transport MUST NOT attach any
 * global listener at construction time. The `pagehide` listener
 * attaches on the first `send()` call that proceeds past the payload
 * size check, and detaches on `shutdown()`. This module supplies the
 * install/uninstall primitives; the caller (the transport factory)
 * owns the `installed` flag that gates against double-install.
 *
 * Why a separate module: keeps `beacon-transport.ts` focused on the
 * delivery policy, and makes the `globalThis.addEventListener`
 * boundary easy to spy on in tests.
 *
 * Boundary discipline (TB-11): zero imports from anywhere in `src/`,
 * zero vendor-SDK imports. The module is import-pure — no side effects
 * at module-evaluation time.
 *
 * Specs: `specs/002-beacon-transport/contracts/delivery.md` D-10;
 * `specs/002-beacon-transport/research.md` §3.
 */

/**
 * Install a `pagehide` listener on the global event target if one is
 * available, returning an `uninstall()` function that removes exactly
 * that listener.
 *
 * If `globalThis.addEventListener` is not a function (vanishingly rare
 * outside of bare Node-like runtimes), this function is a no-op and
 * returns a no-op uninstaller. The caller's `installed` flag is the
 * authoritative single-install guard — this module does NOT track
 * installation state itself.
 *
 * Uninstall is idempotent at the DOM level: calling `removeEventListener`
 * a second time after the handler is already detached is a no-op
 * specified by the DOM standard.
 */
export function installPagehideHandler(handler: () => void): () => void {
  const target = globalThis as {
    addEventListener?: typeof globalThis.addEventListener;
    removeEventListener?: typeof globalThis.removeEventListener;
  };
  if (typeof target.addEventListener !== 'function') {
    return noopUninstall;
  }
  target.addEventListener('pagehide', handler);
  return (): void => {
    if (typeof target.removeEventListener === 'function') {
      target.removeEventListener('pagehide', handler);
    }
  };
}

function noopUninstall(): void {
  // intentionally empty
}
