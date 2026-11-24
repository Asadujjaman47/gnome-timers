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
            parts.push(_('%d h').replace('%d', hours));
        if (minutes)
            parts.push(_('%d min').replace('%d', minutes));
        if (seconds || parts.length === 0)
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
     * Live preview under the input: "12 min · Pizza", "Alarm tomorrow 07:00".
     *
     * @param {import('./parser.js').TimerSpec} spec
     * @param {number} nowMs
     * @param {boolean} use12h
     */
    preview(spec, nowMs, use12h) {
        const time = spec.kind === 'alarm'
            ? this.#alarmName(spec.hours, spec.minutes, use12h,
                nextAlarmTime(spec.hours, spec.minutes, nowMs).tomorrow)
            : this.duration(spec.durationMs);
        return spec.label ? `${time} · ${spec.label}` : time;
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

function pad(n) {
    return String(n).padStart(2, '0');
}
