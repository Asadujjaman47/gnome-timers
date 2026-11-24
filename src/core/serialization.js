import {presetFromJSON} from './presets.js';
import {MAX_RECENT, recentFromJSON} from './recent.js';
import {Timer} from './timer.js';

/**
 * Converts timers, presets and the Recent list to and from the JSON strings
 * stored in GSettings. Decoding never throws: invalid JSON gives an empty
 * list and invalid entries are dropped (and counted), so a corrupted setting
 * cannot stop the extension from loading.
 *
 * DATA_VERSION is stored in the `data-version` key. When the stored format
 * changes, bump it and add a step to MIGRATIONS.
 */

export const DATA_VERSION = 1;

/**
 * MIGRATIONS[n] upgrades stored data from version n to n + 1.
 *
 * @type {Record<number, (data: StoredData) => StoredData>}
 */
const MIGRATIONS = {};

/**
 * @typedef {object} StoredData
 * @property {unknown[]} timers
 * @property {unknown[]} presets
 * @property {unknown[]} recent
 */

/**
 * @template T
 * @typedef {{items: T[], dropped: number}} Decoded
 */

/**
 * Upgrades raw stored lists to DATA_VERSION. Data from a newer version
 * (after a downgrade) is passed through; invalid entries are then dropped by
 * the decoders.
 *
 * @param {StoredData} data
 * @param {number} fromVersion
 * @param {Record<number, (data: StoredData) => StoredData>} [migrations] - for tests
 * @returns {StoredData}
 */
export function migrate(data, fromVersion, migrations = MIGRATIONS) {
    let result = data;
    for (let v = fromVersion; v < DATA_VERSION; v++) {
        const step = migrations[v];
        if (step)
            result = step(result);
    }
    return result;
}

/**
 * Parses a JSON array; anything else becomes [].
 *
 * @param {string} json
 * @returns {unknown[]}
 */
export function parseList(json) {
    try {
        const value = JSON.parse(json);
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

/** @param {Timer[]} timers */
export function encodeTimers(timers) {
    return JSON.stringify(timers.map(t => t.toJSON()));
}

/**
 * @param {unknown[]} list
 * @returns {Decoded<Timer>}
 */
export function decodeTimers(list) {
    const decoded = decodeWith(list, Timer.fromJSON);
    // Ids must be unique; keep the first of any duplicates.
    const seen = new Set();
    const items = decoded.items.filter(t => !seen.has(t.id) && seen.add(t.id));
    return {items, dropped: decoded.dropped + decoded.items.length - items.length};
}

/** @param {import('./presets.js').Preset[]} presets */
export function encodePresets(presets) {
    return JSON.stringify(presets);
}

/**
 * Drops invalid presets and duplicate ids; a hotkey slot used twice is kept
 * only on the first preset.
 *
 * @param {unknown[]} list
 * @returns {Decoded<import('./presets.js').Preset>}
 */
export function decodePresets(list) {
    const decoded = decodeWith(list, presetFromJSON);
    const ids = new Set();
    const slots = new Set();
    const items = [];
    for (const preset of decoded.items) {
        if (ids.has(preset.id))
            continue;
        ids.add(preset.id);
        if (preset.hotkeySlot !== null) {
            if (slots.has(preset.hotkeySlot)) {
                items.push({...preset, hotkeySlot: null});
                continue;
            }
            slots.add(preset.hotkeySlot);
        }
        items.push(preset);
    }
    return {items, dropped: decoded.dropped + decoded.items.length - items.length};
}

/** @param {import('./recent.js').RecentEntry[]} recent */
export function encodeRecent(recent) {
    return JSON.stringify(recent);
}

/**
 * @param {unknown[]} list
 * @returns {Decoded<import('./recent.js').RecentEntry>}
 */
export function decodeRecent(list) {
    const decoded = decodeWith(list, recentFromJSON);
    const items = decoded.items.slice(0, MAX_RECENT);
    return {items, dropped: decoded.dropped + decoded.items.length - items.length};
}

function decodeWith(list, fromJSON) {
    const items = [];
    let dropped = 0;
    for (const entry of list) {
        const item = fromJSON(entry);
        if (item)
            items.push(item);
        else
            dropped++;
    }
    return {items, dropped};
}
