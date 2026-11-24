import {
    DATA_VERSION, decodePresets, decodeRecent, decodeTimers, encodePresets, encodeRecent,
    encodeTimers, migrate, parseList,
} from '../core/serialization.js';
import {HOTKEY_SLOTS} from '../core/presets.js';
import {DEFAULT_SOUND, isValidSound} from '../core/sound.js';

/** GSettings keys; see schemas/org.gnome.shell.extensions.timers.gschema.xml. */
export const Keys = Object.freeze({
    DATA_VERSION: 'data-version',
    TIMERS: 'timers',
    PRESETS: 'presets',
    RECENT: 'recent',
    DEFAULT_SOUND: 'default-sound',
    LOOP_SOUND: 'loop-sound',
    SILENCE_IN_DND: 'silence-in-dnd',
    RECENT_SIZE: 'recent-size',
    OPEN_MENU_HOTKEY: 'open-menu-hotkey',
});

/** @param {number} slot - 1…9 */
export const presetHotkeyKey = slot => `preset-hotkey-${slot}`;

/** Every settings key that holds a keyboard shortcut. */
export const HOTKEY_KEYS = Object.freeze([
    Keys.OPEN_MENU_HOTKEY,
    ...Array.from({length: HOTKEY_SLOTS}, (_, i) => presetHotkeyKey(i + 1)),
]);

/**
 * Typed access to the extension's settings. Used by both the extension and
 * the preferences window (it only depends on Gio.Settings).
 */
export class Storage {
    #settings;

    /** @param {import('gi://Gio').default.Settings} settings */
    constructor(settings) {
        this.#settings = settings;
        this.#migrate();
    }

    /** The underlying Gio.Settings, for bindings and keybindings. */
    get settings() {
        return this.#settings;
    }

    /**
     * @param {string} key
     * @param {() => void} callback
     * @returns {number} handler id for `disconnect()`
     */
    connectChanged(key, callback) {
        return this.#settings.connect(`changed::${key}`, () => callback());
    }

    /** @param {number} id */
    disconnect(id) {
        this.#settings.disconnect(id);
    }

    /** @returns {import('../core/timer.js').Timer[]} */
    loadTimers() {
        return this.#decode(Keys.TIMERS, decodeTimers);
    }

    /** @param {import('../core/timer.js').Timer[]} timers */
    saveTimers(timers) {
        this.#settings.set_string(Keys.TIMERS, encodeTimers(timers));
    }

    /** @returns {import('../core/presets.js').Preset[]} */
    loadPresets() {
        return this.#decode(Keys.PRESETS, decodePresets);
    }

    /** @param {import('../core/presets.js').Preset[]} presets */
    savePresets(presets) {
        this.#settings.set_string(Keys.PRESETS, encodePresets(presets));
    }

    /** @returns {import('../core/recent.js').RecentEntry[]} */
    loadRecent() {
        return this.#decode(Keys.RECENT, decodeRecent);
    }

    /** @param {import('../core/recent.js').RecentEntry[]} recent */
    saveRecent(recent) {
        this.#settings.set_string(Keys.RECENT, encodeRecent(recent));
    }

    /** A built-in sound id or file:// URI; invalid values give the default. */
    get defaultSound() {
        const value = this.#settings.get_string(Keys.DEFAULT_SOUND);
        return isValidSound(value) ? value : DEFAULT_SOUND;
    }

    set defaultSound(value) {
        if (!isValidSound(value))
            throw new Error(`Invalid sound: ${value}`);
        this.#settings.set_string(Keys.DEFAULT_SOUND, value);
    }

    get loopSound() {
        return this.#settings.get_boolean(Keys.LOOP_SOUND);
    }

    set loopSound(value) {
        this.#settings.set_boolean(Keys.LOOP_SOUND, value);
    }

    get silenceInDnd() {
        return this.#settings.get_boolean(Keys.SILENCE_IN_DND);
    }

    get recentSize() {
        return this.#settings.get_int(Keys.RECENT_SIZE);
    }

    /**
     * @param {string} key - e.g. Keys.OPEN_MENU_HOTKEY
     * @returns {string} accelerator, or '' when unset
     */
    getHotkey(key) {
        return this.#settings.get_strv(key)[0] ?? '';
    }

    /**
     * @param {string} key
     * @param {string} accelerator - '' clears it
     */
    setHotkey(key, accelerator) {
        // A shortcut can only do one thing: take it away from other actions.
        if (accelerator) {
            for (const other of HOTKEY_KEYS) {
                if (other !== key && this.getHotkey(other) === accelerator)
                    this.#settings.set_strv(other, []);
            }
        }
        this.#settings.set_strv(key, accelerator ? [accelerator] : []);
    }

    #decode(key, decode) {
        const {items, dropped} = decode(parseList(this.#settings.get_string(key)));
        if (dropped > 0)
            console.warn(`Timers: ignored ${dropped} invalid entr${dropped === 1 ? 'y' : 'ies'} in "${key}"`);
        return items;
    }

    #migrate() {
        const version = this.#settings.get_int(Keys.DATA_VERSION);
        if (version >= DATA_VERSION)
            return;

        const data = migrate({
            timers: parseList(this.#settings.get_string(Keys.TIMERS)),
            presets: parseList(this.#settings.get_string(Keys.PRESETS)),
            recent: parseList(this.#settings.get_string(Keys.RECENT)),
        }, version);
        this.#settings.set_string(Keys.TIMERS, JSON.stringify(data.timers));
        this.#settings.set_string(Keys.PRESETS, JSON.stringify(data.presets));
        this.#settings.set_string(Keys.RECENT, JSON.stringify(data.recent));
        this.#settings.set_int(Keys.DATA_VERSION, DATA_VERSION);
    }
}
