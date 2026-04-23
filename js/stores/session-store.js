import bus from '../event-bus.js';

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
        bus.emit('connection:changed', connected);
    }

    setSyncStatus(status) {
        if (this.#syncStatus === status) return;
        this.#syncStatus = status;
        bus.emit('syncstatus:changed', status);
    }

    setLastError(message) {
        if (this.#lastError === message) return;
        this.#lastError = message;
        bus.emit('error:changed', message);
    }

    clearLastError() {
        this.setLastError('');
    }

    setUserCount(count) {
        if (this.#userCount === count) return;
        this.#userCount = count;
        bus.emit('usercount:changed', count);
    }
}

export const sessionState = new SessionStore();
