/**
 * Minimal event emitter for core objects.
 *
 * Mirrors the GObject `connect` / `disconnect` style used elsewhere in GNOME
 * Shell, but has no GNOME dependencies so it can be unit-tested.
 */
export class SignalEmitter {
    /** @type {Map<number, {name: string, callback: Function}>} */
    #handlers = new Map();
    #nextId = 1;
    #onError;

    /**
     * @param {object} [options]
     * @param {(name: string, error: unknown) => void} [options.onError] -
     *   called when a handler throws; defaults to logging with console.error
     */
    constructor({onError} = {}) {
        this.#onError = onError ??
            ((name, e) => console.error(`Timers: handler for "${name}" failed`, e));
    }

    /**
     * @param {string} name - signal name
     * @param {Function} callback - called with the emitted arguments
     * @returns {number} handler id, for `disconnect()`
     */
    connect(name, callback) {
        if (typeof callback !== 'function')
            throw new TypeError('callback must be a function');

        const id = this.#nextId++;
        this.#handlers.set(id, {name, callback});
        return id;
    }

    /**
     * @param {number} id - id returned by `connect()`
     */
    disconnect(id) {
        this.#handlers.delete(id);
    }

    disconnectAll() {
        this.#handlers.clear();
    }

    /**
     * Calls every handler connected to `name`, in connection order. A handler
     * that throws is reported to `onError` and does not stop the remaining
     * handlers.
     *
     * @param {string} name - signal name
     * @param {...any} args - passed to each handler
     */
    emit(name, ...args) {
        // Copy first, so handlers may connect/disconnect while we iterate.
        const handlers = [...this.#handlers.values()].filter(h => h.name === name);
        for (const {callback} of handlers) {
            try {
                callback(...args);
            } catch (e) {
                this.#onError(name, e);
            }
        }
    }
}
