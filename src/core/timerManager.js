import {parseInput} from './parser.js';
import {SignalEmitter} from './signals.js';
import {Timer} from './timer.js';

/** @typedef {{now(): number}} Clock */

/** @type {Clock} */
export const systemClock = Object.freeze({now: () => Date.now()});

/** What the panel button should show; see `TimerManager.summary()`. */
export const SummaryState = Object.freeze({
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    FINISHED: 'finished',
});

const ORDER = {finished: 0, running: 1, paused: 2};

/**
 * Owns every timer. It is the single source of truth: the UI, storage,
 * ticker, notifications and sound all react to its signals.
 *
 * Signals:
 * - `added` (timer), `removed` (timer)
 * - `updated` (timer) - paused or resumed
 * - `finished` (timer) - emitted once per timer, from `update()`
 * - `changed` () - after any of the above; for saving and redrawing
 */
export class TimerManager {
    /** @type {Map<string, Timer>} */
    #timers = new Map();
    #signals;
    #clock;
    #newId;

    /**
     * @param {object} [options]
     * @param {Clock} [options.clock]
     * @param {() => string} [options.newId]
     * @param {(name: string, error: unknown) => void} [options.onSignalError]
     */
    constructor({clock = systemClock, newId, onSignalError} = {}) {
        this.#clock = clock;
        this.#signals = new SignalEmitter({onError: onSignalError});

        let counter = 0;
        this.#newId = newId ??
            (() => `${clock.now().toString(36)}-${(counter++).toString(36)}`);
    }

    connect(name, callback) {
        return this.#signals.connect(name, callback);
    }

    disconnect(id) {
        this.#signals.disconnect(id);
    }

    destroy() {
        this.#signals.disconnectAll();
    }

    now() {
        return this.#clock.now();
    }

    /**
     * Finished timers first (they need attention), then running ones by
     * end time, then paused ones by time left.
     *
     * @returns {Timer[]}
     */
    get timers() {
        const now = this.now();
        return [...this.#timers.values()].sort((a, b) =>
            ORDER[a.state] - ORDER[b.state] ||
            sortKey(a, now) - sortKey(b, now) ||
            a.startedAt - b.startedAt);
    }

    get size() {
        return this.#timers.size;
    }

    /** @param {string} id */
    get(id) {
        return this.#timers.get(id) ?? null;
    }

    /**
     * @param {import('./parser.js').TimerSpec} spec
     * @param {object} [options]
     * @param {string} [options.input] - stored for Recent; defaults to spec text
     * @param {string|null} [options.sound] - null uses the default sound
     * @returns {Timer}
     */
    start(spec, {input, sound = null} = {}) {
        const timer = Timer.create({
            id: this.#newId(),
            spec,
            input: input ?? [spec.timeText, spec.label].filter(Boolean).join(' '),
            sound,
            now: this.now(),
        });
        this.#timers.set(timer.id, timer);
        this.#emit('added', timer);
        return timer;
    }

    /**
     * Parses and starts in one step.
     *
     * @param {string} text
     * @param {{sound?: string|null}} [options]
     * @returns {{ok: true, timer: Timer} | {ok: false, error: string}}
     */
    startFromInput(text, {sound = null} = {}) {
        const result = parseInput(text);
        if (!result.ok)
            return result;
        return {ok: true, timer: this.start(result.spec, {input: text.trim(), sound})};
    }

    /** @param {string} id */
    pause(id) {
        this.update();
        return this.#change(id, timer => timer.pause(this.now()));
    }

    /** @param {string} id */
    resume(id) {
        return this.#change(id, timer => timer.resume(this.now()));
    }

    /**
     * Removes a timer in any state; also how a finished timer is dismissed.
     *
     * @param {string} id
     * @returns {boolean}
     */
    stop(id) {
        const timer = this.#timers.get(id);
        if (!timer)
            return false;
        this.#timers.delete(id);
        this.#emit('removed', timer);
        return true;
    }

    /**
     * Finishes every running timer whose time is up. Call on each tick, and
     * once after `load()` so timers that ended while GNOME Shell was not
     * running are reported.
     *
     * @returns {Timer[]} timers that finished now
     */
    update() {
        const now = this.now();
        const finished = [...this.#timers.values()].filter(t => t.checkFinished(now));
        for (const timer of finished)
            this.#signals.emit('finished', timer);
        if (finished.length > 0)
            this.#signals.emit('changed');
        return finished;
    }

    /**
     * Re-anchors running alarms to their local day and clock time. Call when
     * the time zone changes; alarms whose moment has now passed are finished.
     *
     * @returns {Timer[]} alarms whose end time changed
     */
    retargetAlarms() {
        const changed = [...this.#timers.values()].filter(t => t.retargetAlarm());
        for (const timer of changed)
            this.#signals.emit('updated', timer);
        if (changed.length > 0)
            this.#signals.emit('changed');
        this.update();
        return changed;
    }

    /**
     * Milliseconds until the ticker should wake: when the displayed seconds of
     * the soonest-ending running timer change (or it finishes). Null when
     * nothing runs.
     *
     * Only that timer counts, so the ticker wakes once per second however
     * many timers run (each wakeup costs battery). Other timers end later, so
     * they are never missed; their rows are redrawn on the same ticks.
     *
     * @returns {number|null}
     */
    nextWakeupMs() {
        const now = this.now();
        let soonest = null;
        for (const timer of this.#timers.values()) {
            if (timer.isRunning && (soonest === null || timer.endsAt < soonest.endsAt))
                soonest = timer;
        }
        if (soonest === null)
            return null;
        const remaining = soonest.remainingAt(now);
        return remaining % 1000 || Math.min(remaining, 1000);
    }

    /**
     * What the panel shows: the most important timer, plus how many others.
     * Priority: finished › soonest running › soonest paused.
     *
     * @returns {{state: string, primary: Timer|null, others: number}}
     */
    summary() {
        const [primary] = this.timers;
        if (!primary)
            return {state: SummaryState.IDLE, primary: null, others: 0};
        return {state: primary.state, primary, others: this.size - 1};
    }

    /**
     * Replaces all timers, e.g. with ones restored from settings. Does not
     * emit `added`; emits `changed` once.
     *
     * @param {Timer[]} timers
     */
    load(timers) {
        this.#timers.clear();
        for (const timer of timers)
            this.#timers.set(timer.id, timer);
        this.#signals.emit('changed');
    }

    #change(id, action) {
        const timer = this.#timers.get(id);
        if (!timer || !action(timer))
            return false;
        this.#emit('updated', timer);
        return true;
    }

    #emit(name, timer) {
        this.#signals.emit(name, timer);
        this.#signals.emit('changed');
    }
}

function sortKey(timer, now) {
    if (timer.isFinished)
        return timer.finishedAt;
    return timer.remainingAt(now);
}
