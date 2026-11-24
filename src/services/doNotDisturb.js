import Gio from 'gi://Gio';

/**
 * Reads GNOME's Do Not Disturb state: the Quick Settings toggle turns off
 * `org.gnome.desktop.notifications show-banners`.
 */
export class DoNotDisturb {
    #settings = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});

    get active() {
        return !this.#settings.get_boolean('show-banners');
    }
}
