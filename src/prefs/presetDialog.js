import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {parseInput} from '../core/parser.js';
import {HotkeyRow} from './widgets/hotkeyRow.js';
import {SoundRow} from './widgets/soundRow.js';

/**
 * @typedef {object} PresetDraft
 * @property {string} input - time and optional name, e.g. "4m tea"
 * @property {string|null} sound
 * @property {string} accelerator - '' for none
 */

/**
 * Dialog to create or edit a preset: time, optional name, sound, shortcut.
 * Nothing is saved until "Save"; then `onSave(draft)` is called.
 */
export const PresetDialog = GObject.registerClass(
class TimersPresetDialog extends Adw.Dialog {
    /**
     * @param {object} args
     * @param {boolean} args.isNew
     * @param {PresetDraft} args.draft - starting values
     * @param {boolean} args.canHaveShortcut - false when all slots are taken
     * @param {(draft: PresetDraft) => void} args.onSave
     * @param {import('../core/format.js').Formatter} args.formatter
     * @param {boolean} args.use12h
     * @param {() => string} args.getDefaultSound
     * @param {import('gi://Gio').default.File} args.extensionDir
     */
    _init({isNew, draft, canHaveShortcut, onSave, formatter, use12h, getDefaultSound, extensionDir}) {
        super._init({
            title: isNew ? _('New Preset') : _('Edit Preset'),
            content_width: 440,
        });
        this._formatter = formatter;
        this._use12h = use12h;
        this._sound = draft.sound;
        this._accelerator = draft.accelerator;

        const header = new Adw.HeaderBar({
            show_start_title_buttons: false,
            show_end_title_buttons: false,
        });
        const cancel = new Gtk.Button({label: _('Cancel')});
        cancel.connect('clicked', () => this.close());
        header.pack_start(cancel);

        this._saveButton = new Gtk.Button({label: _('Save'), css_classes: ['suggested-action']});
        this._saveButton.connect('clicked', () => {
            onSave({input: this._input(), sound: this._sound, accelerator: this._accelerator});
            this.close();
        });
        header.pack_end(this._saveButton);

        const parsed = parseInput(draft.input);
        this._group = new Adw.PreferencesGroup();
        this._timeRow = new Adw.EntryRow({
            title: _('Time — e.g. 4m, 1:30, @7:30'),
            text: parsed.ok ? parsed.spec.timeText : draft.input,
        });
        this._nameRow = new Adw.EntryRow({
            title: _('Name (optional)'),
            text: parsed.ok ? parsed.spec.label ?? '' : '',
        });
        for (const row of [this._timeRow, this._nameRow]) {
            row.connect('changed', () => this._validate());
            row.connect('entry-activated', () => {
                if (this._saveButton.sensitive)
                    this._saveButton.emit('clicked');
            });
        }
        this._group.add(this._timeRow);
        this._group.add(this._nameRow);

        const options = new Adw.PreferencesGroup();
        options.add(new SoundRow({
            title: _('Sound'),
            value: draft.sound,
            allowDefault: true,
            onChanged: value => {
                this._sound = value;
            },
            getDefaultSound,
            extensionDir,
        }));
        const hotkeyRow = new HotkeyRow({
            title: _('Keyboard shortcut'),
            subtitle: canHaveShortcut ? _('Starts this preset from anywhere') : _('All 9 shortcuts are in use'),
            getAccelerator: () => this._accelerator,
            setAccelerator: accelerator => {
                this._accelerator = accelerator;
            },
        });
        hotkeyRow.sensitive = canHaveShortcut;
        options.add(hotkeyRow);

        const page = new Adw.PreferencesPage();
        page.add(this._group);
        page.add(options);

        const view = new Adw.ToolbarView({content: page});
        view.add_top_bar(header);
        this.child = view;
        this.focus_widget = this._timeRow;

        this._validate();
    }

    _input() {
        const time = this._timeRow.text.trim();
        const name = this._nameRow.text.trim();
        return name ? `${time} ${name}` : time;
    }

    /** Shows how the input is understood, or what is wrong with it. */
    _validate() {
        const time = parseInput(this._timeRow.text);
        let error = '';
        if (!time.ok)
            error = this._formatter.parseError(time.error) || _('Enter a time');
        else if (time.spec.label)
            error = _('Put the name in the Name field');

        this._saveButton.sensitive = !error;
        if (error) {
            this._timeRow.add_css_class('error');
            this._group.description = error;
        } else {
            this._timeRow.remove_css_class('error');
            this._group.description = `→ ${this._formatter.describe(parseInput(this._input()).spec, this._use12h)}`;
        }
    }
});
