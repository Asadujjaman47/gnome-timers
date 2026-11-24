/**
 * What happens when a timer finishes.
 *
 * By default a finished timer plays its sound once, shows a normal
 * notification (a short banner that moves to the notification list; hidden
 * during Do Not Disturb) and clears itself. Only with "repeat until dismissed"
 * does it keep ringing, stay in the menu and get a Stop button.
 */

/**
 * A timer that finished longer ago than this (e.g. while logged out) is
 * reported silently, with "Finished at …".
 */
export const LATE_LIMIT_MS = 60_000;

/**
 * @param {object} situation
 * @param {boolean} situation.late - finished more than LATE_LIMIT_MS ago
 * @param {boolean} situation.dndActive - Do Not Disturb is on
 * @param {boolean} situation.silenceInDnd - the "silence during DND" setting
 * @param {boolean} situation.loopSound - the "repeat until dismissed" setting
 * @returns {{playSound: boolean, ringUntilDismissed: boolean}}
 *   ringUntilDismissed: loop the sound, keep the timer and add a Stop button;
 *   otherwise the timer clears itself right away
 */
export function alarmBehavior({late, dndActive, silenceInDnd, loopSound}) {
    const playSound = !late && !(dndActive && silenceInDnd);
    return {playSound, ringUntilDismissed: playSound && loopSound};
}
