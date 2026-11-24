import GLib from 'gi://GLib';
import System from 'system';

import {test, assert} from '../harness.js';
import {MINUTE, fakeClock} from '../helpers.js';
import {localDateTime, localDayKey} from '../../src/core/localTime.js';
import {Timer} from '../../src/core/timer.js';
import {TimerManager} from '../../src/core/timerManager.js';

/**
 * Runs `fn` with the process time zone set to `tz`, then restores it.
 * SpiderMonkey caches the zone, hence clearDateCaches (as GNOME Shell does).
 */
function inTimeZone(tz, fn) {
    const original = GLib.getenv('TZ');
    try {
        GLib.setenv('TZ', tz, true);
        System.clearDateCaches();
        return fn();
    } finally {
        if (original === null)
            GLib.unsetenv('TZ');
        else
            GLib.setenv('TZ', original, true);
        System.clearDateCaches();
    }
}

test('localDayKey / localDateTime round trip', () => {
    const ms = localDateTime('2026-11-24', 14, 30);
    assert.equal(localDayKey(ms), '2026-11-24');
    const d = new Date(ms);
    assert.deepEqual([d.getHours(), d.getMinutes()], [14, 30]);
});

test('after a time zone change an alarm still rings at its local day and time', () => {
    // Set in Dhaka at 13:00 for 14:30.
    const {manager, alarm} = inTimeZone('Asia/Dhaka', () => {
        const manager = new TimerManager({clock: fakeClock(localDateTime('2026-11-24', 13, 0))});
        return {manager, alarm: manager.startFromInput('@14:30 meeting').timer};
    });
    const dhakaEndsAt = alarm.endsAt;

    // Fly to Berlin (local time there is 08:00). The alarm should now ring
    // at 14:30 Berlin time on the same day.
    inTimeZone('Europe/Berlin', () => {
        const updated = [];
        manager.connect('updated', t => updated.push(t.id));
        manager.retargetAlarms();

        const d = new Date(alarm.endsAt);
        assert.equal(localDayKey(alarm.endsAt), '2026-11-24');
        assert.deepEqual([d.getHours(), d.getMinutes()], [14, 30]);
        assert.equal(alarm.endsAt - dhakaEndsAt, 5 * 60 * MINUTE); // UTC+6 → UTC+1
        assert.deepEqual(updated, [alarm.id]);
        assert.ok(alarm.isRunning);
    });
});

test('an alarm whose local time has already passed in the new zone finishes', () => {
    // Set in Berlin at 13:00 for 14:30; then the zone becomes Tokyo, where
    // it is already 21:00, so 14:30 on that day has passed.
    const {manager, alarm} = inTimeZone('Europe/Berlin', () => {
        const clock = fakeClock(localDateTime('2026-11-24', 13, 0));
        const manager = new TimerManager({clock});
        return {manager, alarm: manager.startFromInput('@14:30').timer};
    });

    inTimeZone('Asia/Tokyo', () => {
        const finished = [];
        manager.connect('finished', t => finished.push(t.id));
        manager.retargetAlarms();
        assert.deepEqual(finished, [alarm.id]);
    });
});

test('countdowns are not affected by a time zone change', () => {
    const clock = fakeClock(Date.UTC(2026, 10, 24, 7, 0));
    const manager = new TimerManager({clock});
    const timer = manager.startFromInput('25m').timer;
    const endsAt = timer.endsAt;
    inTimeZone('America/New_York', () => manager.retargetAlarms());
    assert.equal(timer.endsAt, endsAt);
});

test('alarms saved before alarmDay existed get it from their end time', () => {
    const clock = fakeClock(localDateTime('2026-11-24', 13, 0));
    const manager = new TimerManager({clock});
    const json = manager.startFromInput('@14:30').timer.toJSON();
    delete json.alarmDay;
    assert.equal(Timer.fromJSON(json).alarmDay, '2026-11-24');
    assert.equal(Timer.fromJSON({...json, alarmDay: 'yesterday'}), null);
});
