import {test, assert} from '../harness.js';
import {SignalEmitter} from '../../src/core/signals.js';

test('emit calls handlers connected to that signal with the arguments', () => {
    const emitter = new SignalEmitter();
    const calls = [];
    emitter.connect('changed', (a, b) => calls.push(['changed', a, b]));
    emitter.connect('other', () => calls.push(['other']));

    emitter.emit('changed', 1, 'x');

    assert.deepEqual(calls, [['changed', 1, 'x']]);
});

test('handlers run in connection order', () => {
    const emitter = new SignalEmitter();
    const order = [];
    emitter.connect('s', () => order.push(1));
    emitter.connect('s', () => order.push(2));
    emitter.connect('s', () => order.push(3));

    emitter.emit('s');

    assert.deepEqual(order, [1, 2, 3]);
});

test('disconnect stops a handler; ids are unique', () => {
    const emitter = new SignalEmitter();
    let count = 0;
    const id1 = emitter.connect('s', () => count++);
    const id2 = emitter.connect('s', () => count++);
    assert.ok(id1 !== id2);

    emitter.disconnect(id1);
    emitter.emit('s');

    assert.equal(count, 1);
});

test('disconnectAll removes every handler', () => {
    const emitter = new SignalEmitter();
    let count = 0;
    emitter.connect('a', () => count++);
    emitter.connect('b', () => count++);

    emitter.disconnectAll();
    emitter.emit('a');
    emitter.emit('b');

    assert.equal(count, 0);
});

test('a throwing handler is reported and does not stop the others', () => {
    const errors = [];
    const emitter = new SignalEmitter({onError: (name, e) => errors.push([name, e.message])});
    let reached = false;
    emitter.connect('s', () => {
        throw new Error('boom');
    });
    emitter.connect('s', () => {
        reached = true;
    });

    emitter.emit('s');

    assert.ok(reached);
    assert.deepEqual(errors, [['s', 'boom']]);
});

test('a handler may disconnect itself while the signal is being emitted', () => {
    const emitter = new SignalEmitter();
    let count = 0;
    const id = emitter.connect('s', () => {
        count++;
        emitter.disconnect(id);
    });

    emitter.emit('s');
    emitter.emit('s');

    assert.equal(count, 1);
});

test('connect rejects a non-function callback', () => {
    const emitter = new SignalEmitter();
    assert.throws(() => emitter.connect('s', null), TypeError);
});
