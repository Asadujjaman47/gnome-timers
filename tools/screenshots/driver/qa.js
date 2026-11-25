/*
 * Development-only QA scenario (TIMERS_DRIVER_SCENARIO=qa), run inside a
 * headless GNOME Shell by tools/screenshots/run.sh:
 *
 * 1. Storage: types inputs into the real menu entry, checks what was saved,
 *    restarts the extension and checks that everything came back.
 * 2. Memory: hundreds of rounds of normal use, then checks with weak
 *    references that no row, notification or timer object outlived its use,
 *    and reports the process memory.
 * 3. Power: CPU time and wakeups per second in different states.
 *
 * It reaches into Timers' private fields on purpose; it is never shipped.
 */
import GLib from 'gi://GLib';
import System from 'system';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const TARGET = 'timers@asadujjaman47.github.io';
const decoder = new TextDecoder();

const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));

function readProc(path) {
    const [, bytes] = GLib.file_get_contents(path);
    return decoder.decode(bytes);
}

/** Process CPU time (all threads) in ms and main-thread context switches. */
function sample() {
    // /proc/self/stat: the command name may contain spaces; fields follow ')'.
    const fields = readProc('/proc/self/stat').split(') ')[1].split(' ');
    const ticks = Number(fields[11]) + Number(fields[12]); // utime + stime
    const status = readProc('/proc/self/status');
    const value = key => Number(new RegExp(`${key}:\\s+(\\d+)`).exec(status)[1]);
    return {
        cpuMs: ticks * 10, // USER_HZ is 100 on Linux
        switches: value('voluntary_ctxt_switches') + value('nonvoluntary_ctxt_switches'),
        rssKb: value('VmRSS'),
        time: GLib.get_monotonic_time() / 1000,
    };
}

async function collectGarbage() {
    for (let i = 0; i < 3; i++) {
        System.gc();
        await wait(300);
    }
}

export class Qa {
    constructor(log) {
        this._log = log;
        this._failures = 0;
    }

    _check(ok, what) {
        this._log(`${ok ? 'PASS' : 'FAIL'} ${what}`);
        if (!ok)
            this._failures++;
    }

    async _timers() {
        for (let i = 0; i < 50; i++) {
            const state = Main.extensionManager.lookup(TARGET)?.stateObj;
            if (state?._indicator)
                return state;
            await wait(200);
        }
        throw new Error('Timers extension did not start');
    }

    async _restart() {
        Main.extensionManager.disableExtension(TARGET);
        await wait(1000);
        Main.extensionManager.enableExtension(TARGET);
        await wait(1000);
        return this._timers();
    }

    async run() {
        await wait(1500);
        const parts = (GLib.getenv('TIMERS_QA_PARTS') ?? 'storage,memory,power').split(',');
        if (parts.includes('storage'))
            await this._storage();
        if (parts.includes('memory'))
            await this._memory();
        if (parts.includes('power'))
            await this._power();
        this._log(`QA RESULT: ${this._failures === 0 ? 'all checks passed' : `${this._failures} check(s) FAILED`}`);
    }

    /** Typing into the menu entry, then saving and restoring. */
    async _storage() {
        this._log('== storage');
        let timers = await this._timers();
        const settings = timers._storage.settings;
        const stored = key => JSON.parse(settings.get_string(key));

        const typed = [
            ['5 min tea', 'countdown', 300000, 'Tea'],
            ['1.5h', 'countdown', 5400000, null],
            ['৫m', 'countdown', 300000, null],
            ['in 90 sec pasta', 'countdown', 90000, 'Pasta'],
            ['7 am gym', 'alarm', null, 'Gym'],
            ['@1010pm call mom', 'alarm', null, 'Call mom'],
            ['12m 🍕 party', 'countdown', 720000, '🍕 party'],
            ['pizza', null], ['', null], ['0', null], ['@25:00', null], ['100h', null],
        ];
        const entry = timers._indicator._input._entry;
        for (const [text] of typed) {
            timers._indicator.menu.open();
            await wait(150);
            entry.set_text(text);
            entry.clutter_text.emit('activate');
            await wait(150);
            timers._indicator.menu.close();
        }
        await wait(300);

        const valid = typed.filter(([, kind]) => kind);
        const saved = stored('timers');
        this._check(saved.length === valid.length,
            `typed ${typed.length} inputs (${valid.length} valid) → ${saved.length} timers saved`);
        for (const [text, kind, durationMs, label] of valid) {
            const timer = saved.find(t => t.input === text);
            this._check(timer && timer.kind === kind && timer.label === label &&
                (durationMs === null || timer.durationMs === durationMs),
            `"${text}" saved as ${timer ? `${timer.kind} ${timer.durationMs} ms "${timer.label}"` : 'nothing'}`);
        }
        this._check(entry.get_text() === '@25:00' || entry.get_text() === '100h',
            'an invalid input stays in the entry (so it can be corrected)');
        const recent = stored('recent').map(r => r.input);
        this._check(valid.every(([text]) => recent.includes(text)) && recent.length === valid.length,
            `Recent has the ${valid.length} valid inputs and nothing else (${recent.length})`);

        // Pause one, save a preset, then restart and compare everything.
        const manager = timers._manager;
        const paused = manager.timers.find(t => t.input === '1.5h');
        manager.pause(paused.id);
        timers._library.saveAsPreset('5 min tea');
        await wait(300);
        const before = JSON.stringify(manager.timers.map(t => t.toJSON()));
        const presetsBefore = settings.get_string('presets');

        timers = await this._restart();
        const after = JSON.stringify(timers._manager.timers.map(t => t.toJSON()));
        this._check(after === before, `after restart all ${saved.length} timers are identical (ids, end times, paused time)`);
        this._check(settings.get_string('presets') === presetsBefore &&
            timers._library.presets.length === 1, 'the preset survived the restart');
        this._check(timers._library.recent.length === Math.min(5, valid.length - 1),
            'Recent survived the restart (the saved preset is now hidden from it)');

        for (const timer of timers._manager.timers)
            timers._manager.stop(timer.id);
        timers._library.clearRecent();
        timers._storage.savePresets([]);
        await wait(300);
        this._check(stored('timers').length === 0 && stored('recent').length === 0 &&
            stored('presets').length === 0, 'stopping all, clearing Recent and presets leaves empty storage');
    }

    /** Hundreds of rounds of normal use, then a leak check with weak references. */
    async _memory() {
        this._log('== memory');
        const timers = await this._timers();
        const {_indicator: indicator, _manager: manager, _library: library, _storage: storage} = timers;
        const entry = indicator._input._entry;
        const refs = [];
        const track = object => refs.push(new WeakRef(object));
        // Only objects that must be gone after cleanup: rows, timers and
        // notifications (not the menu's permanent items).
        const trackMenu = () => {
            const sections = [indicator._timers, indicator._presets, indicator._recent].map(s => s.section);
            for (const section of sections)
                section._getMenuItems().forEach(track);
            manager.timers.forEach(track);
        };
        const inputs = ['5 min', '12m pizza', '@7 am', '1.5h', '90 sec', 'in 3 min tea', '45m laundry', '@noon'];

        const round = async i => {
            indicator.menu.open();
            for (const text of inputs) {
                entry.set_text(text);
                entry.clutter_text.emit('activate');
            }
            indicator.menu.open();
            await wait(20);
            for (const timer of manager.timers.slice(0, 3)) {
                manager.pause(timer.id);
                manager.resume(timer.id);
            }
            library.saveAsPreset(inputs[i % inputs.length]);
            await wait(20);
            trackMenu();
            indicator.menu.close();
            for (const timer of manager.timers)
                manager.stop(timer.id);
            if (i % 10 === 9) {
                library.clearRecent();
                storage.savePresets([]);
            }
            // Every 25 rounds, let real timers finish: notification + sound.
            if (i % 25 === 24) {
                for (let k = 0; k < 5; k++)
                    library.startInput('1s');
                await wait(1600);
                for (const source of Main.messageTray.getSources()) {
                    source.notifications.forEach(track);
                    if (source.title === 'Timers')
                        source.destroy();
                }
            }
        };

        // Warm up until caches and the JS heap reach their working size.
        const WARMUP = Number(GLib.getenv('TIMERS_QA_WARMUP') ?? 100);
        const ROUNDS = Number(GLib.getenv('TIMERS_QA_ROUNDS') ?? 600);
        const started = GLib.get_monotonic_time();
        for (let i = 0; i < WARMUP; i++)
            await round(i);
        await collectGarbage();
        const memory = [];
        for (let i = 0; i < ROUNDS; i++) {
            if (i % 75 === 0) {
                await collectGarbage();
                memory.push(sample().rssKb);
                const seconds = Math.round((GLib.get_monotonic_time() - started) / 1e6);
                this._log(`  round ${i}/${ROUNDS}, ${seconds} s, ${Math.round(memory.at(-1) / 1024)} MB`);
            }
            await round(i);
        }
        library.clearRecent();
        storage.savePresets([]);
        await wait(500);
        await collectGarbage();
        await collectGarbage();
        memory.push(sample().rssKb);

        const alive = refs.map(ref => ref.deref()).filter(object => object !== undefined);
        const byType = {};
        for (const object of alive) {
            const type = object.constructor?.$gtype?.name ?? object.constructor?.name ?? typeof object;
            byType[type] = (byType[type] ?? 0) + 1;
        }
        this._log(`tracked ${refs.length} rows, timers and notifications over ${WARMUP + ROUNDS} rounds`);
        this._check(alive.length === 0, `still alive after cleanup + GC: ${alive.length} ${JSON.stringify(byType)}`);
        const megabytes = memory.map(kb => `${Math.round(kb / 1024)} MB`).join(' → ');
        this._log(`GNOME Shell memory (RSS) after warm-up, every 75 rounds: ${megabytes}`);
        // The JS heap grows in steps until it reaches its working size; a leak
        // keeps growing after that. So compare from a quarter of the way in.
        const from = memory[Math.floor(memory.length / 4)];
        const growthMb = (memory.at(-1) - from) / 1024;
        this._check(growthMb < 10,
            `memory growth over the last three quarters of the rounds: ${growthMb.toFixed(1)} MB`);
    }

    /** CPU time and wakeups per second in different states. */
    async _power() {
        this._log('== power (each state measured for 45 s)');
        const measure = async (name, seconds = 45) => {
            await wait(3000); // settle
            const a = sample();
            await wait(seconds * 1000);
            const b = sample();
            const duration = (b.time - a.time) / 1000;
            const cpu = (100 * (b.cpuMs - a.cpuMs)) / (b.time - a.time);
            const wakeups = (b.switches - a.switches) / duration;
            this._log(`${name.padEnd(44)} CPU ${cpu.toFixed(2).padStart(5)} %   wakeups ${wakeups.toFixed(1).padStart(5)} /s`);
            return {cpu, wakeups};
        };

        Main.extensionManager.disableExtension(TARGET);
        await wait(1000);
        const off = await measure('extension disabled (baseline)');
        Main.extensionManager.enableExtension(TARGET);
        await wait(1000);
        const timers = await this._timers();
        const {_indicator: indicator, _manager: manager, _library: library} = timers;

        const idle = await measure('enabled, no timers');
        library.startInput('2h');
        const one = await measure('1 countdown running');
        for (let i = 0; i < 4; i++) {
            await wait(190);
            library.startInput(`${3 + i}h`);
        }
        const five = await measure('5 countdowns running (started 0.2 s apart)');
        for (const timer of manager.timers)
            manager.stop(timer.id);
        library.startInput('@midnight');
        await measure('1 alarm running');
        for (const timer of manager.timers)
            manager.stop(timer.id);
        for (let i = 0; i < 5; i++) {
            await wait(190);
            library.startInput(`${2 + i}h`);
        }
        indicator.menu.open();
        await measure('5 countdowns, menu open', 30);
        indicator.menu.close();
        for (const timer of manager.timers)
            manager.stop(timer.id);

        this._check(idle.wakeups - off.wakeups < 0.5, 'no extra wakeups while idle');
        this._check(five.wakeups - one.wakeups < 1, 'more timers do not add wakeups');
        this._log(`extra wakeups: idle ${(idle.wakeups - off.wakeups).toFixed(1)}/s, ` +
            `1 timer ${(one.wakeups - off.wakeups).toFixed(1)}/s, 5 timers ${(five.wakeups - off.wakeups).toFixed(1)}/s`);
    }

    get failures() {
        return this._failures;
    }
}
