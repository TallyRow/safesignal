/**
 * Minimal React mount helper for the `./framework-react` tests.
 *
 * Tests are authored with `createElement` (no JSX) to match the subpath's own
 * no-JSX authoring and avoid adding a `jsx` option to the shared tsconfig.
 * React is rendered into the happy-dom environment via `react-dom/client`
 * `createRoot`, flushed with `act`.
 */

import { act } from 'react';
import type { ReactElement } from 'react';
import { type Root, createRoot } from 'react-dom/client';

export interface Mounted {
  readonly container: HTMLElement;
  readonly root: Root;
  /** Re-render with a new element (e.g., to change resetKeys). */
  rerender(element: ReactElement): void;
  unmount(): void;
}

/** Render `element` into a fresh detached container and flush synchronously. */
export function mount(element: ReactElement): Mounted {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return {
    container,
    root,
    rerender(next: ReactElement): void {
      act(() => {
        root.render(next);
      });
    },
    unmount(): void {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}
