import {resolveSound} from './sounds.js';

/**
 * A timer that finished longer ago than this (e.g. while logged out) is
 * reported silently, with "Finished at …", instead of ringing.
 */
export const LATE_LIMIT_MS = 60_000;

/**
 * Reacts to finished timers: shows a notification and plays the sound.
 * Dismissing either the notification or the timer ends both; the sound stops
 * once no finished timer is left.
 */
export class AlarmController {
    #manager;
    #notifier;
    #player;
    #storage;
    #formatter;
    #clockFormat;
    #extensionDir;
    #ids = [];

    /**
     * @param {object} deps
     * @param {import('../core/timerManager.js').TimerManager} deps.manager
     * @param {import('./notifier.js').Notifier} deps.notifier
     * @param {import('./soundPlayer.js').SoundPlayer} deps.player
     * @param {import('./storage.js').Storage} deps.storage
     * @param {import('../core/format.js').Formatter} deps.formatter
     * @param {import('./clockFormat.js').ClockFormat} deps.clockFormat
     * @param {import('gi://Gio').default.File} deps.extensionDir
     */
    constructor({manager, notifier, player, storage, formatter, clockFormat, extensionDir}) {
        this.#manager = manager;
        this.#notifier = notifier;
        this.#player = player;
        this.#storage = storage;
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
    }

    /** @param {import('../core/timer.js').Timer} timer */
    #onFinished(timer) {
        const use12h = this.#clockFormat.use12h;
        const late = this.#manager.now() - timer.finishedAt > LATE_LIMIT_MS;
        const name = this.#formatter.timerName(timer, use12h);
        const duplicateName = this.#manager.timers.some(other =>
            other !== timer && this.#formatter.timerName(other, use12h) === name);

        this.#notifier.show(timer.id,
            this.#formatter.notification(timer, {use12h, late, duplicateName}));

        if (!late) {
            const file = resolveSound(timer.sound, this.#storage.defaultSound, this.#extensionDir);
            this.#player.play(file, {loop: this.#storage.loopSound});
        }
    }

    /** @param {import('../core/timer.js').Timer} timer */
    #onRemoved(timer) {
        this.#notifier.close(timer.id);
        if (!this.#manager.timers.some(t => t.isFinished))
            this.#player.stop();
    }
}
