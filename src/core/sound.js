/**
 * Sound identifiers. A sound is stored as one string: a built-in id or a
 * file:// URI. `null` on a timer or preset means "use the default sound".
 * Resolving ids to actual files happens in src/services/sounds.js.
 */

export const BUILTIN_SOUNDS = Object.freeze(['bell', 'complete', 'message']);
export const DEFAULT_SOUND = 'complete';

/**
 * @param {unknown} value
 * @returns {boolean} true for a built-in id or an absolute file:// URI
 */
export function isValidSound(value) {
    return typeof value === 'string' &&
        (BUILTIN_SOUNDS.includes(value) || /^file:\/\/\/./.test(value));
}
