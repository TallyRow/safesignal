/**
 * Host + many module loggers integration test (T063).
 *
 * Locks SC-013: a single `configureLogging()` call by the host
 * application configures one delivery pipeline; many module entry
 * points each call `createLogger({ module })` against that pipeline.
 * Every module's events:
 *   - reach the host-configured transports
 *   - carry a `context.module.name` distinct per module
 *   - carry the host's `context.application.name` on every event
 *   - flow through the host's redactor + sanitizerLimits uniformly
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { configureLogging, createLogger } from '../../src/index.js';
import { clearActiveRuntimeForTests } from '../../src/runtime/runtime-ref.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const HOST_APP = { name: 'checkout-web', version: '2026.05.0' };

beforeEach(() => {
  clearActiveRuntimeForTests();
});

describe('SC-013: host + many module loggers share one delivery pipeline', () => {
  it('100 modules emit through the SAME host-configured transport set', () => {
    const cap = makeCapturingTransport('host-cap');
    configureLogging({
      application: HOST_APP,
      environment: 'development',
      level: 'debug',
      transports: [cap],
    });
    const modules = Array.from({ length: 100 }, (_, i) => `mod-${String(i)}`);
    const loggers = modules.map((name) =>
      createLogger({ module: { name, version: '1.0' } }),
    );
    for (const log of loggers) {
      log.info('module-event', { from: log === undefined ? '' : 'module' });
    }
    expect(cap.calls).toHaveLength(100);
  });

  it('every event carries the HOST application identity', () => {
    const cap = makeCapturingTransport('host-cap');
    configureLogging({
      application: HOST_APP,
      environment: 'development',
      level: 'debug',
      transports: [cap],
    });
    const modA = createLogger({ module: { name: 'mod-a', version: '1' } });
    const modB = createLogger({ module: { name: 'mod-b', version: '2' } });
    const modC = createLogger({ module: { name: 'mod-c', version: '3' } });
    modA.info('a');
    modB.info('b');
    modC.info('c');
    for (const event of cap.calls) {
      expect(event.context.application).toEqual(HOST_APP);
    }
  });

  it('module identity per event is distinct and matches the creating logger', () => {
    const cap = makeCapturingTransport('host-cap');
    configureLogging({
      application: HOST_APP,
      environment: 'development',
      level: 'debug',
      transports: [cap],
    });
    const modA = createLogger({ module: { name: 'mod-a', version: '0.1' } });
    const modB = createLogger({ module: { name: 'mod-b', version: '0.2' } });
    modA.info('from-a');
    modB.info('from-b');
    modA.warn('warn-from-a');

    const aEvents = cap.calls.filter((e) => e.message.endsWith('-a'));
    const bEvents = cap.calls.filter((e) => e.message.endsWith('-b'));

    expect(aEvents).toHaveLength(2);
    expect(bEvents).toHaveLength(1);
    for (const e of aEvents) {
      expect(e.context.module).toEqual({ name: 'mod-a', version: '0.1' });
    }
    for (const e of bEvents) {
      expect(e.context.module).toEqual({ name: 'mod-b', version: '0.2' });
    }
  });

  it("the host's redactor applies UNIFORMLY to every module's events", () => {
    const cap = makeCapturingTransport('host-cap');
    configureLogging({
      application: HOST_APP,
      environment: 'development',
      level: 'debug',
      transports: [cap],
      // Default redactor masks `password`, `token`, `api_key`, etc. —
      // the host installs this once; every module gets the same
      // treatment automatically because they share the runtime.
    });
    const modA = createLogger({ module: { name: 'mod-a', version: '1' } });
    const modB = createLogger({ module: { name: 'mod-b', version: '1' } });

    modA.info('a-event', { password: 'A-secret', api_key: 'A-key' });
    modB.info('b-event', { password: 'B-secret', api_key: 'B-key' });

    expect(cap.calls).toHaveLength(2);
    for (const event of cap.calls) {
      expect(event.attributes.password).toBe('[REDACTED]');
      expect(event.attributes.api_key).toBe('[REDACTED]');
    }
    // Raw values never reach the transport.
    const serialized = JSON.stringify(cap.calls);
    expect(serialized).not.toContain('A-secret');
    expect(serialized).not.toContain('B-secret');
    expect(serialized).not.toContain('A-key');
    expect(serialized).not.toContain('B-key');
  });

  it("the host's sanitizerLimits apply UNIFORMLY to every module's events", () => {
    const cap = makeCapturingTransport('host-cap');
    configureLogging({
      application: HOST_APP,
      environment: 'development',
      level: 'debug',
      transports: [cap],
      sanitizerLimits: { maxStringLength: 64 }, // tight bound
    });
    const modA = createLogger({ module: { name: 'mod-a', version: '1' } });
    const modB = createLogger({ module: { name: 'mod-b', version: '1' } });

    const long = 'x'.repeat(500);
    modA.info('a', { value: long });
    modB.info('b', { value: long });

    expect(cap.calls).toHaveLength(2);
    for (const event of cap.calls) {
      expect(event.attributes.value).toBe('x'.repeat(64) + '...[truncated]');
    }
  });

  it('child loggers derived from module loggers preserve module identity', () => {
    const cap = makeCapturingTransport('host-cap');
    configureLogging({
      application: HOST_APP,
      environment: 'development',
      level: 'debug',
      transports: [cap],
    });
    const modA = createLogger({ module: { name: 'mod-a', version: '1' } });
    const requestLog = modA.child({ attributes: { requestId: 'r-1' } });
    const detailLog = requestLog.child({ attributes: { stage: 'fetch' } });
    detailLog.info('deep');
    const event = cap.calls[0]!;
    expect(event.context.module).toEqual({ name: 'mod-a', version: '1' });
    expect(event.context.application).toEqual(HOST_APP);
    expect(event.context.attributes).toMatchObject({
      requestId: 'r-1',
      stage: 'fetch',
    });
  });

  it('high-volume emission across 50 modules × 20 events keeps attribution stable', () => {
    const cap = makeCapturingTransport('host-cap');
    configureLogging({
      application: HOST_APP,
      environment: 'development',
      level: 'debug',
      transports: [cap],
    });
    const modules = Array.from({ length: 50 }, (_, i) => `mod-${String(i)}`);
    const loggers = modules.map((name) =>
      createLogger({ module: { name, version: '1' } }),
    );
    for (let i = 0; i < 20; i++) {
      for (let m = 0; m < loggers.length; m++) {
        loggers[m]!.info(`event-${String(i)}`, { module_local: m });
      }
    }
    expect(cap.calls).toHaveLength(50 * 20);
    // Spot-check attribution: every event's module.name matches its
    // module_local index.
    for (const event of cap.calls) {
      const moduleLocal = event.attributes.module_local as number;
      const moduleName = event.context.module?.name;
      expect(moduleName).toBe(`mod-${String(moduleLocal)}`);
      expect(event.context.application).toEqual(HOST_APP);
    }
  });
});
