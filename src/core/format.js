import {ParseError, nextAlarmTime} from './parser.js';

/**
 * Turns times and timers into display text.
 *
 * Core code cannot import GNOME's gettext, so the caller passes in the
 * extension's (or preferences') `gettext` function. Without one, English is
 * returned unchanged, which is what the tests use.
 */
export class Formatter {
    #gettext;

    /**
     * @param {object} [options]
     * @param {(text: string) => string} [options.gettext]
     */
    constructor({gettext} = {}) {
        this.#gettext = gettext ?? (text => text);
    }

    /**
     * Countdown display: "0:05", "4:59", "1:02:03". Seconds are rounded up,
     * so a running timer never shows 0:00 before it has actually finished.
     *
     * @param {number} ms
     */
    remaining(ms) {
        const total = Math.ceil(Math.max(ms, 0) / 1000);
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor(total / 60) % 60;
        const seconds = total % 60;

        if (hours > 0)
            return `${hours}:${pad(minutes)}:${pad(seconds)}`;
        return `${minutes}:${pad(seconds)}`;
    }

    /**
     * Human duration used for automatic names: "25 min", "1 h 30 min", "45 s".
     *
     * @param {number} ms
     */
    duration(ms) {
        const _ = this.#gettext;
        const total = Math.round(Math.max(ms, 0) / 1000);
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor(total / 60) % 60;
        const seconds = total % 60;

        const parts = [];
        if (hours)
            // TRANSLATORS: hours in a duration, e.g. "1 h 30 min"
            parts.push(_('%d h').replace('%d', hours));
        if (minutes)
            // TRANSLATORS: minutes in a duration, e.g. "1 h 30 min"
            parts.push(_('%d min').replace('%d', minutes));
        if (seconds || parts.length === 0)
            // TRANSLATORS: seconds in a duration, e.g. "1 min 12 s"
            parts.push(_('%d s').replace('%d', seconds));
        return parts.join(' ');
    }

    /**
     * @param {number} hours - 0–23
     * @param {number} minutes
     * @param {boolean} use12h - follow the desktop's clock-format setting
     */
    clock(hours, minutes, use12h) {
        const _ = this.#gettext;
        if (!use12h)
            return `${pad(hours)}:${pad(minutes)}`;
        const hour12 = hours % 12 || 12;
        return `${hour12}:${pad(minutes)} ${hours < 12 ? _('AM') : _('PM')}`;
    }

    /**
     * The name shown for a timer: its label, or an automatic name built from
     * its time ("25 min", "Alarm 14:30").
     *
     * @param {{kind: string, label: string|null, durationMs?: number,
     *          hours?: number, minutes?: number}} timer - a Timer or TimerSpec
     * @param {boolean} use12h
     */
    timerName(timer, use12h) {
        if (timer.label)
            return timer.label;
        if (timer.kind === 'alarm')
            return this.#alarmName(timer.hours, timer.minutes, use12h, false);
        return this.duration(timer.durationMs);
    }

    /**
     * When an alarm rings, relative to now: "14:30" or "tomorrow 07:00".
     *
     * @param {import('./timer.js').Timer} timer - an alarm
     * @param {number} now
     * @param {boolean} use12h
     */
    alarmTime(timer, now, use12h) {
        const _ = this.#gettext;
        const time = this.clock(timer.hours, timer.minutes, use12h);
        const at = timer.endsAt ?? timer.finishedAt;
        // TRANSLATORS: %s is a clock time, e.g. "tomorrow 07:00"
        return isLaterDay(at, now) ? _('tomorrow %s').replace('%s', time) : time;
    }

    /**
     * Name for a timer's menu row. Alarms always show when they ring:
     * "Meeting · 14:30", "Alarm tomorrow 07:00". Countdowns use `timerName`.
     *
     * @param {import('./timer.js').Timer} timer
     * @param {number} now
     * @param {boolean} use12h
     */
    rowName(timer, now, use12h) {
        const _ = this.#gettext;
        if (timer.kind !== 'alarm')
            return this.timerName(timer, use12h);
        const when = this.alarmTime(timer, now, use12h);
        return timer.label
            ? `${timer.label} · ${when}`
            : _('Alarm %s').replace('%s', when);
    }

    /**
     * Live preview under the input: "12 min · Pizza", "Alarm tomorrow 07:00".
     *
     * @param {import('./parser.js').TimerSpec} spec
     * @param {number} nowMs
     * @param {boolean} use12h
     */
    preview(spec, nowMs, use12h) {
        const tomorrow = spec.kind === 'alarm' &&
            nextAlarmTime(spec.hours, spec.minutes, nowMs).tomorrow;
        return this.#describe(spec, use12h, tomorrow);
    }

    /**
     * Name for a saved input (preset or recent entry), independent of the
     * current time: "12 min · Pizza", "Alarm 22:10".
     *
     * @param {import('./parser.js').TimerSpec} spec
     * @param {boolean} use12h
     */
    describe(spec, use12h) {
        return this.#describe(spec, use12h, false);
    }

    #describe(spec, use12h, tomorrow) {
        const time = spec.kind === 'alarm'
            ? this.#alarmName(spec.hours, spec.minutes, use12h, tomorrow)
            : this.duration(spec.durationMs);
        return spec.label ? `${time} · ${spec.label}` : time;
    }

    /**
     * Clock time of a timestamp, in local time.
     *
     * @param {number} ms
     * @param {boolean} use12h
     */
    clockAt(ms, use12h) {
        const date = new Date(ms);
        return this.clock(date.getHours(), date.getMinutes(), use12h);
    }

    /**
     * Title and body of the notification for a finished timer.
     *
     * - "Pizza" / "12 min timer finished"
     * - "25 min" / "Timer finished"
     * - "Meeting" / "Alarm at 14:30"
     * - "Alarm 14:30" / "Time is up"
     * - finished a while ago (e.g. while logged out): body "Finished at 14:30"
     * - same name as another timer: title gets "(started 14:02)"
     *
     * @param {import('./timer.js').Timer} timer - a finished timer
     * @param {object} options
     * @param {boolean} options.use12h
     * @param {boolean} [options.late] - it finished a while before now
     * @param {boolean} [options.duplicateName] - another timer has the same name
     * @returns {{title: string, body: string}}
     */
    notification(timer, {use12h, late = false, duplicateName = false}) {
        const _ = this.#gettext;
        let title = this.timerName(timer, use12h);
        if (duplicateName) {
            // TRANSLATORS: a timer's name and when it was started, e.g. "5 min (started 14:02)"
            title = _('%s (started %s)')
                .replace('%s', title)
                .replace('%s', this.clockAt(timer.startedAt, use12h));
        }

        let body;
        if (late) {
            body = _('Finished at %s').replace('%s', this.clockAt(timer.finishedAt, use12h));
        } else if (timer.kind === 'alarm') {
            body = timer.label
                ? _('Alarm at %s').replace('%s', this.clock(timer.hours, timer.minutes, use12h))
                : _('Time is up');
        } else {
            body = timer.label
                // TRANSLATORS: %s is a duration, e.g. "12 min timer finished"
                ? _('%s timer finished').replace('%s', this.duration(timer.durationMs))
                : _('Timer finished');
        }
        return {title, body};
    }

    /**
     * Message for a parse error code, or '' for empty input.
     *
     * @param {string} error - a ParseError value
     */
    parseError(error) {
        const _ = this.#gettext;
        switch (error) {
        case ParseError.EMPTY:
            return '';
        case ParseError.ZERO:
            return _('The time must be longer than zero');
        case ParseError.TOO_LONG:
            return _('The longest timer is 99 hours');
        case ParseError.INVALID_TIME:
            return _('Not a valid clock time');
        default:
            return _('Type a time like 5m, 1:30 or @14:30');
        }
    }

    #alarmName(hours, minutes, use12h, tomorrow) {
        const _ = this.#gettext;
        const time = this.clock(hours, minutes, use12h);
        return tomorrow
            ? _('Alarm tomorrow %s').replace('%s', time)
            : _('Alarm %s').replace('%s', time);
    }
}

const MODIFIER_NAMES = {
    primary: 'Ctrl', control: 'Ctrl', ctrl: 'Ctrl', super: 'Super',
    alt: 'Alt', shift: 'Shift', meta: 'Meta', hyper: 'Hyper',
};

/**
 * Readable form of a GTK accelerator: "<Control><Super>t" → "Ctrl+Super+T".
 * '' for no shortcut.
 *
 * @param {string} accelerator
 */
export function formatAccelerator(accelerator) {
    if (!accelerator)
        return '';
    const modifiers = [...accelerator.matchAll(/<([^>]+)>/g)]
        .map(([, name]) => MODIFIER_NAMES[name.toLowerCase()] ?? name);
    const key = accelerator.replace(/<[^>]+>/g, '');
    const keyName = key.length === 1 ? key.toUpperCase() : key.replace(/^./, c => c.toUpperCase());
    return [...new Set(modifiers), keyName].join('+');
}

function pad(n) {
    return String(n).padStart(2, '0');
}

/** Whether `at` falls on a later calendar day than `now` (local time). */
function isLaterDay(at, now) {
    const a = new Date(at);
    const n = new Date(now);
    return at > now && (a.getFullYear() !== n.getFullYear() ||
        a.getMonth() !== n.getMonth() || a.getDate() !== n.getDate());
}
