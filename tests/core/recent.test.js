import {test, assert} from '../harness.js';
import {
    MAX_RECENT, addRecent, normalizeInput, recentFromJSON, removeRecent, visibleRecent,
} from '../../src/core/recent.js';

const inputs = list => list.map(e => e.input);

test('normalizeInput trims and collapses spaces', () => {
    assert.equal(normalizeInput('  5m   tea  '), '5m tea');
});

test('addRecent puts the newest first', () => {
    let list = [];
    list = addRecent(list, '5m', 1);
    list = addRecent(list, '10m', 2);
    assert.deepEqual(list, [{input: '10m', lastUsedAt: 2}, {input: '5m', lastUsedAt: 1}]);
});

test('addRecent moves an existing entry to the front (case and spaces ignored)', () => {
    let list = [];
    list = addRecent(list, '5m tea', 1);
    list = addRecent(list, '10m', 2);
    list = addRecent(list, '5M  Tea', 3);
    assert.deepEqual(inputs(list), ['5M Tea', '10m']);
    assert.equal(list[0].lastUsedAt, 3);
});

test('addRecent caps the list', () => {
    let list = [];
    for (let i = 1; i <= MAX_RECENT + 5; i++)
        list = addRecent(list, `${i}m`, i);
    assert.equal(list.length, MAX_RECENT);
    assert.equal(list[0].input, `${MAX_RECENT + 5}m`);
    assert.equal(addRecent(list, '99m', 0, 3).length, 3);
});

test('addRecent ignores empty input and does not modify its argument', () => {
    const list = [{input: '5m', lastUsedAt: 1}];
    assert.deepEqual(addRecent(list, '   ', 2), list);
    addRecent(list, '10m', 2);
    assert.deepEqual(list, [{input: '5m', lastUsedAt: 1}]);
});

test('removeRecent', () => {
    const list = [{input: '5m', lastUsedAt: 1}, {input: '10m', lastUsedAt: 2}];
    assert.deepEqual(inputs(removeRecent(list, ' 5M ')), ['10m']);
});

test('recentFromJSON validates entries', () => {
    assert.deepEqual(recentFromJSON({input: ' 5m  tea', lastUsedAt: 1}), {input: '5m tea', lastUsedAt: 1});
    assert.equal(recentFromJSON(null), null);
    assert.equal(recentFromJSON({input: 5, lastUsedAt: 1}), null);
    assert.equal(recentFromJSON({input: '5m'}), null);
    assert.equal(recentFromJSON({input: 'pizza', lastUsedAt: 1}), null);
});

test('visibleRecent hides entries that are presets and applies the size', () => {
    const recent = [
        {input: '5m', lastUsedAt: 5},
        {input: '4m tea', lastUsedAt: 4},
        {input: '10m', lastUsedAt: 3},
        {input: '@7', lastUsedAt: 2},
    ];
    const presets = [{input: '4M  Tea'}];
    assert.deepEqual(inputs(visibleRecent(recent, presets, 5)), ['5m', '10m', '@7']);
    assert.deepEqual(inputs(visibleRecent(recent, presets, 2)), ['5m', '10m']);
    assert.deepEqual(visibleRecent(recent, presets, 0), []);
});
