import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {TimerRow} from './timerRow.js';

/**
 * The list of active timers in the menu, soonest first. Rows are rebuilt
 * only when the set or order of timers changes; otherwise they are updated
 * in place.
 */
export class TimersSection {
    #manager;
    #formatter;
    /** @type {TimerRow[]} */
    #rows = [];

    /**
     * @param {object} deps
     * @param {import('../core/timerManager.js').TimerManager} deps.manager
     * @param {import('../core/format.js').Formatter} deps.formatter
     */
    constructor({manager, formatter}) {
        this.#manager = manager;
        this.#formatter = formatter;
        this.section = new PopupMenu.PopupMenuSection();
    }

    get isEmpty() {
        return this.#rows.length === 0;
    }

    /** @param {boolean} use12h */
    sync(use12h) {
        const timers = this.#manager.timers;
        const ids = timers.map(t => t.id);
        if (ids.join() !== this.#rows.map(r => r.timerId).join()) {
            this.section.removeAll();
            this.#rows = timers.map(timer =>
                new TimerRow(timer, {manager: this.#manager, formatter: this.#formatter}));
            for (const row of this.#rows)
                this.section.addMenuItem(row);
        }

        const now = this.#manager.now();
        for (const row of this.#rows)
            row.sync(now, use12h);
    }
}
