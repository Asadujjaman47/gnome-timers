import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {BUILTIN_SOUNDS} from '../../core/sound.js';
import {SoundPlayer} from '../../services/soundPlayer.js';
import {resolveSound, soundFile} from '../../services/sounds.js';

const OTHER_FILE = Symbol('other file');

const builtinNames = () => ({
    bell: _('Bell'),
    complete: _('Complete'),
    message: _('Message'),
});

/**
 * Picks a sound: Bell, Complete, Message, or a sound file, with a ▶ preview.
 * With `allowDefault`, the first choice is "Default" (value null), used by
 * presets that should follow the default sound.
 */
export const SoundRow = GObject.registerClass(
class TimersSoundRow extends Adw.ComboRow {
    /**
     * @param {object} args
     * @param {string} args.title
     * @param {string} [args.subtitle]
     * @param {string|null} args.value - current sound
     * @param {(value: string|null) => void} args.onChanged
     * @param {() => string} args.getDefaultSound - for previewing "Default"
     * @param {import('gi://Gio').default.File} args.extensionDir
     * @param {boolean} [args.allowDefault]
     */
    _init({title, subtitle = '', value, onChanged, getDefaultSound, extensionDir, allowDefault = false}) {
        super._init({title});
        this._subtitle = subtitle;
        this._value = value;
        this._onChanged = onChanged;
        this._getDefaultSound = getDefaultSound;
        this._extensionDir = extensionDir;
        this._allowDefault = allowDefault;
        this._player = new SoundPlayer();
        this._updating = false;

        this._previewButton = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Play'),
            css_classes: ['flat'],
        });
        this._previewButton.connect('clicked', () => this._togglePreview());
        this.add_suffix(this._previewButton);

        this._warning = new Gtk.Image({
            icon_name: 'dialog-warning-symbolic',
            tooltip_text: _('File not found; the default sound will be used'),
        });
        this.add_prefix(this._warning);

        this.connect('notify::selected', () => this._onSelected());
        this.connect('destroy', () => this._player.destroy());
        this._rebuild();
    }

    /** @param {string|null} value */
    setValue(value) {
        this._value = value;
        this._rebuild();
    }

    _rebuild() {
        const names = builtinNames();
        this._choices = [];
        if (this._allowDefault)
            this._choices.push({label: _('Default'), value: null});
        for (const id of BUILTIN_SOUNDS)
            this._choices.push({label: names[id], value: id});
        if (this._value?.startsWith('file://')) {
            const name = GLib.path_get_basename(GLib.filename_from_uri(this._value)[0]);
            this._choices.push({label: name, value: this._value});
        }
        this._choices.push({label: _('Other file…'), value: OTHER_FILE});

        this._updating = true;
        this.model = Gtk.StringList.new(this._choices.map(c => c.label));
        this.selected = Math.max(0, this._choices.findIndex(c => c.value === this._value));
        this._updating = false;

        const missing = this._value?.startsWith('file://') && !soundFile(this._value);
        this._warning.visible = Boolean(missing);
        this.subtitle = missing ? _('File not found; the default sound will be used') : this._subtitle;
    }

    _onSelected() {
        if (this._updating)
            return;
        const choice = this._choices[this.selected];
        if (!choice)
            return;
        if (choice.value === OTHER_FILE) {
            this._chooseFile();
            return;
        }
        this._set(choice.value);
    }

    _set(value) {
        this._value = value;
        this._onChanged(value);
        this._rebuild();
    }

    _chooseFile() {
        const filter = new Gtk.FileFilter({name: _('Sound files')});
        filter.add_mime_type('audio/*');

        const dialog = new Gtk.FileDialog({
            title: _('Choose a sound file'),
            modal: true,
            default_filter: filter,
        });
        dialog.open(this.get_root(), null, (_dialog, result) => {
            try {
                const file = dialog.open_finish(result);
                this._set(file.get_uri());
            } catch {
                // Cancelled: show the previous choice again.
                this._rebuild();
            }
        });
    }

    _togglePreview() {
        if (this._player.playing) {
            this._player.stop();
            return;
        }
        const file = resolveSound(this._value, this._getDefaultSound(), this._extensionDir);
        this._player.play(file);
    }
});
