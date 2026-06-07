# Quickstart: catch Vue errors — `./framework-vue` subpath

> Opt-in Vue 3 adapter. The **no-globals, per-app counterpart** to `./capture`: it routes Vue
> component-tree errors through your existing `Logger` and patches nothing. `vue` is a peer dependency
> (`>=3.0.0`); the core and every other subpath stay Vue-free.

## 1. App-wide capture (idiomatic plugin)

```ts
import { createApp } from 'vue';
import { createLogger } from '@tallyrow/safesignal';
import { safesignalErrorHandler } from '@tallyrow/safesignal/framework-vue';
import App from './App.vue';

const logger = createLogger({ name: 'my-app' });

createApp(App)
  .use(safesignalErrorHandler, { logger }) // sets app.config.errorHandler + provides the logger
  .mount('#app');
```

A framework error (render / lifecycle / watcher / template handler) now emits one `error`-level event
through your `Logger` — redacted and sanitized like any log — with `safesignal.source:
'vue-error-handler'` plus best-effort `safesignal.vue.info` / `safesignal.vue.componentName`.

### Prefer wiring it yourself? Use the factory

```ts
import { createErrorHandler } from '@tallyrow/safesignal/framework-vue';

const app = createApp(App);
app.config.errorHandler = createErrorHandler(logger); // side-effect-free; compose with your own handler
app.provide(loggerKey, logger);                        // optional: so composables resolve the logger
```

## 2. Report errors Vue can't catch — `useLogError()`

```ts
import { useLogError } from '@tallyrow/safesignal/framework-vue';

const logError = useLogError(); // resolves the provided logger (or pass one explicitly)

async function onClick() {
  try {
    await risky();
  } catch (e) {
    logError(e, { op: 'risky-click' }); // safesignal.source: 'vue-use-log-error'
  }
}
```

The callback is stable across re-renders and is a safe no-op if no logger is resolvable.

## 3. Contain a subtree — `useErrorCapture()`

```ts
import { ref } from 'vue';
import { useErrorCapture } from '@tallyrow/safesignal/framework-vue';

// in a wrapper component's setup()
const failed = ref(false);
useErrorCapture({
  onError: () => { failed.value = true; }, // render a fallback; logging already happened
});
// descendant errors are logged once (safesignal.source: 'vue-error-captured') and, by default,
// do NOT also reach the app-level handler. Pass { propagate: true } to keep bubbling.
```

## When something fails

- **No logger resolvable** → every entry point is a safe no-op (nothing emitted, nothing thrown).
- **A secret in the error** → masked (or the event dropped) by the pipeline before any transport.
- **Logging or your `onError` throws** → swallowed; your app keeps running, the original error is not
  escalated.

## Verify (acceptance)

```bash
npm run build                                                  # emits dist/framework-vue.{mjs,cjs,d.ts}
npm run verify                                                 # build → typecheck → lint → format:check → test → api:check
npm run surface:check                                          # distributed-surface parity incl. ./framework-vue
npm test -- tests/contract/framework-vue.contract.test.ts      # API + emission contract
```

Expected: a Vue render crash is delivered as a redacted `error` event; a boundary logs once and stops
propagation by default; a throwing logger never breaks the app; `dist/index.*` contains no Vue and the
Vue subpath bundle externalizes `vue`.
