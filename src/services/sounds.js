import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {DEFAULT_SOUND, isValidSound} from '../core/sound.js';

/*
 * Resolves sound ids to files. Shared by the extension and the preferences
 * window (it only depends on Gio/GLib).
 */

/** Files of the freedesktop sound theme used for the built-in sounds. */
const BUILTIN_FILES = Object.freeze({
    bell: 'bell.oga',
    complete: 'complete.oga',
    message: 'message-new-instant.oga',
});

const FALLBACK_FILE = 'sounds/fallback.oga';

/**
 * Finds a built-in sound in the freedesktop sound theme, searching the XDG
 * data directories (not only /usr/share).
 *
 * @param {string} id - 'bell' | 'complete' | 'message'
 * @returns {Gio.File|null}
 */
export function builtinSoundFile(id) {
    const name = BUILTIN_FILES[id];
    if (!name)
        return null;
    const dirs = [GLib.get_user_data_dir(), ...GLib.get_system_data_dirs()];
    for (const dir of dirs) {
        const file = Gio.File.new_for_path(
            GLib.build_filenamev([dir, 'sounds', 'freedesktop', 'stereo', name]));
        if (file.query_exists(null))
            return file;
    }
    return null;
}

/**
 * @param {string} sound - built-in id or file:// URI
 * @returns {Gio.File|null} the file, if it exists
 */
export function soundFile(sound) {
    if (!isValidSound(sound))
        return null;
    if (sound.startsWith('file://')) {
        const file = Gio.File.new_for_uri(sound);
        return file.query_exists(null) ? file : null;
    }
    return builtinSoundFile(sound);
}

/**
 * The file to play: the timer's sound, else the default sound, else the
 * built-in default, else the fallback chime bundled with the extension.
 *
 * @param {string|null} sound - the timer's or preset's sound
 * @param {string} defaultSound - the `default-sound` setting
 * @param {Gio.File} extensionDir
 * @returns {Gio.File}
 */
export function resolveSound(sound, defaultSound, extensionDir) {
    for (const candidate of [sound, defaultSound, DEFAULT_SOUND]) {
        const file = candidate ? soundFile(candidate) : null;
        if (file)
            return file;
    }
    return extensionDir.resolve_relative_path(FALLBACK_FILE);
}
