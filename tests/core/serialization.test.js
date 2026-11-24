import {test, assert} from '../harness.js';
import {MINUTE, fakeClock, localTime} from '../helpers.js';
import {
    DATA_VERSION, decodePresets, decodeRecent, decodeTimers, encodePresets, encodeRecent,
    encodeTimers, migrate, parseList,
} from '../../src/core/serialization.js';
import {createPreset} from '../../src/core/presets.js';
import {MAX_RECENT} from '../../src/core/recent.js';
import {TimerManager} from '../../src/core/timerManager.js';

const T0 = localTime(2026, 11, 24, 13, 0);

test('parseList: arrays only; bad JSON gives []', () => {
    assert.deepEqual(parseList('[1,2]'), [1, 2]);
    assert.deepEqual(parseList('{"a":1}'), []);
    assert.deepEqual(parseList('not json'), []);
    assert.deepEqual(parseList(''), []);
});

test('timers survive an encode/decode round trip in every state', () => {
    const clock = fakeClock(T0);
    const manager = new TimerManager({clock});
    manager.startFromInput('5m tea', {sound: 'bell'});
    manager.pause(manager.startFromInput('10m').timer.id);
    manager.startFromInput('@14:30 meeting');
    manager.startFromInput('1s');
    clock.advance(MINUTE);
    manager.update();

    const {items, dropped} = decodeTimers(parseList(encodeTimers(manager.timers)));
    assert.equal(dropped, 0);
    assert.deepEqual(items.map(t => t.toJSON()), manager.timers.map(t => t.toJSON()));
});

test('decodeTimers drops invalid entries and duplicate ids', () => {
    const manager = new TimerManager({clock: fakeClock(T0)});
    const t = manager.startFromInput('5m').timer.toJSON();
    const {items, dropped} = decodeTimers([t, {...t}, {broken: true}, null]);
    assert.equal(items.length, 1);
    assert.equal(dropped, 3);
});

test('presets round trip; duplicate ids dropped, duplicate hotkey slots cleared', () => {
    const presets = [
        createPreset({id: 'a', input: '4m tea', sound: 'bell', hotkeySlot: 1}),
        createPreset({id: 'b', input: '8m eggs', hotkeySlot: 2}),
    ];
    assert.deepEqual(decodePresets(parseList(encodePresets(presets))), {items: presets, dropped: 0});

    const messy = [
        presets[0],
        {...presets[0], input: '1m'},
        {...presets[1], hotkeySlot: 1},
        {id: 'c', input: 'nonsense'},
    ];
    const {items, dropped} = decodePresets(messy);
    assert.deepEqual(items.map(p => [p.id, p.hotkeySlot]), [['a', 1], ['b', null]]);
    assert.equal(dropped, 2);
});

test('recent round trip, invalid entries dropped, capped', () => {
    const recent = [{input: '5m', lastUsedAt: 2}, {input: '@7 wake up', lastUsedAt: 1}];
    assert.deepEqual(decodeRecent(parseList(encodeRecent(recent))), {items: recent, dropped: 0});

    const many = Array.from({length: MAX_RECENT + 3}, (_, i) => ({input: `${i + 1}m`, lastUsedAt: i}));
    const {items, dropped} = decodeRecent([...many, {input: 'nonsense', lastUsedAt: 1}]);
    assert.equal(items.length, MAX_RECENT);
    assert.equal(dropped, 4);
});

test('migrate runs each step from the stored version up to DATA_VERSION', () => {
    const data = {timers: [], presets: [], recent: []};
    assert.equal(migrate(data, DATA_VERSION), data);

    const steps = [];
    const migrations = {};
    for (let v = 0; v < DATA_VERSION; v++) {
        migrations[v] = d => {
            steps.push(v);
            return {...d, recent: [...d.recent, v]};
        };
    }
    const result = migrate(data, 0, migrations);
    assert.deepEqual(steps, [...Array(DATA_VERSION).keys()]);
    assert.equal(result.recent.length, DATA_VERSION);
});

test('data from a newer version passes through unchanged', () => {
    const data = {timers: [], presets: [], recent: []};
    assert.equal(migrate(data, DATA_VERSION + 1), data);
});
