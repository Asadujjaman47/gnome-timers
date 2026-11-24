import {parseInput} from './parser.js';

/**
 * Recently started timers, newest first. Entries are what the user typed
 * (`input`), so restarting one simply parses it again.
 *
 * Up to MAX_RECENT entries are kept regardless of the `recent-size` setting;
 * the menu shows the first `recent-size` of them. Lowering the setting
 * therefore hides entries instead of deleting them.
 *
 * All functions return new arrays and never modify their arguments.
 */

export const MAX_RECENT = 20;

/** @typedef {{input: string, lastUsedAt: number}} RecentEntry */

/**
 * Trims and collapses whitespace: "  5m   tea " → "5m tea".
 *
 * @param {string} input
 */
export function normalizeInput(input) {
    return String(input).trim().split(/\s+/).join(' ');
}

/**
 * Whether two inputs are the same, ignoring case and spacing.
 *
 * @param {string} a
 * @param {string} b
 */
export function sameInput(a, b) {
    return normalizeInput(a).toLowerCase() === normalizeInput(b).toLowerCase();
}

/**
 * Moves `input` to the front (adding it if new).
 *
 * @param {RecentEntry[]} list
 * @param {string} input
 * @param {number} now
 * @param {number} [max]
 * @returns {RecentEntry[]}
 */
export function addRecent(list, input, now, max = MAX_RECENT) {
    const normalized = normalizeInput(input);
    if (!normalized)
        return list.slice(0, max);
    const rest = list.filter(entry => !sameInput(entry.input, normalized));
    return [{input: normalized, lastUsedAt: now}, ...rest].slice(0, max);
}

/**
 * @param {RecentEntry[]} list
 * @param {string} input
 * @returns {RecentEntry[]}
 */
export function removeRecent(list, input) {
    return list.filter(entry => !sameInput(entry.input, input));
}

/**
 * The entries the menu shows: those that are not also presets (presets have
 * their own section), up to `size`.
 *
 * @param {RecentEntry[]} recent
 * @param {{input: string}[]} presets
 * @param {number} size - the `recent-size` setting; 0 hides the list
 * @returns {RecentEntry[]}
 */
export function visibleRecent(recent, presets, size) {
    return recent
        .filter(entry => !presets.some(p => sameInput(p.input, entry.input)))
        .slice(0, Math.max(0, size));
}

/**
 * @param {unknown} data
 * @returns {RecentEntry|null}
 */
export function recentFromJSON(data) {
    if (!data || typeof data !== 'object')
        return null;
    const {input, lastUsedAt} = /** @type {Record<string, any>} */ (data);
    if (typeof input !== 'string' || !Number.isFinite(lastUsedAt))
        return null;
    if (!parseInput(input).ok)
        return null;
    return {input: normalizeInput(input), lastUsedAt};
}
