/**
 * Shared test helpers.
 */

/**
 * A clock the test moves by hand.
 *
 * @param {number} start - ms timestamp
 */
export function fakeClock(start) {
    let now = start;
    return {
        now: () => now,
        advance(ms) {
            now += ms;
        },
        set(ms) {
            now = ms;
        },
    };
}

/** A local-time timestamp; month is 1-based here for readability. */
export function localTime(year, month, day, hours = 0, minutes = 0, seconds = 0, ms = 0) {
    return new Date(year, month - 1, day, hours, minutes, seconds, ms).getTime();
}

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
