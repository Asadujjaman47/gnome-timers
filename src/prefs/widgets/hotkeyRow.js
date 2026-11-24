import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/**
 * Shows and records a keyboard shortcut. Click the row, then press the keys;
 * Escape cancels, Backspace clears. A shortcut needs at least one modifier.
 *
 * Where the shortcut is stored is up to the caller: `getAccelerator`,
 * `setAccelerator` and, for values that can change elsewhere, `watch`.
 */
export const HotkeyRow = GObject.registerClass(
class TimersHotkeyRow extends Adw.ActionRow {
    /**
     * @param {object} args
     * @param {string} args.title
     * @param {string} [args.subtitle]
     * @param {() => string} args.getAccelerator - '' when unset
     * @param {(accelerator: string) => void} args.setAccelerator - '' clears
     * @param {(onChange: () => void) => (() => void)} [args.watch] - subscribe to
     *   outside changes; returns an unsubscribe function
     */
    _init({title, subtitle = '', getAccelerator, setAccelerator, watch}) {
        super._init({title, subtitle, activatable: true});
        this._getAccelerator = getAccelerator;
        this._setAccelerator = setAccelerator;
        this._capturing = false;

        this._label = new Gtk.ShortcutLabel({valign: Gtk.Align.CENTER});
        this.add_suffix(this._label);

        this._clearButton = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Remove shortcut'),
            css_classes: ['flat'],
        });
        this._clearButton.connect('clicked', () => this._set(''));
        this.add_suffix(this._clearButton);

        const keys = new Gtk.EventControllerKey();
        keys.connect('key-pressed', (_c, keyval, keycode, state) =>
            this._onKeyPressed(keyval, keycode, state));
        this.add_controller(keys);

        const focus = new Gtk.EventControllerFocus();
        focus.connect('leave', () => this._stopCapture());
        this.add_controller(focus);

        this.connect('activated', () => this._startCapture());

        if (watch) {
            const unwatch = watch(() => this.sync());
            this.connect('destroy', () => unwatch());
        }
        this.sync();
    }

    sync() {
        const accelerator = this._capturing ? '' : this._getAccelerator();
        this._label.accelerator = accelerator;
        this._label.disabled_text = this._capturing
            ? _('Press a shortcut… (Esc cancels, Backspace clears)')
            : _('Disabled');
        this._clearButton.visible = !this._capturing && accelerator !== '';
    }

    _set(accelerator) {
        this._capturing = false;
        this._setAccelerator(accelerator);
        this.sync();
    }

    _startCapture() {
        this._capturing = true;
        this.sync();
    }

    _stopCapture() {
        if (!this._capturing)
            return;
        this._capturing = false;
        this.sync();
    }

    _onKeyPressed(keyval, keycode, state) {
        if (!this._capturing)
            return Gdk.EVENT_PROPAGATE;

        const mods = state & Gtk.accelerator_get_default_mod_mask();
        const key = Gdk.keyval_to_lower(keyval);

        if (!mods && key === Gdk.KEY_Escape)
            this._stopCapture();
        else if (!mods && key === Gdk.KEY_BackSpace)
            this._set('');
        else if (mods && Gtk.accelerator_valid(key, mods))
            this._set(Gtk.accelerator_name_with_keycode(null, key, keycode, mods));
        // Anything else (e.g. a lone modifier) keeps waiting for a full shortcut.
        return Gdk.EVENT_STOP;
    }
});
