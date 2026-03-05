export class EventEmitter {
    #listeners = new Map();

    on(event, fn) {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, []);
        }
        this.#listeners.get(event).push(fn);
    }

    off(event, fn) {
        const fns = this.#listeners.get(event);
        if (fns) {
            this.#listeners.set(event, fns.filter(f => f !== fn));
        }
    }

    emit(event, ...args) {
        const fns = this.#listeners.get(event);
        if (fns) {
            fns.forEach(fn => fn(...args));
        }
    }
}
