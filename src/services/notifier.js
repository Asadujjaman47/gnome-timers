import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

/**
 * Shows notifications for finished timers under a "Timers" source.
 *
 * They are normal notifications: a short banner that then moves to the
 * notification list, and no banner during Do Not Disturb (GNOME handles
 * that). A notification shown with `stopAction` belongs to a timer that keeps
 * ringing: it gets a Stop button, and acknowledging it (Stop, clicking it or
 * closing it) calls `onDismissed(id)`.
 */
export class Notifier {
    /** @type {MessageTray.Source|null} */
    #source = null;
    /** Notifications of ringing timers, by timer id. */
    /** @type {Map<string, MessageTray.Notification>} */
    #ringing = new Map();
    #icon;
    #onDismissed;

    /**
     * @param {object} args
     * @param {import('gi://Gio').default.Icon} args.icon
     * @param {(id: string) => void} args.onDismissed
     */
    constructor({icon, onDismissed}) {
        this.#icon = icon;
        this.#onDismissed = onDismissed;
    }

    /**
     * @param {string} id - timer id
     * @param {{title: string, body: string}} text
     * @param {{stopAction?: boolean}} [options]
     */
    show(id, {title, body}, {stopAction = false} = {}) {
        this.close(id);

        const source = this.#getSource();
        const notification = new MessageTray.Notification({source, title, body});

        if (stopAction) {
            // Invoking an action destroys the notification; the 'destroy'
            // handler reports it, so the action itself has nothing to do.
            notification.addAction(_('Stop'), () => {});
            notification.connect('destroy', (_n, reason) => {
                if (this.#ringing.get(id) !== notification)
                    return;
                this.#ringing.delete(id);
                if (reason === MessageTray.NotificationDestroyedReason.DISMISSED)
                    this.#onDismissed(id);
            });
            this.#ringing.set(id, notification);
        }

        source.addNotification(notification);
    }

    /**
     * Removes a ringing timer's notification (e.g. stopped from the menu)
     * without reporting it as dismissed.
     *
     * @param {string} id
     */
    close(id) {
        const notification = this.#ringing.get(id);
        if (!notification)
            return;
        this.#ringing.delete(id);
        notification.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
    }

    destroy() {
        this.#ringing.clear();
        this.#source?.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
        this.#source = null;
    }

    #getSource() {
        if (!this.#source) {
            this.#source = new MessageTray.Source({title: _('Timers'), icon: this.#icon});
            this.#source.connect('destroy', () => {
                this.#source = null;
            });
            Main.messageTray.add(this.#source);
        }
        return this.#source;
    }
}
