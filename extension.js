import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Formatter} from './src/core/format.js';
import {TimerManager} from './src/core/timerManager.js';
import {AlarmController} from './src/services/alarmController.js';
import {ClockFormat} from './src/services/clockFormat.js';
import {DoNotDisturb} from './src/services/doNotDisturb.js';
import {Keybindings} from './src/services/keybindings.js';
import {Notifier} from './src/services/notifier.js';
import {SoundPlayer} from './src/services/soundPlayer.js';
import {Keys, Storage} from './src/services/storage.js';
import {Ticker} from './src/services/ticker.js';
import {ICON_FILE, TimersIndicator} from './src/ui/indicator.js';

/*
 * Session modes: this extension also runs in "unlock-dialog" mode so that
 * timers keep counting and alarms ring while the screen is locked. While
 * locked, the indicator is display-only: its menu is made insensitive
 * (see TimersIndicator._syncSensitivity) and the keyboard shortcut is only
 * active in the normal session and the overview, so nothing can be changed
 * or opened from the lock screen.
 */
export default class TimersExtension extends Extension {
    enable() {
        const storage = new Storage(this.getSettings());
        const formatter = new Formatter({gettext: text => this.gettext(text)});
        const icon = Gio.icon_new_for_string(`${this.path}/${ICON_FILE}`);

        this._storage = storage;
        this._clockFormat = new ClockFormat();
        this._manager = new TimerManager({
            onSignalError: (name, e) => console.error(`Timers: "${name}" handler failed`, e),
        });
        this._saveId = this._manager.connect('changed',
            () => storage.saveTimers(this._manager.timers));
        // Finished timers were already announced, and nothing rings for them
        // after a restart, so only running and paused timers are restored.
        this._manager.load(storage.loadTimers().filter(timer => !timer.isFinished));

        this._player = new SoundPlayer();
        this._notifier = new Notifier({
            icon,
            onDismissed: id => this._manager.stop(id),
        });
        this._alarms = new AlarmController({
            manager: this._manager,
            notifier: this._notifier,
            player: this._player,
            storage,
            dnd: new DoNotDisturb(),
            formatter,
            clockFormat: this._clockFormat,
            extensionDir: this.dir,
        });

        this._ticker = new Ticker(this._manager);
        this._indicator = new TimersIndicator({
            extension: this,
            manager: this._manager,
            ticker: this._ticker,
            formatter,
            clockFormat: this._clockFormat,
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._keybindings = new Keybindings(storage.settings);
        this._keybindings.bind(Keys.OPEN_MENU_HOTKEY, () => this._indicator.openForInput());

        // Report timers that finished while the extension was not running.
        this._manager.update();
    }

    disable() {
        this._keybindings?.destroy();
        this._indicator?.destroy();
        this._ticker?.destroy();
        if (this._saveId)
            this._manager.disconnect(this._saveId);
        this._alarms?.destroy();
        this._notifier?.destroy();
        this._player?.destroy();
        this._manager?.destroy();
        this._clockFormat?.destroy();

        this._keybindings = null;
        this._indicator = null;
        this._ticker = null;
        this._saveId = 0;
        this._alarms = null;
        this._notifier = null;
        this._player = null;
        this._manager = null;
        this._clockFormat = null;
        this._storage = null;
    }
}
