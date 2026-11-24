import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {formatAccelerator} from '../core/format.js';
import {parseInput} from '../core/parser.js';
import {presetHotkeyKey} from '../services/storage.js';
import {setDimmed} from './util.js';

/**
 * A clickable menu row: icon, name, and optional widgets on the right.
 * Clicking the row (not a button in it) calls `onActivate` and closes the menu.
 */
const LibraryRow = GObject.registerClass(
class TimersLibraryRow extends PopupMenu.PopupBaseMenuItem {
    /**
     * @param {object} args
     * @param {string} args.name
     * @param {import('gi://Gio').default.Icon} args.icon
     * @param {() => void} args.onActivate
     */
    _init({name, icon, onActivate}) {
        super._init({style_class: 'timers-library-row'});
        this.add_child(new St.Icon({gicon: icon, style_class: 'popup-menu-icon'}));

        const label = new St.Label({
            text: name,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.add_child(label);
        this.label_actor = label;

        this.connect('activate', () => onActivate());
    }
});

/** Non-clickable section heading: "Presets", "Recent". */
function heading(text) {
    const item = new PopupMenu.PopupMenuItem(text, {reactive: false, can_focus: false});
    item.add_style_class_name('timers-section-heading');
    setDimmed(item.label, true);
    return item;
}

/**
 * Builds a parsed spec's display name, or null if the input no longer parses.
 */
function nameOf(input, formatter, use12h) {
    const result = parseInput(input);
    return result.ok ? formatter.describe(result.spec, use12h) : null;
}

/**
 * "Presets" section: one row per preset; its shortcut is shown on the right.
 */
export class PresetsSection {
    #library;
    #formatter;
    #storage;
    #icons;

    /**
     * @param {object} deps
     * @param {import('../services/library.js').Library} deps.library
     * @param {import('../core/format.js').Formatter} deps.formatter
     * @param {import('../services/storage.js').Storage} deps.storage
     * @param {{timer: import('gi://Gio').default.Icon, alarm: import('gi://Gio').default.Icon}} deps.icons
     */
    constructor({library, formatter, storage, icons}) {
        this.#library = library;
        this.#formatter = formatter;
        this.#storage = storage;
        this.#icons = icons;
        this.section = new PopupMenu.PopupMenuSection();
    }

    get isEmpty() {
        return this.#library.presets.length === 0;
    }

    /** @param {boolean} use12h */
    rebuild(use12h) {
        this.section.removeAll();
        const presets = this.#library.presets;
        if (presets.length === 0)
            return;

        this.section.addMenuItem(heading(_('Presets')));
        for (const preset of presets) {
            const name = nameOf(preset.input, this.#formatter, use12h);
            if (!name)
                continue;
            const row = new LibraryRow({
                name,
                icon: iconFor(preset.input, this.#icons),
                onActivate: () => this.#library.startPreset(preset),
            });
            const shortcut = preset.hotkeySlot
                ? formatAccelerator(this.#storage.getHotkey(presetHotkeyKey(preset.hotkeySlot)))
                : '';
            if (shortcut) {
                const hint = new St.Label({
                    text: shortcut,
                    style_class: 'timers-shortcut-hint',
                    y_align: Clutter.ActorAlign.CENTER,
                });
                setDimmed(hint, true);
                row.add_child(hint);
            }
            this.section.addMenuItem(row);
        }
    }
}

/**
 * "Recent" section: click a row to start it again, ☆ to save it as a preset,
 * and "Clear recent" at the end.
 */
export class RecentSection {
    #library;
    #formatter;
    #icons;

    /**
     * @param {object} deps
     * @param {import('../services/library.js').Library} deps.library
     * @param {import('../core/format.js').Formatter} deps.formatter
     * @param {{timer: import('gi://Gio').default.Icon, alarm: import('gi://Gio').default.Icon}} deps.icons
     */
    constructor({library, formatter, icons}) {
        this.#library = library;
        this.#formatter = formatter;
        this.#icons = icons;
        this.section = new PopupMenu.PopupMenuSection();
    }

    get isEmpty() {
        return this.#library.recent.length === 0;
    }

    /** @param {boolean} use12h */
    rebuild(use12h) {
        this.section.removeAll();
        const recent = this.#library.recent;
        if (recent.length === 0)
            return;

        this.section.addMenuItem(heading(_('Recent')));
        for (const entry of recent) {
            const name = nameOf(entry.input, this.#formatter, use12h);
            if (!name)
                continue;
            const row = new LibraryRow({
                name,
                icon: iconFor(entry.input, this.#icons),
                onActivate: () => this.#library.startInput(entry.input),
            });

            const save = new St.Button({
                style_class: 'icon-button timers-row-button',
                can_focus: true,
                y_align: Clutter.ActorAlign.CENTER,
                accessible_name: _('Save as preset'),
                child: new St.Icon({icon_name: 'non-starred-symbolic', style_class: 'popup-menu-icon'}),
            });
            save.connect('clicked', () => this.#library.saveAsPreset(entry.input));
            row.add_child(save);
            this.section.addMenuItem(row);
        }

        const clear = new PopupMenu.PopupMenuItem(_('Clear recent'));
        clear.add_style_class_name('timers-clear-recent');
        clear.connect('activate', () => this.#library.clearRecent());
        this.section.addMenuItem(clear);
    }
}

function iconFor(input, icons) {
    const result = parseInput(input);
    return result.ok && result.spec.kind === 'alarm' ? icons.alarm : icons.timer;
}
