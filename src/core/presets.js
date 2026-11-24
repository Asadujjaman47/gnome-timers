import {parseInput} from './parser.js';
import {normalizeInput} from './recent.js';
import {isValidSound} from './sound.js';

/**
 * Saved timers. A preset stores its input the same way the Recent list does
 * ("4m tea"), so the time and the label come from the parser. Optionally it
 * has its own sound and one of HOTKEY_SLOTS keyboard-shortcut slots.
 *
 * All functions return new arrays/objects and never modify their arguments.
 */

export const HOTKEY_SLOTS = 9;

/**
 * @typedef {object} Preset
 * @property {string} id
 * @property {string} input
 * @property {string|null} sound - null uses the default sound
 * @property {number|null} hotkeySlot - 1…HOTKEY_SLOTS, unique across presets
 */

export const PresetError = Object.freeze({
    INVALID_ID: 'invalid-id',
    INVALID_INPUT: 'invalid-input',
    INVALID_SOUND: 'invalid-sound',
    INVALID_SLOT: 'invalid-slot',
});

/**
 * @param {Partial<Preset>} preset
 * @returns {string[]} PresetError codes; empty when valid
 */
export function validatePreset(preset) {
    const errors = [];
    if (typeof preset.id !== 'string' || !preset.id)
        errors.push(PresetError.INVALID_ID);
    if (typeof preset.input !== 'string' || !parseInput(preset.input).ok)
        errors.push(PresetError.INVALID_INPUT);
    if (!(preset.sound === null || preset.sound === undefined || isValidSound(preset.sound)))
        errors.push(PresetError.INVALID_SOUND);
    if (!isValidSlot(preset.hotkeySlot))
        errors.push(PresetError.INVALID_SLOT);
    return errors;
}

/**
 * Builds a preset with defaults filled in, or throws if it is invalid.
 *
 * @param {{id: string, input: string, sound?: string|null, hotkeySlot?: number|null}} fields
 * @returns {Preset}
 */
export function createPreset({id, input, sound = null, hotkeySlot = null}) {
    const preset = {id, input: normalizeInput(input ?? ''), sound, hotkeySlot};
    const errors = validatePreset(preset);
    if (errors.length > 0)
        throw new Error(`Invalid preset: ${errors.join(', ')}`);
    return preset;
}

/**
 * Appends a preset. If it uses a hotkey slot, other presets lose that slot.
 *
 * @param {Preset[]} list
 * @param {Preset} preset
 * @returns {Preset[]}
 */
export function addPreset(list, preset) {
    return releaseSlot(list, preset.hotkeySlot, preset.id).concat(preset);
}

/**
 * @param {Preset[]} list
 * @param {string} id
 * @param {Partial<Omit<Preset, 'id'>>} changes
 * @returns {Preset[]}
 */
export function updatePreset(list, id, changes) {
    const current = list.find(p => p.id === id);
    if (!current)
        return list;
    const updated = createPreset({...current, ...changes, id});
    return releaseSlot(list, updated.hotkeySlot, id).map(p => (p.id === id ? updated : p));
}

/**
 * @param {Preset[]} list
 * @param {string} id
 * @returns {Preset[]}
 */
export function removePreset(list, id) {
    return list.filter(p => p.id !== id);
}

/**
 * Moves a preset to `toIndex` (clamped to the list).
 *
 * @param {Preset[]} list
 * @param {string} id
 * @param {number} toIndex
 * @returns {Preset[]}
 */
export function movePreset(list, id, toIndex) {
    const from = list.findIndex(p => p.id === id);
    if (from < 0)
        return list;
    const result = list.slice();
    const [preset] = result.splice(from, 1);
    const to = Math.max(0, Math.min(toIndex, result.length));
    result.splice(to, 0, preset);
    return result;
}

/**
 * @param {Preset[]} list
 * @param {number} slot
 * @returns {Preset|null}
 */
export function presetForSlot(list, slot) {
    return list.find(p => p.hotkeySlot === slot) ?? null;
}

/**
 * Rebuilds a preset from stored data; null if invalid.
 *
 * @param {unknown} data
 * @returns {Preset|null}
 */
export function presetFromJSON(data) {
    if (!data || typeof data !== 'object')
        return null;
    try {
        return createPreset(/** @type {any} */ (data));
    } catch {
        return null;
    }
}

function isValidSlot(slot) {
    return slot === null || slot === undefined ||
        (Number.isInteger(slot) && slot >= 1 && slot <= HOTKEY_SLOTS);
}

function releaseSlot(list, slot, exceptId) {
    if (slot === null || slot === undefined)
        return list;
    return list.map(p =>
        p.hotkeySlot === slot && p.id !== exceptId ? {...p, hotkeySlot: null} : p);
}
