import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

/**
 * Shows one notification per finished timer under a "Timers" source.
 *
 * Notifications are critical: they get through Do Not Disturb and stay on
 * screen until acknowledged, like an alarm clock. Acknowledging one (its
 * "Stop" button, clicking it, or closing it) calls `onDismissed(id)`.
 */
export class Notifier {
    /** @type {MessageTray.Source|null} */
    #source = null;
    /** @type {Map<string, MessageTray.Notification>} */
    #notifications = new Map();
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
     */
    show(id, {title, body}) {
        this.close(id);

        const source = this.#getSource();
        const notification = new MessageTray.Notification({source, title, body});
        notification.urgency = MessageTray.Urgency.CRITICAL;
        // The action's own handler has nothing to do: invoking an action
        // destroys the notification, which the 'destroy' handler reports.
        notification.addAction(_('Stop'), () => {});
        notification.connect('destroy', (_n, reason) => {
            if (this.#notifications.get(id) !== notification)
                return;
            this.#notifications.delete(id);
            if (reason === MessageTray.NotificationDestroyedReason.DISMISSED)
                this.#onDismissed(id);
        });

        this.#notifications.set(id, notification);
        source.addNotification(notification);
    }

    /**
     * Removes a timer's notification without reporting it as dismissed.
     *
     * @param {string} id
     */
    close(id) {
        const notification = this.#notifications.get(id);
        if (!notification)
            return;
        this.#notifications.delete(id);
        notification.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
    }

    destroy() {
        for (const id of [...this.#notifications.keys()])
            this.close(id);
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
