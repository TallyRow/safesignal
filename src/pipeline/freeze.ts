import type { PipelineStage } from './dispatcher.js';

export const freezeInDev: PipelineStage = (event, _config) => {
  if (!__DEV__) return event;
  deepFreeze(event);
  return event;
};

function deepFreeze(value: object): void {
  if (Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== null && typeof child === 'object') {
      deepFreeze(child);
    }
  }
}
