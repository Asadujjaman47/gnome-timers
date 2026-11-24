import {parseInput} from '../core/parser.js';
import {addPreset, createPreset, newPresetId, presetForSlot} from '../core/presets.js';
import {addRecent, sameInput, visibleRecent} from '../core/recent.js';
import {SignalEmitter} from '../core/signals.js';
import {Keys} from './storage.js';

/**
 * Starts timers and keeps the presets and the Recent list.
 *
 * - Timers typed in the input or restarted from Recent go to the top of
 *   Recent. Timers started from a preset do not (presets have their own
 *   section, so they would only show up twice).
 * - Presets are edited in the preferences window (another process), so
 *   they are re-read whenever the setting changes.
 *
 * Signal: `changed` () - presets, Recent or the Recent size changed.
 */
export class Library {
    #manager;
    #storage;
    #signals = new SignalEmitter();
    #settingIds = [];
    /** @type {import('../core/presets.js').Preset[]} */
    #presets;
    /** @type {import('../core/recent.js').RecentEntry[]} */
    #recent;

    /**
     * @param {object} deps
     * @param {import('../core/timerManager.js').TimerManager} deps.manager
     * @param {import('./storage.js').Storage} deps.storage
     */
    constructor({manager, storage}) {
        this.#manager = manager;
        this.#storage = storage;
        this.#presets = storage.loadPresets();
        this.#recent = storage.loadRecent();

        this.#settingIds = [
            storage.connectChanged(Keys.PRESETS, () => {
                this.#presets = storage.loadPresets();
                this.#signals.emit('changed');
            }),
            storage.connectChanged(Keys.RECENT, () => {
                this.#recent = storage.loadRecent();
                this.#signals.emit('changed');
            }),
            storage.connectChanged(Keys.RECENT_SIZE, () => this.#signals.emit('changed')),
        ];
    }

    connect(name, callback) {
        return this.#signals.connect(name, callback);
    }

    disconnect(id) {
        this.#signals.disconnect(id);
    }

    destroy() {
        for (const id of this.#settingIds)
            this.#storage.disconnect(id);
        this.#settingIds = [];
        this.#signals.disconnectAll();
    }

    get presets() {
        return this.#presets;
    }

    /** The Recent entries the menu shows. */
    get recent() {
        return visibleRecent(this.#recent, this.#presets, this.#storage.recentSize);
    }

    /**
     * Starts a timer from typed (or Recent) input and records it in Recent.
     *
     * @param {string} input
     * @returns {{ok: true, timer: object} | {ok: false, error: string}}
     */
    startInput(input) {
        const result = this.#manager.startFromInput(input);
        if (result.ok) {
            this.#recent = addRecent(this.#recent, input, this.#manager.now());
            this.#storage.saveRecent(this.#recent);
        }
        return result;
    }

    /** @param {import('../core/presets.js').Preset} preset */
    startPreset(preset) {
        const result = parseInput(preset.input);
        if (result.ok)
            this.#manager.start(result.spec, {input: preset.input, sound: preset.sound});
    }

    /**
     * For the preset keyboard shortcuts.
     *
     * @param {number} slot
     */
    startPresetInSlot(slot) {
        const preset = presetForSlot(this.#presets, slot);
        if (preset)
            this.startPreset(preset);
    }

    /**
     * Saves a Recent entry as a preset (default sound, no shortcut).
     *
     * @param {string} input
     */
    saveAsPreset(input) {
        if (this.#presets.some(p => sameInput(p.input, input)))
            return;
        const preset = createPreset({id: newPresetId(this.#manager.now()), input});
        this.#storage.savePresets(addPreset(this.#presets, preset));
    }

    clearRecent() {
        this.#storage.saveRecent([]);
    }
}
