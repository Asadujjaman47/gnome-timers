import {test, assert} from '../harness.js';
import {HOUR, MINUTE, SECOND, localTime} from '../helpers.js';
import {MAX_DURATION_MS, ParseError, nextAlarmTime, parseInput} from '../../src/core/parser.js';

const countdown = (durationMs, label = null) => ({kind: 'countdown', durationMs, label});
const alarm = (hours, minutes, label = null) => ({kind: 'alarm', hours, minutes, label});

/** Compares everything except timeText, which has its own test. */
function check(input, expected) {
    const result = parseInput(input);
    assert.ok(result.ok, `"${input}" should parse, got error "${result.error}"`);
    const {timeText: _timeText, ...spec} = result.spec;
    assert.deepEqual(spec, expected, `"${input}"`);
}

function checkError(input, error) {
    const result = parseInput(input);
    assert.ok(!result.ok, `"${input}" should fail, got ${JSON.stringify(result.spec)}`);
    assert.equal(result.error, error, `"${input}"`);
}

test('digits only: last two digits are seconds, two before are minutes, rest hours', () => {
    check('5', countdown(5 * SECOND));
    check('112', countdown(MINUTE + 12 * SECOND));
    check('500', countdown(5 * MINUTE));
    check('53000', countdown(5 * HOUR + 30 * MINUTE));
    check('13000', countdown(HOUR + 30 * MINUTE));
    check('000130', countdown(MINUTE + 30 * SECOND));
});

test('digits only are lenient like a microwave: 199 is 1 min 99 s', () => {
    check('90', countdown(90 * SECOND));
    check('199', countdown(MINUTE + 99 * SECOND));
});

test('colon format: m:s and h:m:s', () => {
    check('1:12', countdown(MINUTE + 12 * SECOND));
    check('0:05', countdown(5 * SECOND));
    check('5:30:00', countdown(5 * HOUR + 30 * MINUTE));
    check('90:00', countdown(90 * MINUTE));
});

test('colon format is strict: lower parts must be below 60', () => {
    checkError('1:75', ParseError.INVALID);
    checkError('1:60:00', ParseError.INVALID);
    checkError('1:2:3:4', ParseError.INVALID);
});

test('unit format in any order and any case', () => {
    check('5s', countdown(5 * SECOND));
    check('1m 12s', countdown(MINUTE + 12 * SECOND));
    check('5h 30m', countdown(5 * HOUR + 30 * MINUTE));
    check('30m 5h', countdown(5 * HOUR + 30 * MINUTE));
    check('1h30m', countdown(HOUR + 30 * MINUTE));
    check('1h30m15s', countdown(HOUR + 30 * MINUTE + 15 * SECOND));
    check('90s', countdown(90 * SECOND));
    check('5M', countdown(5 * MINUTE));
});

test('trailing digits in a unit token take the next smaller unit', () => {
    check('1h30', countdown(HOUR + 30 * MINUTE));
    check('2m30', countdown(2 * MINUTE + 30 * SECOND));
    checkError('30s5', ParseError.INVALID);
});

test('a unit may only be used once', () => {
    checkError('5m 3m', ParseError.INVALID);
    checkError('1h 2h', ParseError.INVALID);
    checkError('1h30 15m', ParseError.INVALID);
});

test('extra spaces are ignored', () => {
    check('   5m   ', countdown(5 * MINUTE));
    check('5h    30m   tea  time', countdown(5 * HOUR + 30 * MINUTE, 'Tea time'));
});

test('words after the time become the label, first letter capitalised', () => {
    check('12m pizza', countdown(12 * MINUTE, 'Pizza'));
    check('500 pizza', countdown(5 * MINUTE, 'Pizza'));
    check('1:30 boil eggs', countdown(MINUTE + 30 * SECOND, 'Boil eggs'));
    check('5h 30m Laundry', countdown(5 * HOUR + 30 * MINUTE, 'Laundry'));
    check('12m 2 pizzas', countdown(12 * MINUTE, '2 pizzas'));
    check('5m ąćę tea', countdown(5 * MINUTE, 'Ąćę tea'));
});

test('a label alone, or a label before the time, is not valid', () => {
    checkError('pizza', ParseError.INVALID);
    checkError('pizza 12m', ParseError.INVALID);
    checkError('at home', ParseError.INVALID);
});

test('empty, zero and too long', () => {
    checkError('', ParseError.EMPTY);
    checkError('   ', ParseError.EMPTY);
    checkError(null, ParseError.EMPTY);
    checkError('0', ParseError.ZERO);
    checkError('0:00', ParseError.ZERO);
    checkError('0m 0s', ParseError.ZERO);
    checkError('1000000', ParseError.TOO_LONG); // 100:00:00
    checkError('99h 1s', ParseError.TOO_LONG);
    checkError('99:00:01', ParseError.TOO_LONG);
});

test('exactly 99 hours is allowed', () => {
    check('99h', countdown(MAX_DURATION_MS));
    check('990000', countdown(MAX_DURATION_MS));
});

test('alarms: @ and "at" with 24-hour times', () => {
    check('@14:30', alarm(14, 30));
    check('@ 14:30', alarm(14, 30));
    check('at 14:30', alarm(14, 30));
    check('AT 9:05', alarm(9, 5));
    check('@7', alarm(7, 0));
    check('@0:00', alarm(0, 0));
    check('@23:59', alarm(23, 59));
});

test('alarms: am/pm, attached or separate', () => {
    check('@2:30pm', alarm(14, 30));
    check('at 2pm', alarm(14, 0));
    check('at 2 pm', alarm(14, 0));
    check('@2:30 PM', alarm(14, 30));
    check('@7a', alarm(7, 0));
    check('@12am', alarm(0, 0));
    check('@12pm', alarm(12, 0));
    check('@12:15 am', alarm(0, 15));
});

test('alarms: compact times without a colon, and a dot separator', () => {
    check('@1430', alarm(14, 30));
    check('@930', alarm(9, 30));
    check('@0730', alarm(7, 30));
    check('@1010pm', alarm(22, 10));
    check('@1010 pm', alarm(22, 10));
    check('at 1010pm call', alarm(22, 10, 'Call'));
    check('@1205am', alarm(0, 5));
    check('@10.10pm', alarm(22, 10));
    check('@14.30', alarm(14, 30));
});

test('alarms with labels', () => {
    check('@14:30 meeting', alarm(14, 30, 'Meeting'));
    check('at 2 pm call mom', alarm(14, 0, 'Call mom'));
    check('@9 stand-up', alarm(9, 0, 'Stand-up'));
});

test('invalid clock times', () => {
    checkError('@', ParseError.INVALID_TIME);
    checkError('@25:00', ParseError.INVALID_TIME);
    checkError('@24:00', ParseError.INVALID_TIME);
    checkError('@14:60', ParseError.INVALID_TIME);
    checkError('@13pm', ParseError.INVALID_TIME);
    checkError('@0am', ParseError.INVALID_TIME);
    checkError('@2460', ParseError.INVALID_TIME);
    checkError('@1360pm', ParseError.INVALID_TIME);
    checkError('@12345', ParseError.INVALID_TIME);
    checkError('@14:3', ParseError.INVALID_TIME);
    checkError('@lunch', ParseError.INVALID_TIME);
});

test('timeText is the part of the input that gave the time', () => {
    assert.equal(parseInput('  5h   30m  tea ').spec.timeText, '5h 30m');
    assert.equal(parseInput('500 pizza').spec.timeText, '500');
    assert.equal(parseInput('at 2 pm call mom').spec.timeText, 'at 2 pm');
    assert.equal(parseInput('@14:30 meeting').spec.timeText, '@14:30');
});

test('nextAlarmTime: later today', () => {
    const now = localTime(2026, 11, 24, 13, 0);
    const {at, tomorrow} = nextAlarmTime(14, 30, now);
    assert.equal(at, localTime(2026, 11, 24, 14, 30));
    assert.equal(tomorrow, false);
});

test('nextAlarmTime: a time already passed (or now) means tomorrow', () => {
    const now = localTime(2026, 11, 24, 15, 0);
    assert.deepEqual(nextAlarmTime(14, 30, now), {at: localTime(2026, 11, 25, 14, 30), tomorrow: true});
    assert.deepEqual(nextAlarmTime(15, 0, now), {at: localTime(2026, 11, 25, 15, 0), tomorrow: true});
});

test('nextAlarmTime: tomorrow across month and year ends', () => {
    const now = localTime(2026, 12, 31, 23, 30);
    const {at} = nextAlarmTime(7, 0, now);
    assert.equal(at, localTime(2027, 1, 1, 7, 0));
});

test('nextAlarmTime keeps the clock time across a DST change (any time zone)', () => {
    // The last Sunday of March is a DST change in much of Europe; in time
    // zones without DST this simply checks a normal day.
    const now = localTime(2026, 3, 28, 20, 0);
    const date = new Date(nextAlarmTime(7, 0, now).at);
    assert.deepEqual([date.getDate(), date.getHours(), date.getMinutes()], [29, 7, 0]);
});
