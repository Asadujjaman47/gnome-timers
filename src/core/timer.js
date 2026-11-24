import {isDayKey, localDateTime, localDayKey} from './localTime.js';
import {nextAlarmTime} from './parser.js';
import {isValidSound} from './sound.js';

export const TimerKind = Object.freeze({
    COUNTDOWN: 'countdown',
    ALARM: 'alarm',
});

export const TimerState = Object.freeze({
    RUNNING: 'running',
    PAUSED: 'paused',
    FINISHED: 'finished',
});

/**
 * One countdown or alarm.
 *
 * A running timer stores its absolute end time (`endsAt`, wall-clock ms), so
 * it stays correct across suspend and GNOME Shell restarts. A paused timer
 * stores the time it had left (`remainingMs`) instead.
 */
export class Timer {
    /**
     * Use `Timer.create()` or `Timer.fromJSON()` instead of calling this.
     *
     * @param {object} props
     */
    constructor(props) {
        /** @type {string} */
        this.id = props.id;
        /** @type {'countdown'|'alarm'} */
        this.kind = props.kind;
        /** @type {string} what the user typed; used for Recent and restarts */
        this.input = props.input;
        /** @type {string|null} */
        this.label = props.label;
        /** @type {string|null} sound id/URI, or null for the default sound */
        this.sound = props.sound;
        /** @type {number} full length; for alarms, from start to alarm time */
        this.durationMs = props.durationMs;
        /** @type {number|null} alarm clock time */
        this.hours = props.hours ?? null;
        /** @type {number|null} */
        this.minutes = props.minutes ?? null;
        /** @type {string|null} alarm's local day, "YYYY-MM-DD" */
        this.alarmDay = props.alarmDay ?? null;
        /** @type {'running'|'paused'|'finished'} */
        this.state = props.state;
        /** @type {number|null} set while running */
        this.endsAt = props.endsAt ?? null;
        /** @type {number|null} set while paused */
        this.remainingMs = props.remainingMs ?? null;
        /** @type {number} */
        this.startedAt = props.startedAt;
        /** @type {number|null} when it was due to finish (not when we noticed) */
        this.finishedAt = props.finishedAt ?? null;
    }

    /**
     * Starts a new timer from a parsed input.
     *
     * @param {object} args
     * @param {string} args.id
     * @param {import('./parser.js').TimerSpec} args.spec
     * @param {string} args.input
     * @param {string|null} [args.sound]
     * @param {number} args.now
     */
    static create({id, spec, input, sound = null, now}) {
        const common = {
            id,
            kind: spec.kind,
            input,
            label: spec.label,
            sound,
            state: TimerState.RUNNING,
            startedAt: now,
        };

        if (spec.kind === TimerKind.ALARM) {
            const {at} = nextAlarmTime(spec.hours, spec.minutes, now);
            return new Timer({
                ...common,
                durationMs: at - now,
                hours: spec.hours,
                minutes: spec.minutes,
                alarmDay: localDayKey(at),
                endsAt: at,
            });
        }

        return new Timer({
            ...common,
            durationMs: spec.durationMs,
            endsAt: now + spec.durationMs,
        });
    }

    get isRunning() {
        return this.state === TimerState.RUNNING;
    }

    get isPaused() {
        return this.state === TimerState.PAUSED;
    }

    get isFinished() {
        return this.state === TimerState.FINISHED;
    }

    get canPause() {
        return this.kind === TimerKind.COUNTDOWN && this.isRunning;
    }

    /** @param {number} now */
    remainingAt(now) {
        switch (this.state) {
        case TimerState.RUNNING:
            return Math.max(0, this.endsAt - now);
        case TimerState.PAUSED:
            return this.remainingMs;
        default:
            return 0;
        }
    }

    /**
     * @param {number} now
     * @returns {number} 0 at start … 1 when finished
     */
    progressAt(now) {
        if (this.durationMs <= 0)
            return 1;
        return Math.min(1, Math.max(0, 1 - this.remainingAt(now) / this.durationMs));
    }

    /**
     * @param {number} now
     * @returns {boolean} whether the state changed
     */
    pause(now) {
        if (!this.canPause || this.endsAt <= now)
            return false;
        this.remainingMs = this.endsAt - now;
        this.endsAt = null;
        this.state = TimerState.PAUSED;
        return true;
    }

    /**
     * @param {number} now
     * @returns {boolean} whether the state changed
     */
    resume(now) {
        if (!this.isPaused)
            return false;
        this.endsAt = now + this.remainingMs;
        this.remainingMs = null;
        this.state = TimerState.RUNNING;
        return true;
    }

    /**
     * Marks a running timer finished once its end time has passed.
     *
     * @param {number} now
     * @returns {boolean} true if it finished just now
     */
    checkFinished(now) {
        if (!this.isRunning || this.endsAt > now)
            return false;
        this.state = TimerState.FINISHED;
        this.finishedAt = this.endsAt;
        this.endsAt = null;
        return true;
    }

    /**
     * Re-anchors a running alarm to its local day and clock time, e.g. after
     * the time zone changed: "14:30 on 24 Nov" stays 14:30 on 24 Nov in the
     * new zone. If that moment has passed, the next `update()` finishes it.
     *
     * @returns {boolean} whether the end time changed
     */
    retargetAlarm() {
        if (this.kind !== TimerKind.ALARM || !this.isRunning)
            return false;
        const endsAt = localDateTime(this.alarmDay, this.hours, this.minutes);
        if (endsAt === this.endsAt)
            return false;
        this.endsAt = endsAt;
        return true;
    }

    toJSON() {
        return {
            id: this.id,
            kind: this.kind,
            input: this.input,
            label: this.label,
            sound: this.sound,
            durationMs: this.durationMs,
            hours: this.hours,
            minutes: this.minutes,
            alarmDay: this.alarmDay,
            state: this.state,
            endsAt: this.endsAt,
            remainingMs: this.remainingMs,
            startedAt: this.startedAt,
            finishedAt: this.finishedAt,
        };
    }

    /**
     * Rebuilds a timer from stored data. Returns null for anything invalid,
     * so one corrupted entry cannot break the whole list.
     *
     * @param {unknown} data
     * @returns {Timer|null}
     */
    static fromJSON(data) {
        if (!data || typeof data !== 'object')
            return null;
        const d = /** @type {Record<string, any>} */ (data);

        const isNum = v => Number.isFinite(v);
        const isOptString = v => v === null || typeof v === 'string';

        if (typeof d.id !== 'string' || !d.id || typeof d.input !== 'string')
            return null;
        if (!Object.values(TimerKind).includes(d.kind))
            return null;
        if (!Object.values(TimerState).includes(d.state))
            return null;
        if (!isOptString(d.label) || !(d.sound === null || isValidSound(d.sound)))
            return null;
        if (!isNum(d.durationMs) || d.durationMs < 0 || !isNum(d.startedAt))
            return null;
        if (d.kind === TimerKind.ALARM &&
            !(Number.isInteger(d.hours) && d.hours >= 0 && d.hours <= 23 &&
              Number.isInteger(d.minutes) && d.minutes >= 0 && d.minutes <= 59))
            return null;
        if (d.state === TimerState.RUNNING && !isNum(d.endsAt))
            return null;
        if (d.state === TimerState.PAUSED &&
            (d.kind !== TimerKind.COUNTDOWN || !isNum(d.remainingMs) || d.remainingMs < 0))
            return null;
        if (d.state === TimerState.FINISHED && !isNum(d.finishedAt))
            return null;
        if (d.kind === TimerKind.ALARM && d.alarmDay !== undefined && !isDayKey(d.alarmDay))
            return null;

        return new Timer({
            id: d.id,
            kind: d.kind,
            input: d.input,
            label: d.label,
            sound: d.sound,
            durationMs: d.durationMs,
            hours: d.kind === TimerKind.ALARM ? d.hours : null,
            minutes: d.kind === TimerKind.ALARM ? d.minutes : null,
            // Saved before alarmDay existed: take it from the end time.
            alarmDay: d.kind === TimerKind.ALARM
                ? d.alarmDay ?? localDayKey(d.endsAt ?? d.finishedAt)
                : null,
            state: d.state,
            endsAt: d.state === TimerState.RUNNING ? d.endsAt : null,
            remainingMs: d.state === TimerState.PAUSED ? d.remainingMs : null,
            startedAt: d.startedAt,
            finishedAt: d.state === TimerState.FINISHED ? d.finishedAt : null,
        });
    }
}
