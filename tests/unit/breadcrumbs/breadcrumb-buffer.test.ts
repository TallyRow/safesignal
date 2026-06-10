/**
 * Unit test: BreadcrumbBuffer (specs/016-error-breadcrumbs — BC-2, BC-8).
 */

import { describe, expect, it } from 'vitest';
import {
  BreadcrumbBuffer,
  BREADCRUMBS_KEY,
} from '../../../src/breadcrumbs/breadcrumb-buffer.js';
import type { Attributes, LogEvent } from '../../../src/api/types.js';

function ev(over: Partial<LogEvent> = {}): LogEvent {
  return {
    timestamp: '2026-06-01T00:00:00.000Z',
    level: 'info',
    message: 'm',
    attributes: {},
    context: {},
    ...over,
  };
}

function trailOf(errorEvent: LogEvent) {
  return errorEvent.attributes[BREADCRUMBS_KEY] as unknown as Array<{
    ts: string;
    level: string;
    message: string;
    app?: string;
    module?: string;
    attributes?: Attributes;
  }>;
}

describe('BreadcrumbBuffer', () => {
  it('records snapshots and evicts oldest beyond capacity (≤ N)', () => {
    const buf = new BreadcrumbBuffer(3);
    for (let i = 0; i < 10; i++) buf.record(ev({ message: `m${i}` }));
    const err = ev({ level: 'error', message: 'boom' });
    buf.attachTrailTo(err);
    const trail = trailOf(err);
    expect(trail).toHaveLength(3);
    // oldest→newest: the last three recorded (m7, m8, m9)
    expect(trail.map((b) => b.message)).toEqual(['m7', 'm8', 'm9']);
  });

  it('captures the compact snapshot shape incl. origin (app/module)', () => {
    const buf = new BreadcrumbBuffer(5);
    buf.record(
      ev({
        level: 'warn',
        message: 'hi',
        attributes: { a: 1 },
        context: {
          application: { name: 'app1' },
          module: { name: 'cart' },
        },
      }),
    );
    const err = ev({ level: 'error' });
    buf.attachTrailTo(err);
    expect(trailOf(err)[0]).toEqual({
      ts: '2026-06-01T00:00:00.000Z',
      level: 'warn',
      message: 'hi',
      app: 'app1',
      module: 'cart',
      attributes: { a: 1 },
    });
  });

  it('omits app/module/attributes when absent/empty', () => {
    const buf = new BreadcrumbBuffer(5);
    buf.record(ev({ message: 'bare' }));
    const err = ev({ level: 'error' });
    buf.attachTrailTo(err);
    expect(trailOf(err)[0]).toEqual({
      ts: '2026-06-01T00:00:00.000Z',
      level: 'info',
      message: 'bare',
    });
  });

  it('attachTrailTo is a no-op (no key) when the buffer is empty', () => {
    const buf = new BreadcrumbBuffer(5);
    const err = ev({ level: 'error' });
    buf.attachTrailTo(err);
    expect(err.attributes[BREADCRUMBS_KEY]).toBeUndefined();
  });

  it('snapshot EXCLUDES the breadcrumbs key (anti-nesting, BC-8)', () => {
    const buf = new BreadcrumbBuffer(5);
    // An event that already carries a trail (as a prior error would).
    buf.record(
      ev({
        level: 'error',
        message: 'prior error',
        attributes: {
          keep: 1,
          [BREADCRUMBS_KEY]: [{ message: 'nested' }] as never,
        },
      }),
    );
    const err = ev({ level: 'error' });
    buf.attachTrailTo(err);
    const snap = trailOf(err)[0]!;
    expect(snap.attributes).toEqual({ keep: 1 });
    expect(snap.attributes?.[BREADCRUMBS_KEY]).toBeUndefined();
  });
});
