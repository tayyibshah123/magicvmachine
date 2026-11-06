// Analytics service — schema validation + ring buffer behavior.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Analytics } from '../services/analytics.js';

beforeEach(() => {
    localStorage.clear();
    // Reset the module state between tests by re-initialising.
    Analytics._buffer.length = 0;
    Analytics._sinks.length = 0;
    Analytics._sessionId = 'test';
    Analytics._enabled = true;
    vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
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
        expect(localStorage.getItem('mvm_analytics_install')).toBeNull();
    });

    it('isolates a failing sink so later sinks still receive the event', () => {
        const received = vi.fn();
        Analytics.addSink(() => { throw new Error('broken optional sink'); });
        Analytics.addSink(received);
        expect(() => Analytics.emit('combat_start', { sector: 2 })).not.toThrow();
        expect(received).toHaveBeenCalledWith(expect.objectContaining({ name: 'combat_start', props: { sector: 2 } }));
        expect(Analytics.recent(1)).toHaveLength(1);
    });

    it('keeps recording in memory when install ID storage is unavailable', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
        expect(() => Analytics.emit('run_start')).not.toThrow();
        expect(Analytics.recent(1)[0]).toMatchObject({ name: 'run_start', sid: 'test' });
    });

    it('persists at most the last fifty events on pagehide', () => {
        const listen = vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
        Analytics.init();
        for (let i = 0; i < 60; i++) Analytics.emit('combat_end', { i });
        const pagehide = listen.mock.calls.find(([name]) => name === 'pagehide')[1];
        pagehide();
        const saved = JSON.parse(localStorage.getItem('mvm_analytics_lastbuffer'));
        expect(saved).toHaveLength(50);
        expect(saved[0]).toMatchObject({ name: 'combat_end', props: { i: 11 } });
        expect(saved.at(-1).name).toBe('session_end');
    });

    it('returns an independent recent-event list and rethrows reported client errors', () => {
        Analytics.emit('run_start');
        const recent = Analytics.recent();
        recent.pop();
        expect(Analytics.recent()).toHaveLength(1);
        const failure = new Error('example failure');
        expect(() => Analytics.wrap('roll', () => { throw failure; })()).toThrow(failure);
        expect(Analytics.recent(1)[0]).toMatchObject({ name: 'error_client', props: { where: 'roll', message: 'example failure' } });
    });
});
