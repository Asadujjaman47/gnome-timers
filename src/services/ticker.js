import GLib from 'gi://GLib';

import {SignalEmitter} from '../core/signals.js';

/** Wake a little after the second boundary, never just before it. */
const SLACK_MS = 10;

/**
 * Drives the timers: wakes exactly when a running timer's displayed second
 * changes, calls `manager.update()`, and emits `tick`. With no running
 * timers it schedules nothing at all.
 *
 * Signal: `tick` ().
 */
export class Ticker {
    #manager;
    #signals = new SignalEmitter();
    #changedId;
    #sourceId = 0;

    /** @param {import('../core/timerManager.js').TimerManager} manager */
    constructor(manager) {
        this.#manager = manager;
        this.#changedId = manager.connect('changed', () => this.#schedule());
        this.#schedule();
    }

    connect(name, callback) {
        return this.#signals.connect(name, callback);
    }

    disconnect(id) {
        this.#signals.disconnect(id);
    }

    destroy() {
        this.#cancel();
        this.#manager.disconnect(this.#changedId);
        this.#signals.disconnectAll();
    }

    #schedule() {
        this.#cancel();
        const wait = this.#manager.nextWakeupMs();
        if (wait === null)
            return;
        this.#sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, wait + SLACK_MS, () => {
            this.#sourceId = 0;
            this.#tick();
            return GLib.SOURCE_REMOVE;
        });
    }

    #cancel() {
        if (this.#sourceId) {
            GLib.source_remove(this.#sourceId);
            this.#sourceId = 0;
        }
    }

    #tick() {
        this.#manager.update();
        this.#signals.emit('tick');
        this.#schedule();
    }
}
