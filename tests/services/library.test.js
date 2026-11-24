import {test, assert} from '../harness.js';
import {fakeClock, localTime} from '../helpers.js';
import {createPreset} from '../../src/core/presets.js';
import {TimerManager} from '../../src/core/timerManager.js';
import {Library} from '../../src/services/library.js';
import {Keys} from '../../src/services/storage.js';

/** In-memory stand-in for Storage, with change notifications like GSettings. */
class FakeStorage {
    presets = [];
    recentList = [];
    recentSize = 5;
    #handlers = new Map();
    #nextId = 1;

    loadPresets() {
        return this.presets;
    }

    savePresets(presets) {
        this.presets = presets;
        this.#notify(Keys.PRESETS);
    }

    loadRecent() {
        return this.recentList;
    }

    saveRecent(recent) {
        this.recentList = recent;
        this.#notify(Keys.RECENT);
    }

    setRecentSize(size) {
        this.recentSize = size;
        this.#notify(Keys.RECENT_SIZE);
    }

    connectChanged(key, callback) {
        const id = this.#nextId++;
        this.#handlers.set(id, {key, callback});
        return id;
    }

    disconnect(id) {
        this.#handlers.delete(id);
    }

    get handlerCount() {
        return this.#handlers.size;
    }

    #notify(key) {
        for (const h of [...this.#handlers.values()].filter(x => x.key === key))
            h.callback();
    }
}

function setup() {
    const clock = fakeClock(localTime(2026, 11, 24, 13, 0));
    const manager = new TimerManager({clock});
    const storage = new FakeStorage();
    const library = new Library({manager, storage});
    let changes = 0;
    library.connect('changed', () => changes++);
    return {clock, manager, storage, library, changes: () => changes};
}

const inputs = list => list.map(e => e.input);

test('a typed timer starts and goes to the top of Recent', () => {
    const {clock, manager, library} = setup();
    assert.ok(library.startInput('5m').ok);
    clock.advance(1000);
    library.startInput('12m pizza');
    assert.equal(manager.size, 2);
    assert.deepEqual(inputs(library.recent), ['12m pizza', '5m']);
});

test('invalid input starts nothing and is not recorded', () => {
    const {manager, library} = setup();
    assert.equal(library.startInput('pizza').ok, false);
    assert.equal(manager.size, 0);
    assert.deepEqual(library.recent, []);
});

test('starting from Recent moves the entry to the top again', () => {
    const {clock, library} = setup();
    library.startInput('5m');
    clock.advance(1000);
    library.startInput('10m');
    clock.advance(1000);
    library.startInput(library.recent[1].input);
    assert.deepEqual(inputs(library.recent), ['5m', '10m']);
});

test('a preset starts with its own sound and is not added to Recent', () => {
    const {manager, storage, library} = setup();
    storage.savePresets([createPreset({id: 'tea', input: '4m tea', sound: 'bell'})]);
    library.startPreset(library.presets[0]);
    assert.equal(manager.size, 1);
    assert.equal(manager.timers[0].sound, 'bell');
    assert.equal(manager.timers[0].label, 'Tea');
    assert.deepEqual(storage.recentList, []);
});

test('preset shortcuts start the preset in that slot; empty slots do nothing', () => {
    const {manager, storage, library} = setup();
    storage.savePresets([createPreset({id: 'tea', input: '4m tea', hotkeySlot: 2})]);
    library.startPresetInSlot(1);
    assert.equal(manager.size, 0);
    library.startPresetInSlot(2);
    assert.equal(manager.size, 1);
});

test('save as preset; Recent then hides it; saving twice does nothing', () => {
    const {library, storage} = setup();
    library.startInput('5m');
    library.startInput('8m eggs');
    library.saveAsPreset('8m eggs');
    library.saveAsPreset('8M  Eggs');
    assert.deepEqual(storage.presets.map(p => p.input), ['8m eggs']);
    assert.equal(storage.presets[0].sound, null);
    assert.equal(storage.presets[0].hotkeySlot, null);
    assert.deepEqual(inputs(library.recent), ['5m']);
});

test('the Recent size setting limits what is shown, not what is kept', () => {
    const {clock, storage, library} = setup();
    for (let i = 1; i <= 7; i++) {
        clock.advance(1000);
        library.startInput(`${i}m`);
    }
    assert.equal(library.recent.length, 5);
    storage.setRecentSize(2);
    assert.deepEqual(inputs(library.recent), ['7m', '6m']);
    storage.setRecentSize(0);
    assert.deepEqual(library.recent, []);
    assert.equal(storage.recentList.length, 7);
});

test('clear Recent', () => {
    const {library} = setup();
    library.startInput('5m');
    library.clearRecent();
    assert.deepEqual(library.recent, []);
});

test('presets changed elsewhere (the preferences) are picked up', () => {
    const {storage, library, changes} = setup();
    const before = changes();
    storage.savePresets([createPreset({id: 'a', input: '1m'})]);
    assert.deepEqual(library.presets.map(p => p.id), ['a']);
    assert.ok(changes() > before);
});

test('destroy disconnects from storage', () => {
    const {storage, library} = setup();
    assert.ok(storage.handlerCount > 0);
    library.destroy();
    assert.equal(storage.handlerCount, 0);
});
