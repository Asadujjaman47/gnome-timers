import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/**
 * "General" preferences page. Sound, recent-list and hotkey settings are added
 * here in later milestones.
 */
export const GeneralPage = GObject.registerClass(
class GeneralPage extends Adw.PreferencesPage {
    /**
     * @param {import('gi://Gio').default.Settings} settings
     * @param {object} metadata - the extension's metadata.json
     */
    _init(settings, metadata) {
        super._init({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        this._settings = settings;

        const aboutGroup = new Adw.PreferencesGroup({title: _('About')});
        this.add(aboutGroup);

        aboutGroup.add(new Adw.ActionRow({
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
        aboutGroup.add(projectRow);
    }
});
