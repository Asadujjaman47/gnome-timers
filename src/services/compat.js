import Clutter from 'gi://Clutter';

/*
 * Differences between the GNOME Shell versions we support (46–51) live here,
 * so the rest of the code can stay version-agnostic.
 */

/**
 * Makes an St.BoxLayout vertical. GNOME 48 added `orientation` and deprecated
 * `vertical`; GNOME 51 removed `vertical`.
 *
 * @param {import('gi://St').default.BoxLayout} box
 * @returns {typeof box}
 */
export function makeVertical(box) {
    if ('orientation' in box)
        box.orientation = Clutter.Orientation.VERTICAL;
    else
        box.vertical = true;
    return box;
}
