import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {Formatter, formatAccelerator} from '../core/format.js';
import {parseInput} from '../core/parser.js';
import {
    HOTKEY_SLOTS, addPreset, createPreset, movePreset, newPresetId, removePreset, slotFor,
    updatePreset,
} from '../core/presets.js';
import {Keys, presetHotkeyKey} from '../services/storage.js';
import {PresetDialog} from './presetDialog.js';

const soundNames = () => ({
    bell: _('Bell'),
    complete: _('Complete'),
    message: _('Message'),
});

/**
 * "Presets" preferences: add, edit, reorder and delete presets.
 */
export const PresetsPage = GObject.registerClass(
class TimersPresetsPage extends Adw.PreferencesPage {
    /**
     * @param {object} args
     * @param {import('../services/storage.js').Storage} args.storage
     * @param {Gio.File} args.extensionDir
     */
    _init({storage, extensionDir}) {
        super._init({
            title: _('Presets'),
            icon_name: 'starred-symbolic',
        });
        this._storage = storage;
        this._extensionDir = extensionDir;
        this._formatter = new Formatter({gettext: _});
        this._timerIcon = Gio.icon_new_for_string(
            extensionDir.get_child('icons').get_child('timers-hourglass-symbolic.svg').get_path());
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        /** @type {Gtk.Widget[]} */
        this._rows = [];

        const addButton = new Gtk.Button({
            child: new Adw.ButtonContent({icon_name: 'list-add-symbolic', label: _('Add Preset')}),
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });
        addButton.connect('clicked', () => this._openDialog(null));

        this._group = new Adw.PreferencesGroup({
            title: _('Presets'),
            description: _('Start them with one click from the menu, or with their shortcut. ' +
                'You can also save a recent timer with ☆ in the menu.'),
            header_suffix: addButton,
        });
        this.add(this._group);

        const ids = [Keys.PRESETS, ...Array.from({length: HOTKEY_SLOTS}, (_x, i) => presetHotkeyKey(i + 1))]
            .map(key => storage.connectChanged(key, () => this._rebuild()));
        this.connect('destroy', () => ids.forEach(id => storage.disconnect(id)));

        this._rebuild();
    }

    get _use12h() {
        return this._interface.get_string('clock-format') === '12h';
    }

    _rebuild() {
        for (const row of this._rows)
            this._group.remove(row);
        this._rows = [];

        const presets = this._storage.loadPresets();
        if (presets.length === 0) {
            this._addRow(new Adw.ActionRow({
                title: _('No presets yet'),
                subtitle: _('Use “Add Preset”, or ☆ on a recent timer in the menu'),
                sensitive: false,
            }));
            return;
        }
        presets.forEach((preset, index) =>
            this._addRow(this._presetRow(preset, index, presets.length)));
    }

    _addRow(row) {
        this._group.add(row);
        this._rows.push(row);
    }

    _presetRow(preset, index, count) {
        const parsed = parseInput(preset.input);
        const row = new Adw.ActionRow({
            title: GLib.markup_escape_text(parsed.ok
                ? this._formatter.describe(parsed.spec, this._use12h)
                : preset.input, -1),
            subtitle: GLib.markup_escape_text(this._details(preset), -1),
            activatable: true,
        });
        row.add_prefix(parsed.ok && parsed.spec.kind === 'alarm'
            ? new Gtk.Image({icon_name: 'alarm-symbolic'})
            : new Gtk.Image({gicon: this._timerIcon}));
        row.connect('activated', () => this._openDialog(preset));

        const button = (icon, tooltip, onClicked, sensitive = true) => {
            const b = new Gtk.Button({
                icon_name: icon,
                tooltip_text: tooltip,
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
                sensitive,
            });
            b.connect('clicked', onClicked);
            row.add_suffix(b);
        };
        button('go-up-symbolic', _('Move up'), () => this._move(preset, index - 1), index > 0);
        button('go-down-symbolic', _('Move down'), () => this._move(preset, index + 1), index < count - 1);
        button('user-trash-symbolic', _('Delete'), () => this._delete(preset));
        return row;
    }

    /** "Sound: Bell · Ctrl+Super+1" */
    _details(preset) {
        const parts = [];
        if (preset.sound?.startsWith('file://'))
            parts.push(GLib.path_get_basename(GLib.filename_from_uri(preset.sound)[0]));
        else
            parts.push(soundNames()[preset.sound] ?? _('Default sound'));
        const accelerator = this._accelerator(preset);
        if (accelerator)
            parts.push(formatAccelerator(accelerator));
        return parts.join(' · ');
    }

    _accelerator(preset) {
        return preset.hotkeySlot ? this._storage.getHotkey(presetHotkeyKey(preset.hotkeySlot)) : '';
    }

    _move(preset, toIndex) {
        this._storage.savePresets(movePreset(this._storage.loadPresets(), preset.id, toIndex));
    }

    _delete(preset) {
        if (preset.hotkeySlot)
            this._storage.setHotkey(presetHotkeyKey(preset.hotkeySlot), '');
        this._storage.savePresets(removePreset(this._storage.loadPresets(), preset.id));
    }

    /** @param {import('../core/presets.js').Preset|null} preset - null for a new one */
    _openDialog(preset) {
        const presets = this._storage.loadPresets();
        const dialog = new PresetDialog({
            isNew: !preset,
            draft: {
                input: preset?.input ?? '',
                sound: preset?.sound ?? null,
                accelerator: preset ? this._accelerator(preset) : '',
            },
            canHaveShortcut: slotFor(presets, preset?.id ?? null) !== null,
            onSave: draft => this._save(preset, draft),
            formatter: this._formatter,
            use12h: this._use12h,
            getDefaultSound: () => this._storage.defaultSound,
            extensionDir: this._extensionDir,
        });
        dialog.present(this.get_root());
    }

    /**
     * @param {import('../core/presets.js').Preset|null} preset
     * @param {import('./presetDialog.js').PresetDraft} draft
     */
    _save(preset, {input, sound, accelerator}) {
        let presets = this._storage.loadPresets();
        const id = preset?.id ?? newPresetId(Date.now());

        let hotkeySlot = null;
        if (accelerator) {
            hotkeySlot = slotFor(presets, preset ? id : null);
            if (hotkeySlot)
                this._storage.setHotkey(presetHotkeyKey(hotkeySlot), accelerator);
        } else if (preset?.hotkeySlot) {
            this._storage.setHotkey(presetHotkeyKey(preset.hotkeySlot), '');
        }

        presets = preset
            ? updatePreset(presets, id, {input, sound, hotkeySlot})
            : addPreset(presets, createPreset({id, input, sound, hotkeySlot}));

        // A shortcut taken over by this preset leaves the old owner without
        // one: free that preset's slot too.
        presets = presets.map(p => (p.hotkeySlot && !this._storage.getHotkey(presetHotkeyKey(p.hotkeySlot))
            ? {...p, hotkeySlot: null}
            : p));
        this._storage.savePresets(presets);
    }
});
