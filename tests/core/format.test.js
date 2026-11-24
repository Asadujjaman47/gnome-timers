import {test, assert} from '../harness.js';
import {HOUR, MINUTE, SECOND, localTime} from '../helpers.js';
import {Formatter} from '../../src/core/format.js';
import {ParseError, parseInput} from '../../src/core/parser.js';
import {Timer} from '../../src/core/timer.js';

const f = new Formatter();
const spec = input => parseInput(input).spec;

test('remaining: m:ss under an hour, h:mm:ss above', () => {
    assert.equal(f.remaining(5 * SECOND), '0:05');
    assert.equal(f.remaining(4 * MINUTE + 59 * SECOND), '4:59');
    assert.equal(f.remaining(25 * MINUTE), '25:00');
    assert.equal(f.remaining(HOUR + 2 * MINUTE + 3 * SECOND), '1:02:03');
    assert.equal(f.remaining(99 * HOUR), '99:00:00');
});

test('remaining rounds up, so 0:00 only shows when finished', () => {
    assert.equal(f.remaining(1), '0:01');
    assert.equal(f.remaining(999), '0:01');
    assert.equal(f.remaining(1000), '0:01');
    assert.equal(f.remaining(1001), '0:02');
    assert.equal(f.remaining(5 * MINUTE - 1), '5:00');
    assert.equal(f.remaining(0), '0:00');
    assert.equal(f.remaining(-500), '0:00');
});

test('duration names', () => {
    assert.equal(f.duration(45 * SECOND), '45 s');
    assert.equal(f.duration(25 * MINUTE), '25 min');
    assert.equal(f.duration(HOUR + 30 * MINUTE), '1 h 30 min');
    assert.equal(f.duration(2 * HOUR), '2 h');
    assert.equal(f.duration(MINUTE + 12 * SECOND), '1 min 12 s');
    assert.equal(f.duration(HOUR + 5 * SECOND), '1 h 5 s');
    assert.equal(f.duration(0), '0 s');
});

test('clock: 24-hour and 12-hour', () => {
    assert.equal(f.clock(14, 30, false), '14:30');
    assert.equal(f.clock(7, 5, false), '07:05');
    assert.equal(f.clock(0, 0, false), '00:00');
    assert.equal(f.clock(14, 30, true), '2:30 PM');
    assert.equal(f.clock(0, 15, true), '12:15 AM');
    assert.equal(f.clock(12, 0, true), '12:00 PM');
    assert.equal(f.clock(9, 0, true), '9:00 AM');
});

test('timerName: label, else automatic name', () => {
    assert.equal(f.timerName(spec('12m pizza'), false), 'Pizza');
    assert.equal(f.timerName(spec('25m'), false), '25 min');
    assert.equal(f.timerName(spec('1h30m'), false), '1 h 30 min');
    assert.equal(f.timerName(spec('@14:30'), false), 'Alarm 14:30');
    assert.equal(f.timerName(spec('@14:30'), true), 'Alarm 2:30 PM');
    assert.equal(f.timerName(spec('@14:30 meeting'), false), 'Meeting');
});

test('preview: duration or alarm, plus label', () => {
    const now = localTime(2026, 11, 24, 13, 0);
    assert.equal(f.preview(spec('12m pizza'), now, false), '12 min · Pizza');
    assert.equal(f.preview(spec('500'), now, false), '5 min');
    assert.equal(f.preview(spec('@14:30'), now, false), 'Alarm 14:30');
    assert.equal(f.preview(spec('@7 wake up'), now, false), 'Alarm tomorrow 07:00 · Wake up');
    assert.equal(f.preview(spec('@7'), now, true), 'Alarm tomorrow 7:00 AM');
});

test('parse error messages; empty input shows nothing', () => {
    assert.equal(f.parseError(ParseError.EMPTY), '');
    for (const error of [ParseError.INVALID, ParseError.ZERO, ParseError.TOO_LONG, ParseError.INVALID_TIME])
        assert.ok(f.parseError(error).length > 0, error);
});

function finishedTimer(input, startedAt = localTime(2026, 11, 24, 14, 2)) {
    const timer = Timer.create({id: 'x', spec: parseInput(input).spec, input, now: startedAt});
    timer.checkFinished(timer.endsAt);
    return timer;
}

test('notification text for countdowns and alarms, labelled or not', () => {
    const opts = {use12h: false};
    assert.deepEqual(f.notification(finishedTimer('12m pizza'), opts),
        {title: 'Pizza', body: '12 min timer finished'});
    assert.deepEqual(f.notification(finishedTimer('25m'), opts),
        {title: '25 min', body: 'Timer finished'});
    assert.deepEqual(f.notification(finishedTimer('@14:30 meeting'), opts),
        {title: 'Meeting', body: 'Alarm at 14:30'});
    assert.deepEqual(f.notification(finishedTimer('@14:30'), {use12h: true}),
        {title: 'Alarm 2:30 PM', body: 'Time is up'});
});

test('notification text when late, or when names clash', () => {
    const timer = finishedTimer('5m');
    assert.deepEqual(f.notification(timer, {use12h: false, late: true}),
        {title: '5 min', body: 'Finished at 14:07'});
    assert.deepEqual(f.notification(timer, {use12h: false, duplicateName: true}),
        {title: '5 min (started 14:02)', body: 'Timer finished'});
});

function runningTimer(input, now) {
    return Timer.create({id: 'x', spec: parseInput(input).spec, input, now});
}

test('alarmTime: today or tomorrow, in the clock format', () => {
    const now = localTime(2026, 11, 24, 13, 0);
    assert.equal(f.alarmTime(runningTimer('@14:30', now), now, false), '14:30');
    assert.equal(f.alarmTime(runningTimer('@7', now), now, false), 'tomorrow 07:00');
    assert.equal(f.alarmTime(runningTimer('@7', now), now, true), 'tomorrow 7:00 AM');
});

test('alarmTime: "tomorrow" disappears once that day has come', () => {
    const now = localTime(2026, 11, 24, 23, 0);
    const alarm = runningTimer('@7', now);
    assert.equal(f.alarmTime(alarm, now, false), 'tomorrow 07:00');
    assert.equal(f.alarmTime(alarm, localTime(2026, 11, 25, 0, 1), false), '07:00');
});

test('rowName: alarms always show when they ring', () => {
    const now = localTime(2026, 11, 24, 13, 0);
    assert.equal(f.rowName(runningTimer('@14:30 meeting', now), now, false), 'Meeting · 14:30');
    assert.equal(f.rowName(runningTimer('@14:30', now), now, false), 'Alarm 14:30');
    assert.equal(f.rowName(runningTimer('@7', now), now, false), 'Alarm tomorrow 07:00');
    assert.equal(f.rowName(runningTimer('@7 gym', now), now, true), 'Gym · tomorrow 7:00 AM');
    assert.equal(f.rowName(runningTimer('12m pizza', now), now, false), 'Pizza');
    assert.equal(f.rowName(runningTimer('25m', now), now, false), '25 min');
});

test('all text goes through the given gettext function', () => {
    const translated = new Formatter({gettext: s => `[${s}]`});
    assert.equal(translated.duration(HOUR + MINUTE), '[1 h] [1 min]');
    assert.equal(translated.clock(14, 0, true), '2:00 [PM]');
    assert.equal(translated.timerName(spec('@14:00'), false), '[Alarm 14:00]');
    assert.equal(translated.parseError(ParseError.ZERO), '[The time must be longer than zero]');
});
