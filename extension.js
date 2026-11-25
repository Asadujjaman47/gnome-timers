import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Formatter} from './src/core/format.js';
import {TimerManager} from './src/core/timerManager.js';
import {AlarmController} from './src/services/alarmController.js';
import {ClockFormat} from './src/services/clockFormat.js';
import {DoNotDisturb} from './src/services/doNotDisturb.js';
import {Keybindings} from './src/services/keybindings.js';
import {Library} from './src/services/library.js';
import {Notifier} from './src/services/notifier.js';
import {SoundPlayer} from './src/services/soundPlayer.js';
import {HOTKEY_SLOTS} from './src/core/presets.js';
import {Keys, Storage, presetHotkeyKey} from './src/services/storage.js';
import {Ticker} from './src/services/ticker.js';
import {TimeZoneWatcher} from './src/services/timeZone.js';
import {ICON_FILE, TimersIndicator} from './src/ui/indicator.js';

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

        this._library = new Library({manager: this._manager, storage});
        this._ticker = new Ticker(this._manager);
        this._indicator = new TimersIndicator({
            extension: this,
            manager: this._manager,
            ticker: this._ticker,
            formatter,
            clockFormat: this._clockFormat,
            library: this._library,
            storage,
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // Alarms keep their local day and clock time when the time zone changes.
        this._timeZone = new TimeZoneWatcher();
        this._timeZoneId = this._timeZone.connect('changed', () => this._manager.retargetAlarms());

        // Keyboard shortcuts exist only while the screen is unlocked.
        this._keybindings = new Keybindings(storage.settings);
        this._sessionModeId = Main.sessionMode.connect('updated', () => this._syncShortcuts());
        this._syncShortcuts();

        // Report timers that finished while the extension was not running.
        this._manager.update();
    }

    _syncShortcuts() {
        if (Main.sessionMode.isLocked) {
            this._keybindings.unbindAll();
            return;
        }
        this._keybindings.bind(Keys.OPEN_MENU_HOTKEY, () => this._indicator.openForInput());
        for (let slot = 1; slot <= HOTKEY_SLOTS; slot++) {
            this._keybindings.bind(presetHotkeyKey(slot),
                () => this._library.startPresetInSlot(slot));
        }
    }

    /*
     * The extension also runs in the "unlock-dialog" session mode because a
     * timer must keep counting, and ring when it finishes, while the screen is
     * locked; if it were disabled on lock, running timers would stop and their
     * alarms would never go off. While locked, nothing can be changed: the
     * panel menu is insensitive (TimersIndicator._syncSensitivity) and the
     * keyboard shortcuts are removed (_syncShortcuts).
     */
    disable() {
        if (this._sessionModeId) {
            Main.sessionMode.disconnect(this._sessionModeId);
            this._sessionModeId = 0;
        }
        this._keybindings?.destroy();
        if (this._timeZoneId)
            this._timeZone.disconnect(this._timeZoneId);
        this._timeZone?.destroy();
        this._indicator?.destroy();
        this._library?.destroy();
        this._ticker?.destroy();
        if (this._saveId)
            this._manager.disconnect(this._saveId);
        this._alarms?.destroy();
        this._notifier?.destroy();
        this._player?.destroy();
        this._manager?.destroy();
        this._clockFormat?.destroy();

        this._keybindings = null;
        this._timeZoneId = 0;
        this._timeZone = null;
        this._indicator = null;
        this._library = null;
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
