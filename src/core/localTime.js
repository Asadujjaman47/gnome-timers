/**
 * Local calendar-day helpers. Alarms remember the local day and clock time
 * they ring at, so they can be re-anchored when the time zone changes.
 */

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * @param {number} ms
 * @returns {string} local date as "YYYY-MM-DD"
 */
export function localDayKey(ms) {
    const d = new Date(ms);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** @param {unknown} value */
export function isDayKey(value) {
    return typeof value === 'string' && DAY_KEY_RE.test(value);
}

/**
 * The moment the local clock shows `hours:minutes` on `dayKey`, in the
 * current time zone.
 *
 * @param {string} dayKey - "YYYY-MM-DD"
 * @param {number} hours
 * @param {number} minutes
 * @returns {number} ms timestamp
 */
export function localDateTime(dayKey, hours, minutes) {
    const [, y, m, d] = DAY_KEY_RE.exec(dayKey);
    return new Date(Number(y), Number(m) - 1, Number(d), hours, minutes, 0, 0).getTime();
}
