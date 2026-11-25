/*
 * Property tests: many random and hostile inputs, checking rules that must
 * hold for every input, not just the examples in parser.test.js.
 */
import {test, assert} from '../harness.js';
import {localTime} from '../helpers.js';
import {Formatter} from '../../src/core/format.js';
import {MAX_DURATION_MS, ParseError, parseInput} from '../../src/core/parser.js';
import {addRecent, normalizeInput} from '../../src/core/recent.js';
import {decodeRecent, decodeTimers, encodeRecent, encodeTimers, parseList} from '../../src/core/serialization.js';
import {Timer} from '../../src/core/timer.js';

const NOW = localTime(2026, 11, 25, 13, 0);
const ERRORS = new Set(Object.values(ParseError));
const formatter = new Formatter();

/** Small deterministic PRNG (mulberry32), so failures can be reproduced. */
function random(seed) {
    let a = seed;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const PIECES = [
    '0', '1', '5', '9', '12', '30', '59', '60', '99', '100', '1000', '53000', '99999999999999999999',
    'h', 'm', 's', 'H', 'M', 'S', ':', '.', ',', '@', 'at', 'AT', 'am', 'pm', 'a', 'p', 'in',
    'min', 'mins', 'minutes', 'hr', 'hour', 'hours', 'sec', 'seconds', 'noon', '1.5', '0,5',
    ' ', ' ', ' ', '  ', '\t', '\n',
    'pizza', 'tea', 'Meeting', 'call mom', 'x', '-', '+', ',', '/', '½', '१', '৫', '５', '🍕', 'é', 'Ω',
    '1h', '30m', '45s', '1h30', '2m30', '@14:30', '@1010pm', 'at 7 am', '12:00', '1:2:3:4',
];

function randomInput(next) {
    const parts = [];
    const count = 1 + Math.floor(next() * 6);
    for (let i = 0; i < count; i++)
        parts.push(PIECES[Math.floor(next() * PIECES.length)]);
    return parts.join(next() < 0.7 ? '' : ' ');
}

const HOSTILE = [
    '', ' ', '\t\n', '0', '00', '0:00:00', '0h 0m 0s', '-5m', '+5m', '5.5m', '1e5', '0x10', 'NaN', 'Infinity',
    '99999999999999999999', '9'.repeat(400), `${'1h'.repeat(50)}`, `5m ${'x'.repeat(5000)}`,
    '৫m', '５m', '१२m', '½h', '5 m', 'm5', 'h', 'hms', '5hms', '5h5h', '1h 2h', '@', '@@14:30', '@ ', 'at',
    'at at 7', '@24:00', '@23:60', '@-1', '@7pmpm', '@12:30 p m', '@13pm', '@0am', '@00:00', '@0:00am',
    '12m 🍕', '12m 🍕🍕 party', '5m ‮reversed', '5m <b>bold</b>', "5m '; DROP TABLE", '5m %s %d', '5m \\n',
    '5m\u0000null', '​5m', '5m​', 'At 7 Am Gym', '@7 ', ' @7', '1:30:00:00', '99:59:59', '99:00:00',
    '100h', '5999m', '360000s', '355m 59s', '5 min', '1 hour 30 minutes', '1.5h', '1,5h', 'in 5 min',
    '5pm', '5:30 pm', '7 am', '12 am', '@noon', '@midnight', '৫m', '৫:৩০ pm', '５m', '＠14：30',
    'in in 5m', '5 hours 30 min 10 s pizza', '0.5 sec',
];

/** Every rule an accepted input must satisfy. */
function checkAccepted(input, spec) {
    assert.ok(spec.kind === 'countdown' || spec.kind === 'alarm', `${input}: kind`);
    assert.ok(typeof spec.timeText === 'string' && spec.timeText.length > 0, `${input}: timeText`);
    assert.ok(spec.label === null || (typeof spec.label === 'string' &&
        spec.label === spec.label.trim() && spec.label.length > 0), `${input}: label ${JSON.stringify(spec.label)}`);
    if (spec.kind === 'countdown') {
        assert.ok(Number.isInteger(spec.durationMs) && spec.durationMs > 0 &&
            spec.durationMs <= MAX_DURATION_MS, `${input}: duration ${spec.durationMs}`);
    } else {
        assert.ok(Number.isInteger(spec.hours) && spec.hours >= 0 && spec.hours <= 23, `${input}: hours`);
        assert.ok(Number.isInteger(spec.minutes) && spec.minutes >= 0 && spec.minutes <= 59, `${input}: minutes`);
    }

    // What is saved (Recent, presets, the timer's input) must start the same timer again.
    for (const saved of [normalizeInput(input), [spec.timeText, spec.label].filter(Boolean).join(' ')]) {
        const again = parseInput(saved);
        assert.ok(again.ok, `${input}: re-parsing ${JSON.stringify(saved)} failed`);
        assert.deepEqual(again.spec, spec, `${input}: re-parsing ${JSON.stringify(saved)}`);
    }

    // Saving and loading a timer gives the same timer.
    const timer = Timer.create({id: 't', spec, input: normalizeInput(input), now: NOW});
    const [restored] = decodeTimers(parseList(encodeTimers([timer]))).items;
    assert.ok(restored, `${input}: timer did not survive saving`);
    assert.deepEqual(restored.toJSON(), timer.toJSON(), `${input}: timer changed by saving`);

    const recent = decodeRecent(parseList(encodeRecent(addRecent([], input, NOW)))).items;
    assert.equal(recent.length, 1, `${input}: not kept in Recent`);

    for (const text of [
        formatter.preview(spec, NOW, false), formatter.describe(spec, true),
        formatter.timerName(timer, false), formatter.rowName(timer, NOW, true),
        formatter.remaining(timer.remainingAt(NOW)),
    ])
        assert.ok(typeof text === 'string' && text.length > 0, `${input}: empty display text`);
}

function check(input) {
    let result;
    try {
        result = parseInput(input);
    } catch (e) {
        throw new Error(`parseInput(${JSON.stringify(input)}) threw: ${e.message}`, {cause: e});
    }
    if (result.ok)
        checkAccepted(input, result.spec);
    else
        assert.ok(ERRORS.has(result.error), `${JSON.stringify(input)}: unknown error ${result.error}`);
    return result.ok;
}

test('hostile inputs never throw, and every accepted one is consistent', () => {
    for (const input of HOSTILE)
        check(input);
});

test('hostile inputs that must be rejected', () => {
    for (const input of ['', '0', '-5m', '+5m', '1e5', 'NaN', '9'.repeat(400), '5ms', '5..5m', '.5m',
        'm5', '5h5h', '1h 2h', '5 min 3 min', '@', '@@14:30', 'at', 'in', 'in pizza', '@24:00', '@23:60',
        '@13pm', '13pm', '100h', '5999m', '0.0001s', 'noon'])
        assert.ok(!parseInput(input).ok, `${JSON.stringify(input)} should be rejected`);
});

test('labels keep emoji, markup-like and quote characters as plain text', () => {
    assert.equal(parseInput('12m 🍕 party').spec.label, '🍕 party');
    assert.equal(parseInput('5m ৫ জন').spec.label, '৫ জন');
    assert.equal(parseInput('5m <b>bold</b>').spec.label, '<b>bold</b>');
    assert.equal(parseInput("5m '; DROP TABLE").spec.label, "'; DROP TABLE");
    assert.equal(parseInput('5m %s %d').spec.label, '%s %d');
});

test('20 000 random inputs: no throws, all accepted inputs consistent', () => {
    const next = random(20261125);
    let accepted = 0;
    for (let i = 0; i < 20000; i++) {
        if (check(randomInput(next)))
            accepted++;
    }
    // Make sure the generator really exercises both outcomes.
    assert.ok(accepted > 1000 && accepted < 19000, `accepted ${accepted}`);
});
