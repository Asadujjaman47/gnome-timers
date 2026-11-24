import {test, assert} from '../harness.js';
import {alarmBehavior} from '../../src/core/alarm.js';

const base = {late: false, dndActive: false, silenceInDnd: false, loopSound: false};

test('default: play once and clear', () => {
    assert.deepEqual(alarmBehavior(base), {playSound: true, ringUntilDismissed: false});
});

test('repeat until dismissed keeps ringing', () => {
    assert.deepEqual(alarmBehavior({...base, loopSound: true}),
        {playSound: true, ringUntilDismissed: true});
});

test('Do Not Disturb still plays the sound unless silenced', () => {
    assert.deepEqual(alarmBehavior({...base, dndActive: true}),
        {playSound: true, ringUntilDismissed: false});
    assert.deepEqual(alarmBehavior({...base, dndActive: true, silenceInDnd: true, loopSound: true}),
        {playSound: false, ringUntilDismissed: false});
});

test('the silence setting only matters while DND is on', () => {
    assert.deepEqual(alarmBehavior({...base, silenceInDnd: true}),
        {playSound: true, ringUntilDismissed: false});
});

test('late timers are always silent and clear themselves', () => {
    assert.deepEqual(alarmBehavior({...base, late: true, loopSound: true}),
        {playSound: false, ringUntilDismissed: false});
});
