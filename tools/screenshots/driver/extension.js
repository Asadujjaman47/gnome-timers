/*
 * Development-only helper, run by tools/screenshots/run.sh inside a headless
 * GNOME Shell. It drives the Timers extension (starts timers, opens the
 * menu, switches styles) and saves screenshots to $TIMERS_SCREENSHOT_DIR.
 * It reaches into Timers' private fields on purpose; it is never shipped.
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const TARGET = 'timers@asadujjaman47.github.io';

const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));

export default class ScreenshotDriver extends Extension {
    enable() {
        this._out = GLib.getenv('TIMERS_SCREENSHOT_DIR');
        // This helper is disabled on lock and enabled again on unlock; the
        // scenario that is already running carries on, so start it only once.
        const started = Gio.File.new_for_path(`${this._out}/.started`);
        if (!this._out || started.query_exists(null))
            return;
        started.create(Gio.FileCreateFlags.NONE, null).close(null);
        this._run()
            .catch(e => this._log(`ERROR ${e}\n${e.stack}`))
            .finally(() => this._log('DONE'));
    }

    disable() {}

    _log(text) {
        const file = Gio.File.new_for_path(`${this._out}/driver.log`);
        const stream = file.append_to(Gio.FileCreateFlags.NONE, null);
        stream.write_all(`${text}\n`, null);
        stream.close(null);
    }

    async _shot(name, rect = null) {
        const file = Gio.File.new_for_path(`${this._out}/${name}.png`);
        const stream = file.replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        const shooter = new Shell.Screenshot();
        if (rect)
            await shooter.screenshot_area(rect.x, rect.y, rect.width, rect.height, stream);
        else
            await shooter.screenshot(false, stream);
        stream.close(null);
        this._log(`shot ${name}`);
    }

    async _timers() {
        for (let i = 0; i < 50; i++) {
            const state = Main.extensionManager.lookup(TARGET)?.stateObj;
            if (state?._indicator)
                return state;
            await wait(200);
        }
        throw new Error('Timers extension did not start');
    }

    _menuRect(timers) {
        const actor = timers._indicator.menu.actor;
        const [x, y] = actor.get_transformed_position();
        const [width, height] = actor.get_transformed_size();
        const monitor = Main.layoutManager.primaryMonitor;
        const left = Math.max(0, Math.floor(x) - 16);
        const right = Math.min(monitor.width, Math.ceil(x + width) + 16);
        return {x: left, y: 0, width: right - left, height: Math.ceil(y + height) + 16};
    }

    _panelRect() {
        const monitor = Main.layoutManager.primaryMonitor;
        return {x: monitor.width - 420, y: 0, width: 420, height: Main.panel.height};
    }

    async _run() {
        await wait(1500);
        const timers = await this._timers();
        const {_library: library, _manager: manager, _storage: storage} = timers;
        this._log(`GNOME Shell ${Config.PACKAGE_VERSION}`);

        // Presets, Recent entries and a mix of running timers.
        storage.savePresets([
            {id: 'p1', input: '4m tea', sound: 'bell', hotkeySlot: 1},
            {id: 'p2', input: '@6:30 wake up', sound: null, hotkeySlot: null},
        ]);
        storage.setHotkey('preset-hotkey-1', '<Super><Alt>1');
        for (const input of ['8m eggs', '@1010pm'])
            manager.stop(library.startInput(input).timer.id);
        const inTwoHours = new Date(Date.now() + 2 * 3600 * 1000);
        library.startInput(`@${inTwoHours.getHours()}:${String(inTwoHours.getMinutes()).padStart(2, '0')} meeting`);
        manager.pause(library.startInput('45m laundry').timer.id);
        library.startInput('25m');
        library.startInput('12m pizza');
        await wait(2500);

        const iface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        const a11y = new Gio.Settings({schema_id: 'org.gnome.desktop.a11y.interface'});
        const styles = [
            ['dark', 'prefer-dark', false, 1.0],
            ['light', 'prefer-light', false, 1.0],
            ['high-contrast', 'prefer-dark', true, 1.0],
            ['large-text', 'prefer-dark', false, 1.5],
        ];
        for (const [name, scheme, highContrast, scale] of styles) {
            iface.set_string('color-scheme', scheme);
            a11y.set_boolean('high-contrast', highContrast);
            iface.set_double('text-scaling-factor', scale);
            await wait(1500);
            await this._shot(`panel-${name}`, this._panelRect());
            timers._indicator.menu.open();
            await wait(900);
            await this._shot(`menu-${name}`, this._menuRect(timers));
            timers._indicator.menu.close();
            await wait(500);
        }
        iface.set_string('color-scheme', 'prefer-dark');
        a11y.set_boolean('high-contrast', false);
        iface.set_double('text-scaling-factor', 1.0);
        await wait(1000);

        // Typing in the input shows the live preview.
        timers._indicator.menu.open();
        await wait(600);
        timers._indicator._input._entry.set_text('@1010pm call mom');
        await wait(300);
        await this._shot('menu-typing', this._menuRect(timers));
        timers._indicator._input._entry.set_text('pizza');
        await wait(300);
        await this._shot('menu-typing-error', this._menuRect(timers));
        timers._indicator._input._entry.set_text('');
        timers._indicator.menu.close();
        await wait(500);

        // A finished timer: notification banner.
        library.startInput('2s tea');
        await wait(3500);
        const monitor = Main.layoutManager.primaryMonitor;
        await this._shot('notification', {x: monitor.width / 2 - 320, y: 0, width: 640, height: 180});

        // "Repeat until stopped": the timer keeps ringing in the panel.
        storage.loopSound = true;
        library.startInput('2s');
        await wait(3500);
        await this._shot('panel-ringing', this._panelRect());
        for (const timer of manager.timers.filter(t => t.isFinished))
            manager.stop(timer.id);
        storage.loopSound = false;

        // Lock screen: shortcuts must be removed and the menu insensitive.
        // removeKeybinding() leaves the entry with ActionMode.NONE.
        const bound = () => Object.entries(Main.wm._allowedKeybindings ?? {})
            .filter(([key, modes]) => modes !== Shell.ActionMode.NONE &&
                (key === 'open-menu-hotkey' || key.startsWith('preset-hotkey-')));
        this._log(`shortcuts before lock: ${bound().length}`);
        if (Main.screenShield) {
            Main.screenShield.lock(false);
            await wait(2500);
            this._log(`locked: ${Main.sessionMode.isLocked}, shortcuts while locked: ${bound().length}, ` +
                `indicator reactive: ${timers._indicator.reactive}`);
            Main.screenShield.deactivate(false);
            await wait(2500);
            this._log(`unlocked: ${!Main.sessionMode.isLocked}, shortcuts after unlock: ${bound().length}`);
        }

        // Preferences window.
        timers.openPreferences();
        await wait(5000);
        await this._shot('prefs');
    }
}
