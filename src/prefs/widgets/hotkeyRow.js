import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/**
 * Shows and records a keyboard shortcut. Click the row, then press the keys;
 * Escape cancels, Backspace clears. A shortcut needs at least one modifier.
 */
export const HotkeyRow = GObject.registerClass(
class TimersHotkeyRow extends Adw.ActionRow {
    /**
     * @param {object} args
     * @param {string} args.title
     * @param {string} [args.subtitle]
     * @param {import('../../services/storage.js').Storage} args.storage
     * @param {string} args.key - settings key holding the shortcut
     */
    _init({title, subtitle = '', storage, key}) {
        super._init({title, subtitle, activatable: true});
        this._storage = storage;
        this._key = key;
        this._capturing = false;

        this._label = new Gtk.ShortcutLabel({valign: Gtk.Align.CENTER});
        this.add_suffix(this._label);

        this._clearButton = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Remove shortcut'),
            css_classes: ['flat'],
        });
        this._clearButton.connect('clicked', () => storage.setHotkey(key, ''));
        this.add_suffix(this._clearButton);

        const keys = new Gtk.EventControllerKey();
        keys.connect('key-pressed', (_c, keyval, keycode, state) =>
            this._onKeyPressed(keyval, keycode, state));
        this.add_controller(keys);

        const focus = new Gtk.EventControllerFocus();
        focus.connect('leave', () => this._stopCapture());
        this.add_controller(focus);

        this.connect('activated', () => this._startCapture());

        const changedId = storage.connectChanged(key, () => this._sync());
        this.connect('destroy', () => storage.disconnect(changedId));
        this._sync();
    }

    _sync() {
        const accelerator = this._capturing ? '' : this._storage.getHotkey(this._key);
        this._label.accelerator = accelerator;
        this._label.disabled_text = this._capturing
            ? _('Press a shortcut… (Esc cancels, Backspace clears)')
            : _('Disabled');
        this._clearButton.visible = !this._capturing && accelerator !== '';
    }

    _startCapture() {
        this._capturing = true;
        this._sync();
    }

    _stopCapture() {
        if (!this._capturing)
            return;
        this._capturing = false;
        this._sync();
    }

    _onKeyPressed(keyval, keycode, state) {
        if (!this._capturing)
            return Gdk.EVENT_PROPAGATE;

        const mods = state & Gtk.accelerator_get_default_mod_mask();
        const key = Gdk.keyval_to_lower(keyval);

        if (!mods && key === Gdk.KEY_Escape) {
            this._stopCapture();
        } else if (!mods && key === Gdk.KEY_BackSpace) {
            this._capturing = false;
            this._storage.setHotkey(this._key, '');
            this._sync();
        } else if (mods && Gtk.accelerator_valid(key, mods)) {
            this._capturing = false;
            this._storage.setHotkey(this._key,
                Gtk.accelerator_name_with_keycode(null, key, keycode, mods));
            this._sync();
        }
        // Anything else (e.g. a lone modifier) keeps waiting for a full shortcut.
        return Gdk.EVENT_STOP;
    }
});
