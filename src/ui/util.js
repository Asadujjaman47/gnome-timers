/** Small helpers shared by the UI widgets. */

const DIMMED_OPACITY = 140;

/**
 * @param {import('gi://St').default.Widget} actor
 * @param {string} name
 * @param {boolean} enabled
 */
export function setStyleClass(actor, name, enabled) {
    if (enabled)
        actor.add_style_class_name(name);
    else
        actor.remove_style_class_name(name);
}

/**
 * Greys an actor out. St CSS has no opacity property, so it is set here;
 * using opacity (not a colour) keeps it right in light and dark styles.
 *
 * @param {import('gi://Clutter').default.Actor} actor
 * @param {boolean} dimmed
 */
export function setDimmed(actor, dimmed) {
    actor.opacity = dimmed ? DIMMED_OPACITY : 255;
}
