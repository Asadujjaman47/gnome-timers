/**
 * Parses what the user types into the time input.
 *
 * Countdowns (the time part comes first, anything after it is the label):
 *   5        → 5 s        (digits only, microwave style: last two digits are
 *   112      → 1 min 12 s  seconds, the two before are minutes, the rest hours)
 *   53000    → 5 h 30 min
 *   1:12     → 1 min 12 s  (m:s or h:m:s)
 *   5h 30m   → units in any order; `1h30` = 1 h 30 min, `2m30` = 2 min 30 s
 *   12m pizza → 12 min, label "Pizza"
 *
 * Alarms at a clock time:
 *   @14:30, @ 14:30, at 14:30, @2:30pm, at 2 pm, @7  (24 h unless am/pm)
 *   @1430, @930, @1010pm, @10.10pm  (3–4 digits: the last two are minutes)
 *   @14:30 meeting → label "Meeting"
 */

export const MAX_DURATION_MS = 99 * 60 * 60 * 1000;

/** Error codes returned in `{ok: false, error}`. */
export const ParseError = Object.freeze({
    EMPTY: 'empty',
    INVALID: 'invalid',
    ZERO: 'zero',
    TOO_LONG: 'too-long',
    INVALID_TIME: 'invalid-time',
});

/**
 * @typedef {object} CountdownSpec
 * @property {'countdown'} kind
 * @property {number} durationMs
 * @property {string|null} label
 * @property {string} timeText - the part of the input that gave the time
 */
/**
 * @typedef {object} AlarmSpec
 * @property {'alarm'} kind
 * @property {number} hours - 0–23
 * @property {number} minutes - 0–59
 * @property {string|null} label
 * @property {string} timeText
 */
/** @typedef {CountdownSpec|AlarmSpec} TimerSpec */
/**
 * @typedef {{ok: true, spec: TimerSpec} | {ok: false, error: string}} ParseResult
 */

const UNIT_MS = {h: 3_600_000, m: 60_000, s: 1_000};
const SMALLER_UNIT = {h: 'm', m: 's'};

const DIGITS_RE = /^\d+$/;
const COLON_RE = /^\d+(?::\d+){1,2}$/;
const UNIT_TOKEN_RE = /^((?:\d+[hms])+)(\d*)$/i;
const CLOCK_RE = /^(\d{1,2})(?:[:.](\d{2}))?(am|pm|a|p)?$/i;
const COMPACT_CLOCK_RE = /^(\d{1,2})(\d{2})(am|pm|a|p)?$/i;
const MERIDIEM_RE = /^(am|pm)$/i;

const ok = spec => ({ok: true, spec});
const fail = error => ({ok: false, error});

/**
 * @param {string} text - raw input
 * @returns {ParseResult}
 */
export function parseInput(text) {
    const tokens = String(text ?? '').trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0)
        return fail(ParseError.EMPTY);

    const first = tokens[0].toLowerCase();
    if (first.startsWith('@') || first === 'at')
        return parseAlarm(tokens);
    return parseCountdown(tokens);
}

/**
 * The next moment the clock shows `hours:minutes` after `nowMs`, in local
 * time. A time that is not later than now means tomorrow.
 *
 * @param {number} hours
 * @param {number} minutes
 * @param {number} nowMs
 * @returns {{at: number, tomorrow: boolean}}
 */
export function nextAlarmTime(hours, minutes, nowMs) {
    const date = new Date(nowMs);
    date.setHours(hours, minutes, 0, 0);
    if (date.getTime() > nowMs)
        return {at: date.getTime(), tomorrow: false};

    // setDate + setHours (rather than adding 24 h) stays correct across DST changes.
    date.setDate(date.getDate() + 1);
    date.setHours(hours, minutes, 0, 0);
    return {at: date.getTime(), tomorrow: true};
}

/** @param {string[]} tokens */
function parseAlarm(tokens) {
    const isAt = tokens[0].toLowerCase() === 'at';
    const rest = tokens[0] === '@' || isAt
        ? tokens.slice(1)
        : [tokens[0].slice(1), ...tokens.slice(1)];

    const match = CLOCK_RE.exec(rest[0] ?? '') ?? COMPACT_CLOCK_RE.exec(rest[0] ?? '');
    if (!match) {
        // "at home" is not an alarm, just text without a time.
        return fail(isAt ? ParseError.INVALID : ParseError.INVALID_TIME);
    }

    let used = 1;
    let meridiem = match[3];
    if (!meridiem && MERIDIEM_RE.test(rest[1] ?? '')) {
        meridiem = rest[1];
        used = 2;
    }

    let hours = Number(match[1]);
    const minutes = match[2] === undefined ? 0 : Number(match[2]);
    if (minutes > 59)
        return fail(ParseError.INVALID_TIME);

    if (meridiem) {
        if (hours < 1 || hours > 12)
            return fail(ParseError.INVALID_TIME);
        const pm = meridiem[0].toLowerCase() === 'p';
        hours = (hours % 12) + (pm ? 12 : 0);
    } else if (hours > 23) {
        return fail(ParseError.INVALID_TIME);
    }

    const timeCount = tokens.length - rest.length + used;
    return ok({
        kind: 'alarm',
        hours,
        minutes,
        label: makeLabel(tokens.slice(timeCount)),
        timeText: tokens.slice(0, timeCount).join(' '),
    });
}

/** @param {string[]} tokens */
function parseCountdown(tokens) {
    let durationMs = 0;
    let count = 0;

    if (DIGITS_RE.test(tokens[0])) {
        durationMs = digitsToMs(tokens[0]);
        count = 1;
    } else if (COLON_RE.test(tokens[0])) {
        durationMs = colonsToMs(tokens[0]);
        if (durationMs === null)
            return fail(ParseError.INVALID);
        count = 1;
    } else {
        const usedUnits = new Set();
        while (count < tokens.length && UNIT_TOKEN_RE.test(tokens[count])) {
            const ms = unitTokenToMs(tokens[count], usedUnits);
            if (ms === null)
                return fail(ParseError.INVALID);
            durationMs += ms;
            count++;
        }
        if (count === 0)
            return fail(ParseError.INVALID);
    }

    if (durationMs === 0)
        return fail(ParseError.ZERO);
    if (durationMs > MAX_DURATION_MS)
        return fail(ParseError.TOO_LONG);

    return ok({
        kind: 'countdown',
        durationMs,
        label: makeLabel(tokens.slice(count)),
        timeText: tokens.slice(0, count).join(' '),
    });
}

/** "53000" → 5 h 30 min 0 s. Lenient: "199" is 1 min 99 s. */
function digitsToMs(digits) {
    const seconds = Number(digits.slice(-2));
    const minutes = Number(digits.slice(-4, -2) || 0);
    const hours = Number(digits.slice(0, -4) || 0);
    return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

/** "1:12" or "1:02:03". Strict: lower parts must be < 60. */
function colonsToMs(text) {
    const parts = text.split(':').map(Number);
    if (parts.slice(1).some(p => p > 59))
        return null;
    const [h, m, s] = parts.length === 3 ? parts : [0, ...parts];
    return ((h * 60 + m) * 60 + s) * 1000;
}

/**
 * "1h30m", "45s", "1h30" (= 1 h 30 min). Each unit may appear once across
 * the whole duration; returns null otherwise.
 */
function unitTokenToMs(token, usedUnits) {
    const [, unitPart, trailing] = UNIT_TOKEN_RE.exec(token);
    let ms = 0;
    let lastUnit = null;

    const add = (amount, unit) => {
        if (!unit || usedUnits.has(unit))
            return false;
        usedUnits.add(unit);
        ms += Number(amount) * UNIT_MS[unit];
        lastUnit = unit;
        return true;
    };

    for (const [, amount, unit] of unitPart.matchAll(/(\d+)([hms])/gi)) {
        if (!add(amount, unit.toLowerCase()))
            return null;
    }
    if (trailing && !add(trailing, SMALLER_UNIT[lastUnit]))
        return null;
    return ms;
}

/** @param {string[]} words */
function makeLabel(words) {
    const label = words.join(' ');
    if (!label)
        return null;
    return label[0].toLocaleUpperCase() + label.slice(1);
}
