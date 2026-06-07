/**
 * Minimal Vue mount helper for the `./framework-vue` tests.
 *
 * Tests use raw `vue` `createApp(...).mount(container)` into the happy-dom
 * environment — no `@vue/test-utils` dependency (Principle VI). The `configure`
 * callback runs after `createApp` and before `mount`, so a test can set
 * `app.config.errorHandler`, `app.use(...)`, or `app.provide(...)`.
 *
 * Vue routes render/lifecycle errors through its own error handling and does NOT
 * re-throw them out of `mount()`, so mounting a throwing component never throws
 * here — the error reaches `app.config.errorHandler` / `onErrorCaptured` instead.
 */

import { type App, type Component, createApp } from 'vue';

export interface MountedVue {
  readonly app: App;
  readonly container: HTMLElement;
  unmount(): void;
}

/** Create an app from `root`, run `configure(app)`, mount into a fresh container. */
export function mountVue(
  root: Component,
  configure?: (app: App) => void,
): MountedVue {
  const app = createApp(root);
  configure?.(app);
  const container = document.createElement('div');
  document.body.appendChild(container);
  app.mount(container);
  return {
    app,
    container,
    unmount(): void {
      app.unmount();
      container.remove();
    },
  };
}
