/**
 * Parses what the user types into the time input.
 *
 * Countdowns (the time part comes first, anything after it is the label):
 *   5        → 5 s        (digits only, microwave style: last two digits are
 *   112      → 1 min 12 s  seconds, the two before are minutes, the rest hours)
 *   53000    → 5 h 30 min
 *   1:12     → 1 min 12 s  (m:s or h:m:s)
 *   5h 30m   → units in any order; `1h30` = 1 h 30 min, `2m30` = 2 min 30 s
 *   5 min, 10 minutes, 2 hours, 1hr30min, 90sec  → unit words, with or without a space
 *   1.5h, 2,5 min  → decimals with a unit
 *   in 5 min → a leading "in" is ignored
 *   12m pizza → 12 min, label "Pizza"
 *
 * Alarms at a clock time:
 *   @14:30, @ 14:30, at 14:30, @2:30pm, at 2 pm, @7  (24 h unless am/pm)
 *   @1430, @930, @1010pm, @10.10pm  (3–4 digits: the last two are minutes)
 *   5pm, 5:30 pm, 7 am  (with am/pm, the @ is not needed)
 *   @noon, @midnight
 *   @14:30 meeting → label "Meeting"
 *
 * Invisible characters (e.g. from pasted text) are ignored, and digits from
 * other scripts (Bengali, Devanagari, Arabic, full-width, …) are read as 0–9.
 */

export const MAX_DURATION_MS = 99 * 60 * 60 * 1000;
export const MAX_LABEL_LENGTH = 100;

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
const UNIT_WORDS = new Map([
    ...['h', 'hr', 'hrs', 'hour', 'hours'].map(w => [w, 'h']),
    ...['m', 'min', 'mins', 'minute', 'minutes'].map(w => [w, 'm']),
    ...['s', 'sec', 'secs', 'second', 'seconds'].map(w => [w, 's']),
]);
// Longest first, so "min" is not read as "m" + "in".
const UNIT_ALTERNATION = [...UNIT_WORDS.keys()].sort((a, b) => b.length - a.length).join('|');
const UNIT_PIECE = `\\d+(?:[.,]\\d+)?(?:${UNIT_ALTERNATION})`;

const DIGITS_RE = /^\d+$/;
const NUMBER_RE = /^\d+(?:[.,]\d+)?$/;
const COLON_RE = /^\d+(?::\d+){1,2}$/;
const UNIT_TOKEN_RE = new RegExp(`^((?:${UNIT_PIECE})+)(\\d*)$`);
const UNIT_PIECE_RE = new RegExp(`(\\d+(?:[.,]\\d+)?)(${UNIT_ALTERNATION})`, 'g');
const CLOCK_RE = /^(\d{1,2})(?:[:.](\d{2}))?(am|pm|a|p)?$/;
const COMPACT_CLOCK_RE = /^(\d{1,2})(\d{2})(am|pm|a|p)?$/;
const MERIDIEM_RE = /^(am|pm)$/;
const NAMED_TIMES = {noon: [12, 0], midnight: [0, 0]};

const INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF]/g;
// eslint-disable-next-line no-control-regex -- control characters are what it removes
const CONTROL_RE = /[\u0000-\u001F\u007F]/g;
const FULLWIDTH = {'\uFF1A': ':', '\uFF20': '@', '\uFF0E': '.'};
/** First code point ("zero") of Unicode decimal digit blocks. */
const DIGIT_ZEROS = [
    0x0660, 0x06F0, 0x07C0, 0x0966, 0x09E6, 0x0A66, 0x0AE6, 0x0B66, 0x0BE6, 0x0C66, 0x0CE6,
    0x0D66, 0x0DE6, 0x0E50, 0x0ED0, 0x0F20, 0x1040, 0x17E0, 0x1810, 0xFF10,
];

const ok = spec => ({ok: true, spec});
const fail = error => ({ok: false, error});

/**
 * @param {string} text - raw input
 * @returns {ParseResult}
 */
export function parseInput(text) {
    const tokens = String(text ?? '')
        .replace(INVISIBLE_RE, '')
        .replace(CONTROL_RE, ' ')
        .trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0)
        return fail(ParseError.EMPTY);

    // What the time is read from; labels keep the original tokens.
    const keys = tokens.map(toKey);
    if (keys[0].startsWith('@') || keys[0] === 'at')
        return parseAlarm(tokens, keys, true);
    if (isClockWithMeridiem(keys))
        return parseAlarm(tokens, keys, false);
    return parseCountdown(tokens, keys);
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

/**
 * Lower-case, with digits from other scripts and full-width ":@." turned
 * into ASCII.
 *
 * @param {string} token
 */
function toKey(token) {
    return token
        .replace(/[\uFF1A\uFF20\uFF0E]/g, c => FULLWIDTH[c])
        .replace(/\p{Nd}/gu, c => {
            const point = c.codePointAt(0);
            const zero = DIGIT_ZEROS.find(z => point >= z && point <= z + 9);
            return zero === undefined ? c : String(point - zero);
        })
        .toLowerCase();
}

/** "5pm", "5:30pm", "5:30 pm", "7 am": a clock time even without "@". */
function isClockWithMeridiem(keys) {
    const match = CLOCK_RE.exec(keys[0]) ?? COMPACT_CLOCK_RE.exec(keys[0]);
    return Boolean(match && (match[3] || MERIDIEM_RE.test(keys[1] ?? '')));
}

/**
 * @param {string[]} tokens - as typed
 * @param {string[]} keys - normalised tokens
 * @param {boolean} marked - starts with "@" or "at"
 */
function parseAlarm(tokens, keys, marked) {
    const isAt = keys[0] === 'at';
    let index = 0;
    let clock = keys[0];
    if (marked) {
        if (keys[0] === '@' || isAt) {
            index = 1;
            clock = keys[1] ?? '';
        } else {
            clock = keys[0].slice(1);
        }
    }

    let hours, minutes;
    let used = index + 1;
    if (clock in NAMED_TIMES) {
        [hours, minutes] = NAMED_TIMES[clock];
    } else {
        const match = CLOCK_RE.exec(clock) ?? COMPACT_CLOCK_RE.exec(clock);
        if (!match) {
            // "at home" is not an alarm, just text without a time.
            return fail(isAt ? ParseError.INVALID : ParseError.INVALID_TIME);
        }

        let meridiem = match[3];
        if (!meridiem && MERIDIEM_RE.test(keys[used] ?? '')) {
            meridiem = keys[used];
            used++;
        }

        hours = Number(match[1]);
        minutes = match[2] === undefined ? 0 : Number(match[2]);
        if (minutes > 59)
            return fail(ParseError.INVALID_TIME);

        if (meridiem) {
            if (hours < 1 || hours > 12)
                return fail(ParseError.INVALID_TIME);
            hours = (hours % 12) + (meridiem[0] === 'p' ? 12 : 0);
        } else if (hours > 23) {
            return fail(ParseError.INVALID_TIME);
        }
    }

    return ok({
        kind: 'alarm',
        hours,
        minutes,
        label: makeLabel(tokens.slice(used)),
        timeText: tokens.slice(0, used).join(' '),
    });
}

/**
 * @param {string[]} tokens - as typed
 * @param {string[]} keys - normalised tokens
 */
function parseCountdown(tokens, keys) {
    // "in 5 min"
    const start = keys[0] === 'in' && keys.length > 1 ? 1 : 0;
    let index = start;
    let durationMs = 0;

    const usedUnits = new Set();
    while (index < keys.length) {
        // "5 min": a number followed by a unit word counts as one token.
        let key = keys[index];
        let width = 1;
        if (NUMBER_RE.test(key) && UNIT_WORDS.has(keys[index + 1])) {
            key += keys[index + 1];
            width = 2;
        }
        if (!UNIT_TOKEN_RE.test(key))
            break;
        const ms = unitTokenToMs(key, usedUnits);
        if (ms === null)
            return fail(ParseError.INVALID);
        durationMs += ms;
        index += width;
    }

    if (index === start) {
        const key = keys[start];
        if (DIGITS_RE.test(key)) {
            durationMs = digitsToMs(key);
        } else if (COLON_RE.test(key)) {
            durationMs = colonsToMs(key);
            if (durationMs === null)
                return fail(ParseError.INVALID);
        } else {
            return fail(ParseError.INVALID);
        }
        index = start + 1;
    }

    // Decimals ("1.5h") can give fractions of a second.
    durationMs = Math.round(durationMs / 1000) * 1000;
    if (durationMs === 0)
        return fail(ParseError.ZERO);
    if (durationMs > MAX_DURATION_MS)
        return fail(ParseError.TOO_LONG);

    return ok({
        kind: 'countdown',
        durationMs,
        label: makeLabel(tokens.slice(index)),
        timeText: tokens.slice(0, index).join(' '),
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
 * "1h30m", "45s", "1.5h", "1hr30min", "1h30" (= 1 h 30 min). Each unit may
 * appear once across the whole duration; returns null otherwise.
 */
function unitTokenToMs(token, usedUnits) {
    const [, unitPart, trailing] = UNIT_TOKEN_RE.exec(token);
    let ms = 0;
    let lastUnit = null;

    const add = (amount, unit) => {
        if (!unit || usedUnits.has(unit))
            return false;
        usedUnits.add(unit);
        ms += Number(amount.replace(',', '.')) * UNIT_MS[unit];
        lastUnit = unit;
        return true;
    };

    for (const [, amount, word] of unitPart.matchAll(UNIT_PIECE_RE)) {
        if (!add(amount, UNIT_WORDS.get(word)))
            return null;
    }
    if (trailing && !add(trailing, SMALLER_UNIT[lastUnit]))
        return null;
    return ms;
}

/** @param {string[]} words */
function makeLabel(words) {
    let label = words.join(' ');
    if (!label)
        return null;
    if (label.length > MAX_LABEL_LENGTH)
        label = `${label.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`;
    return label[0].toLocaleUpperCase() + label.slice(1);
}
