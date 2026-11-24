import {test, assert} from '../harness.js';
import {MINUTE, SECOND, localTime} from '../helpers.js';
import {parseInput} from '../../src/core/parser.js';
import {Timer, TimerState} from '../../src/core/timer.js';

const T0 = localTime(2026, 11, 24, 13, 0);

function create(input, now = T0, sound = null) {
    return Timer.create({id: 't1', spec: parseInput(input).spec, input, sound, now});
}

test('a countdown starts running with an absolute end time', () => {
    const t = create('5m tea');
    assert.equal(t.state, TimerState.RUNNING);
    assert.equal(t.kind, 'countdown');
    assert.equal(t.label, 'Tea');
    assert.equal(t.input, '5m tea');
    assert.equal(t.durationMs, 5 * MINUTE);
    assert.equal(t.endsAt, T0 + 5 * MINUTE);
    assert.equal(t.remainingAt(T0 + MINUTE), 4 * MINUTE);
});

test('an alarm ends at its clock time; duration is from start to then', () => {
    const t = create('@14:30 meeting');
    assert.equal(t.kind, 'alarm');
    assert.equal(t.endsAt, localTime(2026, 11, 24, 14, 30));
    assert.equal(t.durationMs, 90 * MINUTE);
    assert.deepEqual([t.hours, t.minutes], [14, 30]);
});

test('an alarm for a time already passed rings tomorrow', () => {
    const t = create('@7');
    assert.equal(t.endsAt, localTime(2026, 11, 25, 7, 0));
});

test('pause keeps the time left; resume continues from it', () => {
    const t = create('5m');
    assert.ok(t.pause(T0 + MINUTE));
    assert.equal(t.state, TimerState.PAUSED);
    assert.equal(t.remainingAt(T0 + 10 * MINUTE), 4 * MINUTE);

    assert.ok(t.resume(T0 + 10 * MINUTE));
    assert.equal(t.state, TimerState.RUNNING);
    assert.equal(t.endsAt, T0 + 14 * MINUTE);
});

test('pause/resume only from the right state', () => {
    const t = create('5m');
    assert.equal(t.resume(T0), false);
    assert.ok(t.pause(T0));
    assert.equal(t.pause(T0), false);
});

test('alarms cannot be paused', () => {
    const t = create('@14:30');
    assert.equal(t.canPause, false);
    assert.equal(t.pause(T0), false);
    assert.equal(t.state, TimerState.RUNNING);
});

test('a timer whose time is up cannot be paused (it finishes instead)', () => {
    const t = create('5m');
    assert.equal(t.pause(T0 + 5 * MINUTE), false);
});

test('checkFinished finishes once, recording when it was due', () => {
    const t = create('5m');
    assert.equal(t.checkFinished(T0 + 5 * MINUTE - 1), false);
    assert.ok(t.checkFinished(T0 + 7 * MINUTE));
    assert.equal(t.state, TimerState.FINISHED);
    assert.equal(t.finishedAt, T0 + 5 * MINUTE);
    assert.equal(t.remainingAt(T0 + 8 * MINUTE), 0);
    assert.equal(t.checkFinished(T0 + 8 * MINUTE), false);
});

test('a paused timer never finishes', () => {
    const t = create('5s');
    t.pause(T0 + SECOND);
    assert.equal(t.checkFinished(T0 + 10 * MINUTE), false);
});

test('progress goes from 0 to 1', () => {
    const t = create('4m');
    assert.equal(t.progressAt(T0), 0);
    assert.equal(t.progressAt(T0 + MINUTE), 0.25);
    assert.equal(t.progressAt(T0 + 10 * MINUTE), 1);
});

test('JSON round trip in every state', () => {
    const running = create('5m tea', T0, 'bell');
    const paused = create('10m');
    paused.pause(T0 + MINUTE);
    const finished = create('1s');
    finished.checkFinished(T0 + SECOND);
    const alarm = create('@14:30 meeting');

    for (const t of [running, paused, finished, alarm]) {
        const copy = Timer.fromJSON(JSON.parse(JSON.stringify(t)));
        assert.ok(copy instanceof Timer);
        assert.deepEqual(copy.toJSON(), t.toJSON());
    }
});

test('fromJSON rejects invalid data', () => {
    const good = create('5m').toJSON();
    const bad = [
        null,
        'x',
        {...good, id: ''},
        {...good, kind: 'stopwatch'},
        {...good, state: 'sleeping'},
        {...good, endsAt: null},
        {...good, durationMs: -1},
        {...good, label: 5},
        {...good, sound: 'trumpet'},
        {...create('@14:30').toJSON(), hours: 24},
        {...good, state: 'paused', remainingMs: null},
        {...create('@14:30').toJSON(), state: 'paused', remainingMs: 1000},
        {...good, state: 'finished', finishedAt: null},
    ];
    for (const data of bad)
        assert.equal(Timer.fromJSON(data), null, JSON.stringify(data));
});
