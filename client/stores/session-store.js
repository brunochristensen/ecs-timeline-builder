import bus from '../event-bus.js';
import {EVENTS} from '../events.js';

/**
 * Client-side session store for transport and sync lifecycle state.
 * Keeps connection concerns separate from timeline/domain data.
 */
class SessionStore {
    #connected = false;
    #syncStatus = 'disconnected';
    #lastError = '';
    #userCount = 0;

    get connected() {
        return this.#connected;
    }

    get syncStatus() {
        return this.#syncStatus;
    }

    get lastError() {
        return this.#lastError;
    }

    get userCount() {
        return this.#userCount;
    }

    setConnected(connected) {
        if (this.#connected === connected) return;
        this.#connected = connected;
        bus.emit(EVENTS.CONNECTION_CHANGED, connected);
    }

    setSyncStatus(status) {
        if (this.#syncStatus === status) return;
        this.#syncStatus = status;
        bus.emit(EVENTS.SYNCSTATUS_CHANGED, status);
    }

    setLastError(message) {
        if (this.#lastError === message) return;
        this.#lastError = message;
        bus.emit(EVENTS.ERROR_CHANGED, message);
    }

    clearLastError() {
        this.setLastError('');
    }

    setUserCount(count) {
        if (this.#userCount === count) return;
        this.#userCount = count;
        bus.emit(EVENTS.USERCOUNT_CHANGED, count);
    }
}

export const sessionState = new SessionStore();
