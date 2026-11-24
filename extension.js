import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {TimersIndicator} from './src/ui/indicator.js';

/*
 * Session modes: this extension also runs in "unlock-dialog" mode so that
 * timers keep counting and alarms ring while the screen is locked. While
 * locked, the indicator is display-only: its menu is made insensitive
 * (see TimersIndicator._syncSensitivity), so nothing can be changed or opened
 * from the lock screen.
 */
export default class TimersExtension extends Extension {
    enable() {
        this._indicator = new TimersIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
