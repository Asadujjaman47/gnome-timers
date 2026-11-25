import GnomeDesktop from 'gi://GnomeDesktop';
import System from 'system';

import {SignalEmitter} from '../core/signals.js';

/**
 * Notices system time zone changes (Settings → Date & Time, or automatic
 * time zone while travelling), the same way GNOME Shell's clock does.
 *
 * Signal: `changed` () - emitted after JavaScript dates use the new zone.
 */
export class TimeZoneWatcher {
    #clock = new GnomeDesktop.WallClock();
    #signals = new SignalEmitter();
    #notifyId;

    constructor() {
        this.#notifyId = this.#clock.connect('notify::timezone', () => {
            // SpiderMonkey caches the local time zone; reset it first, like
            // GNOME Shell does, or Date would still use the old zone.
            System.clearDateCaches();
            this.#signals.emit('changed');
        });
    }

    connect(name, callback) {
        return this.#signals.connect(name, callback);
    }

    disconnect(id) {
        this.#signals.disconnect(id);
    }

    destroy() {
        this.#clock.disconnect(this.#notifyId);
        this.#clock = null;
        this.#signals.disconnectAll();
    }
}
