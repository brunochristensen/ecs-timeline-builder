/**
 * Minimal browser-compatible EventEmitter.
 * Provides on/off/emit for decoupled pub-sub within the client.
 */
export class EventEmitter {
    #listeners = new Map();

    /**
     * Register a listener for the given event name.
     *
     * @param {string} event - Event name
     * @param {Function} fn - Callback to invoke when the event is emitted
     */
    on(event, fn) {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, []);
        }
        this.#listeners.get(event).push(fn);
    }

    /**
     * Remove a previously registered listener.
     *
     * @param {string} event - Event name
     * @param {Function} fn - The exact function reference passed to `on()`
     */
    off(event, fn) {
        const fns = this.#listeners.get(event);
        if (fns) {
            this.#listeners.set(event, fns.filter(f => f !== fn));
        }
    }

    /**
     * Emit an event, invoking all registered listeners with the supplied arguments.
     *
     * @param {string} event - Event name
     * @param {...*} args - Arguments forwarded to each listener
     */
    emit(event, ...args) {
        const fns = this.#listeners.get(event);
        if (fns) {
            fns.forEach(fn => fn(...args));
        }
    }
}
