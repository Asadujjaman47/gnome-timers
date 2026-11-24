import {test, assert} from '../harness.js';
import {MINUTE, SECOND, fakeClock, localTime} from '../helpers.js';
import {SummaryState, TimerManager} from '../../src/core/timerManager.js';
import {Timer} from '../../src/core/timer.js';

const T0 = localTime(2026, 11, 24, 13, 0);

function setup() {
    const clock = fakeClock(T0);
    let n = 0;
    const manager = new TimerManager({clock, newId: () => `id${++n}`});
    const events = [];
    for (const name of ['added', 'removed', 'updated', 'finished'])
        manager.connect(name, timer => events.push(`${name}:${timer.id}`));
    manager.connect('changed', () => events.push('changed'));
    return {clock, manager, events};
}

const start = (manager, input, options) => manager.startFromInput(input, options).timer;

test('startFromInput starts a timer and emits added + changed', () => {
    const {manager, events} = setup();
    const result = manager.startFromInput('  5m tea ', {sound: 'bell'});
    assert.ok(result.ok);
    assert.equal(result.timer.input, '5m tea');
    assert.equal(result.timer.sound, 'bell');
    assert.equal(manager.size, 1);
    assert.deepEqual(events, ['added:id1', 'changed']);
});

test('startFromInput returns the parse error and starts nothing', () => {
    const {manager, events} = setup();
    assert.deepEqual(manager.startFromInput('pizza'), {ok: false, error: 'invalid'});
    assert.equal(manager.size, 0);
    assert.deepEqual(events, []);
});

test('start() without input stores the normalised time and label', () => {
    const {manager} = setup();
    const timer = manager.start({kind: 'countdown', durationMs: MINUTE, label: 'Tea', timeText: '1m'});
    assert.equal(timer.input, '1m Tea');
});

test('many timers run independently', () => {
    const {clock, manager} = setup();
    const a = start(manager, '1m');
    const b = start(manager, '3m');
    manager.pause(a.id);
    clock.advance(2 * MINUTE);
    assert.equal(a.remainingAt(manager.now()), MINUTE);
    assert.equal(b.remainingAt(manager.now()), MINUTE);
});

test('pause, resume and stop emit their signals', () => {
    const {manager, events} = setup();
    const t = start(manager, '5m');
    events.length = 0;

    assert.ok(manager.pause(t.id));
    assert.ok(manager.resume(t.id));
    assert.ok(manager.stop(t.id));
    assert.equal(manager.get(t.id), null);
    assert.deepEqual(events, ['updated:id1', 'changed', 'updated:id1', 'changed', 'removed:id1', 'changed']);
});

test('actions on unknown ids or in the wrong state do nothing', () => {
    const {manager, events} = setup();
    const alarm = start(manager, '@14:30');
    events.length = 0;
    assert.equal(manager.pause('nope'), false);
    assert.equal(manager.resume(alarm.id), false);
    assert.equal(manager.pause(alarm.id), false);
    assert.equal(manager.stop('nope'), false);
    assert.deepEqual(events, []);
});

test('update() finishes due timers once and emits finished', () => {
    const {clock, manager, events} = setup();
    const a = start(manager, '1m');
    const b = start(manager, '2m');
    events.length = 0;

    clock.advance(MINUTE);
    assert.deepEqual(manager.update().map(t => t.id), [a.id]);
    assert.deepEqual(events, ['finished:id1', 'changed']);

    events.length = 0;
    assert.deepEqual(manager.update(), []);
    assert.deepEqual(events, []);

    clock.advance(5 * MINUTE);
    assert.deepEqual(manager.update().map(t => t.id), [b.id]);
});

test('pausing a timer whose time is already up finishes it instead', () => {
    const {clock, manager, events} = setup();
    const t = start(manager, '1m');
    events.length = 0;
    clock.advance(MINUTE + SECOND);
    assert.equal(manager.pause(t.id), false);
    assert.ok(t.isFinished);
    assert.deepEqual(events, ['finished:id1', 'changed']);
});

test('a finished timer stays until stopped (dismissed)', () => {
    const {clock, manager} = setup();
    const t = start(manager, '1s');
    clock.advance(SECOND);
    manager.update();
    assert.equal(manager.size, 1);
    manager.stop(t.id);
    assert.equal(manager.size, 0);
});

test('timers are ordered: finished, running by end, paused by time left', () => {
    const {clock, manager} = setup();
    const paused = start(manager, '10m');
    manager.pause(paused.id);
    const later = start(manager, '20m');
    const sooner = start(manager, '5m');
    const done = start(manager, '1s');
    clock.advance(SECOND);
    manager.update();

    assert.deepEqual(manager.timers.map(t => t.id), [done.id, sooner.id, later.id, paused.id]);
});

test('summary: idle, running, paused, finished', () => {
    const {clock, manager} = setup();
    assert.deepEqual(manager.summary(), {state: SummaryState.IDLE, primary: null, others: 0});

    const a = start(manager, '10m');
    const b = start(manager, '5m');
    let s = manager.summary();
    assert.equal(s.state, SummaryState.RUNNING);
    assert.equal(s.primary, b);
    assert.equal(s.others, 1);

    manager.pause(a.id);
    manager.pause(b.id);
    s = manager.summary();
    assert.equal(s.state, SummaryState.PAUSED);
    assert.equal(s.primary, b);

    const c = start(manager, '1s');
    clock.advance(SECOND);
    manager.update();
    s = manager.summary();
    assert.equal(s.state, SummaryState.FINISHED);
    assert.equal(s.primary, c);
    assert.equal(s.others, 2);
});

test('nextWakeupMs: when the displayed second changes; null when idle', () => {
    const {clock, manager} = setup();
    assert.equal(manager.nextWakeupMs(), null);

    const t = start(manager, '5s');
    assert.equal(manager.nextWakeupMs(), 1000);
    clock.advance(300);
    assert.equal(manager.nextWakeupMs(), 700);

    manager.pause(t.id);
    assert.equal(manager.nextWakeupMs(), null);
    manager.resume(t.id);

    clock.advance(10 * SECOND);
    assert.equal(manager.nextWakeupMs(), 0);
});

test('nextWakeupMs takes the soonest change across timers', () => {
    const {clock, manager} = setup();
    start(manager, '5s');
    clock.advance(400);
    start(manager, '5s');
    assert.equal(manager.nextWakeupMs(), 600);
});

test('load() replaces timers; update() then reports ones that ended meanwhile', () => {
    const {clock, manager} = setup();
    const old = start(manager, '1m');
    const stored = JSON.parse(JSON.stringify([old]));
    const fresh = new TimerManager({clock});
    const finished = [];
    fresh.connect('finished', t => finished.push(t.id));

    fresh.load(stored.map(Timer.fromJSON));
    assert.equal(fresh.size, 1);
    clock.advance(10 * MINUTE);
    fresh.update();
    assert.deepEqual(finished, [old.id]);
    assert.equal(fresh.get(old.id).finishedAt, T0 + MINUTE);
});

test('default ids are unique', () => {
    const manager = new TimerManager({clock: fakeClock(T0)});
    const ids = new Set();
    for (let i = 0; i < 50; i++)
        ids.add(start(manager, '1m').id);
    assert.equal(ids.size, 50);
});

test('destroy disconnects all handlers', () => {
    const {manager, events} = setup();
    manager.destroy();
    start(manager, '1m');
    assert.deepEqual(events, []);
});
