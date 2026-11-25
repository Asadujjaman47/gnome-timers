import {LATE_LIMIT_MS, alarmBehavior} from '../core/alarm.js';
import {resolveSound} from './sounds.js';

/**
 * Reacts to finished timers (see src/core/alarm.js for the rules):
 *
 * - default: play the sound once, show a notification, and remove the timer
 *   right away; the notification stays in GNOME's notification list
 * - "Repeat until stopped": loop the sound and keep the timer ("ringing")
 *   until it is stopped from the menu or the notification
 */
export class AlarmController {
    #manager;
    #notifier;
    #player;
    #storage;
    #dnd;
    #formatter;
    #clockFormat;
    #extensionDir;
    /** Ids of timers that are ringing until stopped. */
    #ringing = new Set();
    #ids = [];

    /**
     * @param {object} deps
     * @param {import('../core/timerManager.js').TimerManager} deps.manager
     * @param {import('./notifier.js').Notifier} deps.notifier
     * @param {import('./soundPlayer.js').SoundPlayer} deps.player
     * @param {import('./storage.js').Storage} deps.storage
     * @param {import('./doNotDisturb.js').DoNotDisturb} deps.dnd
     * @param {import('../core/format.js').Formatter} deps.formatter
     * @param {import('./clockFormat.js').ClockFormat} deps.clockFormat
     * @param {import('gi://Gio').default.File} deps.extensionDir
     */
    constructor({manager, notifier, player, storage, dnd, formatter, clockFormat, extensionDir}) {
        this.#manager = manager;
        this.#notifier = notifier;
        this.#player = player;
        this.#storage = storage;
        this.#dnd = dnd;
        this.#formatter = formatter;
        this.#clockFormat = clockFormat;
        this.#extensionDir = extensionDir;

        this.#ids = [
            manager.connect('finished', timer => this.#onFinished(timer)),
            manager.connect('removed', timer => this.#onRemoved(timer)),
        ];
    }

    destroy() {
        for (const id of this.#ids)
            this.#manager.disconnect(id);
        this.#ids = [];
        this.#ringing.clear();
    }

    /** @param {import('../core/timer.js').Timer} timer */
    #onFinished(timer) {
        const late = this.#manager.now() - timer.finishedAt > LATE_LIMIT_MS;
        const {playSound, ringUntilDismissed} = alarmBehavior({
            late,
            dndActive: this.#dnd.active,
            silenceInDnd: this.#storage.silenceInDnd,
            loopSound: this.#storage.loopSound,
        });

        const use12h = this.#clockFormat.use12h;
        const name = this.#formatter.timerName(timer, use12h);
        const duplicateName = this.#manager.timers.some(other =>
            other !== timer && this.#formatter.timerName(other, use12h) === name);
        this.#notifier.show(timer.id,
            this.#formatter.notification(timer, {use12h, late, duplicateName}),
            {stopAction: ringUntilDismissed});

        if (playSound) {
            const file = resolveSound(timer.sound, this.#storage.defaultSound, this.#extensionDir);
            this.#player.play(file, {loop: ringUntilDismissed});
        }

        if (ringUntilDismissed)
            this.#ringing.add(timer.id);
        else
            this.#manager.stop(timer.id);
    }

    /** @param {import('../core/timer.js').Timer} timer */
    #onRemoved(timer) {
        if (!this.#ringing.delete(timer.id))
            return;
        this.#notifier.close(timer.id);
        if (this.#ringing.size === 0)
            this.#player.stop();
    }
}
