import Gio from 'gi://Gio';

import {SignalEmitter} from '../core/signals.js';

/**
 * Follows the desktop's 12/24-hour clock setting.
 * Signal: `changed` ().
 */
export class ClockFormat {
    #settings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    #signals = new SignalEmitter();
    #changedId;

    constructor() {
        this.#changedId = this.#settings.connect('changed::clock-format',
            () => this.#signals.emit('changed'));
    }

    get use12h() {
        return this.#settings.get_string('clock-format') === '12h';
    }

    connect(name, callback) {
        return this.#signals.connect(name, callback);
    }

    disconnect(id) {
        this.#signals.disconnect(id);
    }

    destroy() {
        this.#settings.disconnect(this.#changedId);
        this.#signals.disconnectAll();
    }
}
