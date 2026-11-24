import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {Keys} from '../services/storage.js';
import {HotkeyRow} from './widgets/hotkeyRow.js';
import {SoundRow} from './widgets/soundRow.js';

/**
 * "General" preferences: alarm sound, keyboard shortcut, about.
 */
export const GeneralPage = GObject.registerClass(
class TimersGeneralPage extends Adw.PreferencesPage {
    /**
     * @param {object} args
     * @param {import('../services/storage.js').Storage} args.storage
     * @param {object} args.metadata - the extension's metadata.json
     * @param {Gio.File} args.extensionDir
     */
    _init({storage, metadata, extensionDir}) {
        super._init({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });

        this.add(this._soundGroup(storage, extensionDir));
        this.add(this._shortcutGroup(storage));
        this.add(this._aboutGroup(metadata));
    }

    _soundGroup(storage, extensionDir) {
        const group = new Adw.PreferencesGroup({title: _('Sound')});

        const soundRow = new SoundRow({
            title: _('Alarm sound'),
            subtitle: _('Used by timers without a sound of their own'),
            value: storage.defaultSound,
            onChanged: value => {
                storage.defaultSound = value;
            },
            getDefaultSound: () => storage.defaultSound,
            extensionDir,
        });
        const changedId = storage.connectChanged(Keys.DEFAULT_SOUND,
            () => soundRow.setValue(storage.defaultSound));
        soundRow.connect('destroy', () => storage.disconnect(changedId));
        group.add(soundRow);

        const loopRow = new Adw.SwitchRow({
            title: _('Repeat until stopped'),
            subtitle: _('Keep ringing and show a Stop button, instead of playing once'),
        });
        storage.settings.bind(Keys.LOOP_SOUND, loopRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(loopRow);

        const dndRow = new Adw.SwitchRow({
            title: _('Silence alarms during Do Not Disturb'),
            subtitle: _('Notifications always follow Do Not Disturb; this also mutes the sound'),
        });
        storage.settings.bind(Keys.SILENCE_IN_DND, dndRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(dndRow);

        return group;
    }

    _shortcutGroup(storage) {
        const group = new Adw.PreferencesGroup({title: _('Keyboard shortcut')});
        group.add(new HotkeyRow({
            title: _('Open the timers menu'),
            subtitle: _('Opens the menu ready to type a time'),
            storage,
            key: Keys.OPEN_MENU_HOTKEY,
        }));
        return group;
    }

    _aboutGroup(metadata) {
        const group = new Adw.PreferencesGroup({title: _('About')});
        group.add(new Adw.ActionRow({
            title: _('Version'),
            subtitle: metadata['version-name'] ?? String(metadata.version ?? ''),
        }));

        const projectRow = new Adw.ActionRow({
            title: _('Project page'),
            subtitle: metadata.url,
        });
        projectRow.add_suffix(new Gtk.LinkButton({
            uri: metadata.url,
            label: _('Open'),
            valign: Gtk.Align.CENTER,
        }));
        group.add(projectRow);
        return group;
    }
});
