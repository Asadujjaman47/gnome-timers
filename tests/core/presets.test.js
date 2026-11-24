import {test, assert} from '../harness.js';
import {
    PresetError, addPreset, createPreset, movePreset, presetForSlot, presetFromJSON,
    removePreset, updatePreset, validatePreset,
} from '../../src/core/presets.js';
import {BUILTIN_SOUNDS, DEFAULT_SOUND, isValidSound} from '../../src/core/sound.js';

const tea = createPreset({id: 'tea', input: '4m tea'});
const pizza = createPreset({id: 'pizza', input: '12m pizza', sound: 'bell', hotkeySlot: 1});
const ids = list => list.map(p => p.id);

test('createPreset fills defaults and normalises input', () => {
    assert.deepEqual(createPreset({id: 'a', input: ' 5m   eggs '}),
        {id: 'a', input: '5m eggs', sound: null, hotkeySlot: null});
});

test('validatePreset reports every problem', () => {
    assert.deepEqual(validatePreset(tea), []);
    assert.deepEqual(validatePreset({id: '', input: 'pizza', sound: 'trumpet', hotkeySlot: 10}), [
        PresetError.INVALID_ID, PresetError.INVALID_INPUT, PresetError.INVALID_SOUND, PresetError.INVALID_SLOT,
    ]);
    assert.deepEqual(validatePreset({...tea, hotkeySlot: 0}), [PresetError.INVALID_SLOT]);
    assert.deepEqual(validatePreset({...tea, hotkeySlot: 1.5}), [PresetError.INVALID_SLOT]);
    assert.deepEqual(validatePreset({...tea, sound: 'file:///home/me/ding.ogg'}), []);
});

test('createPreset throws on invalid presets', () => {
    assert.throws(() => createPreset({id: 'x', input: 'pizza'}), /invalid-input/);
});

test('add, update, remove', () => {
    let list = addPreset([], tea);
    list = addPreset(list, pizza);
    assert.deepEqual(ids(list), ['tea', 'pizza']);

    list = updatePreset(list, 'tea', {input: '5m green tea', sound: 'message'});
    assert.deepEqual(list[0], {id: 'tea', input: '5m green tea', sound: 'message', hotkeySlot: null});

    assert.deepEqual(ids(removePreset(list, 'tea')), ['pizza']);
    assert.equal(updatePreset(list, 'nope', {input: '1m'}), list);
});

test('updatePreset validates the result', () => {
    assert.throws(() => updatePreset([tea], 'tea', {input: 'nonsense'}));
});

test('a hotkey slot belongs to one preset only', () => {
    let list = addPreset([tea], pizza);
    assert.equal(presetForSlot(list, 1).id, 'pizza');

    list = updatePreset(list, 'tea', {hotkeySlot: 1});
    assert.equal(presetForSlot(list, 1).id, 'tea');
    assert.equal(list.find(p => p.id === 'pizza').hotkeySlot, null);

    list = addPreset(list, createPreset({id: 'eggs', input: '8m', hotkeySlot: 1}));
    assert.equal(presetForSlot(list, 1).id, 'eggs');
    assert.equal(list.filter(p => p.hotkeySlot === 1).length, 1);
    assert.equal(presetForSlot(list, 2), null);
});

test('movePreset reorders and clamps the index', () => {
    const c = createPreset({id: 'c', input: '1m'});
    const list = [tea, pizza, c];
    assert.deepEqual(ids(movePreset(list, 'c', 0)), ['c', 'tea', 'pizza']);
    assert.deepEqual(ids(movePreset(list, 'tea', 99)), ['pizza', 'c', 'tea']);
    assert.deepEqual(ids(movePreset(list, 'pizza', -3)), ['pizza', 'tea', 'c']);
    assert.equal(movePreset(list, 'nope', 0), list);
    assert.deepEqual(ids(list), ['tea', 'pizza', 'c']);
});

test('presetFromJSON returns null for invalid data', () => {
    assert.deepEqual(presetFromJSON(JSON.parse(JSON.stringify(pizza))), pizza);
    assert.equal(presetFromJSON(null), null);
    assert.equal(presetFromJSON({id: 'x', input: 'nonsense'}), null);
});

test('sound ids', () => {
    assert.deepEqual([...BUILTIN_SOUNDS], ['bell', 'complete', 'message']);
    assert.equal(DEFAULT_SOUND, 'complete');
    assert.ok(isValidSound('bell'));
    assert.ok(isValidSound('file:///usr/share/sounds/x.oga'));
    assert.ok(!isValidSound('file://relative'));
    assert.ok(!isValidSound('/usr/share/sounds/x.oga'));
    assert.ok(!isValidSound(null));
});
