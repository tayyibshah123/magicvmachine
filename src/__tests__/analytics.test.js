// Analytics service — schema validation + ring buffer behavior.

import { describe, it, expect, beforeEach } from 'vitest';
import { Analytics } from '../services/analytics.js';

beforeEach(() => {
    localStorage.clear();
    // Reset the module state between tests by re-initialising.
    Analytics._buffer.length = 0;
    Analytics._sinks.length = 0;
    Analytics._sessionId = 'test';
    Analytics._enabled = true;
});

describe('Analytics', () => {
    it('emits a known event verbatim', () => {
        Analytics.emit('run_start', { class: 'tactician' });
        expect(Analytics._buffer.at(-1).name).toBe('run_start');
        expect(Analytics._buffer.at(-1).props.class).toBe('tactician');
    });

    it('tags unknown events with unknown_event', () => {
        Analytics.emit('this_is_not_in_schema', { x: 1 });
        const last = Analytics._buffer.at(-1);
        expect(last.name).toBe('unknown_event');
        expect(last.originalName).toBe('this_is_not_in_schema');
    });

    it('buffers up to 500 events', () => {
        for (let i = 0; i < 600; i++) Analytics.emit('run_start', { i });
        expect(Analytics._buffer.length).toBe(500);
        // oldest one should have been dropped
        expect(Analytics._buffer[0].props.i).toBe(100);
    });

    it('skips emission when disabled', () => {
        Analytics.setEnabled(false);
        Analytics.emit('run_start', { class: 'x' });
        expect(Analytics._buffer.length).toBe(0);
    });
});
