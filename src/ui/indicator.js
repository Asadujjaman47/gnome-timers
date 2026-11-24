import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const ICON_FILE = 'icons/timers-hourglass-symbolic.svg';

/**
 * The panel button and its menu.
 */
export const TimersIndicator = GObject.registerClass(
class TimersIndicator extends PanelMenu.Button {
    /**
     * @param {import('resource:///org/gnome/shell/extensions/extension.js').Extension} extension
     */
    _init(extension) {
        super._init(0.5, _('Timers'));

        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(`${extension.path}/${ICON_FILE}`),
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);

        const settingsItem = new PopupMenu.PopupMenuItem(_('Settings'));
        settingsItem.connect('activate', () => extension.openPreferences());
        this.menu.addMenuItem(settingsItem);

        this._sessionModeId = Main.sessionMode.connect('updated',
            () => this._syncSensitivity());
        this._syncSensitivity();

        this.connect('destroy', () => this._onDestroy());
    }

    /** Display-only while the screen is locked. */
    _syncSensitivity() {
        const unlocked = !Main.sessionMode.isLocked;
        if (!unlocked)
            this.menu.close();
        this.setSensitive(unlocked);
    }

    _onDestroy() {
        if (this._sessionModeId) {
            Main.sessionMode.disconnect(this._sessionModeId);
            this._sessionModeId = 0;
        }
    }
});
