import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * Global keyboard shortcuts stored in the extension's settings. Each binding
 * is re-registered when its setting changes.
 */
export class Keybindings {
    #settings;
    /** @type {Map<string, {handler: () => void, changedId: number}>} */
    #bindings = new Map();

    /** @param {import('gi://Gio').default.Settings} settings */
    constructor(settings) {
        this.#settings = settings;
    }

    /**
     * @param {string} key - an `as` settings key holding the accelerator
     * @param {() => void} handler
     */
    bind(key, handler) {
        this.unbind(key);
        const changedId = this.#settings.connect(`changed::${key}`, () => {
            Main.wm.removeKeybinding(key);
            this.#add(key, handler);
        });
        this.#bindings.set(key, {handler, changedId});
        this.#add(key, handler);
    }

    /** @param {string} key */
    unbind(key) {
        const binding = this.#bindings.get(key);
        if (!binding)
            return;
        this.#settings.disconnect(binding.changedId);
        Main.wm.removeKeybinding(key);
        this.#bindings.delete(key);
    }

    destroy() {
        for (const key of [...this.#bindings.keys()])
            this.unbind(key);
    }

    #add(key, handler) {
        Main.wm.addKeybinding(key, this.#settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW, handler);
    }
}
