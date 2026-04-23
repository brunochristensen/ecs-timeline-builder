import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import bus from '../client/event-bus.js';
import { sessionState } from '../client/stores/session-store.js';

describe('SessionStore', () => {
    beforeEach(() => {
        sessionState.setConnected(false);
        sessionState.setSyncStatus('disconnected');
        sessionState.clearLastError();
        sessionState.setUserCount(0);
    });

    it('tracks connected state and emits connection:changed', () => {
        let received = null;
        const listener = (value) => {
            received = value;
        };

        bus.on('connection:changed', listener);
        sessionState.setConnected(true);

        assert.strictEqual(sessionState.connected, true);
        assert.strictEqual(received, true);

        bus.off('connection:changed', listener);
    });

    it('tracks sync status and emits syncstatus:changed', () => {
        let received = null;
        const listener = (value) => {
            received = value;
        };

        bus.on('syncstatus:changed', listener);
        sessionState.setSyncStatus('reconnecting');

        assert.strictEqual(sessionState.syncStatus, 'reconnecting');
        assert.strictEqual(received, 'reconnecting');

        bus.off('syncstatus:changed', listener);
    });

    it('tracks last error and can clear it', () => {
        sessionState.setLastError('Sync failed');

        assert.strictEqual(sessionState.lastError, 'Sync failed');

        sessionState.clearLastError();
        assert.strictEqual(sessionState.lastError, '');
    });

    it('tracks user count and emits usercount:changed', () => {
        let received = null;
        const listener = (value) => {
            received = value;
        };

        bus.on('usercount:changed', listener);
        sessionState.setUserCount(3);

        assert.strictEqual(sessionState.userCount, 3);
        assert.strictEqual(received, 3);

        bus.off('usercount:changed', listener);
    });
});

