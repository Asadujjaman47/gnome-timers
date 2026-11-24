/**
 * Test runner. Usage (from anywhere):
 *
 *   gjs -m tests/run.js            run every tests/**\/*.test.js
 *   gjs -m tests/run.js parser     only files whose path contains "parser"
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

import {registeredTests, setCurrentFile} from './harness.js';

const testsDir = Gio.File.new_for_uri(import.meta.url).get_parent();
const filter = System.programArgs[0] ?? '';

/** @returns {Gio.File[]} test files under `dir`, sorted by path */
function findTestFiles(dir) {
    const found = [];
    const enumerator = dir.enumerate_children('standard::name,standard::type',
        Gio.FileQueryInfoFlags.NONE, null);
    for (const info of enumerator) {
        const child = dir.get_child(info.get_name());
        if (info.get_file_type() === Gio.FileType.DIRECTORY)
            found.push(...findTestFiles(child));
        else if (info.get_name().endsWith('.test.js'))
            found.push(child);
    }
    return found.sort((a, b) => a.get_path().localeCompare(b.get_path()));
}

const files = findTestFiles(testsDir)
    .filter(f => testsDir.get_relative_path(f).includes(filter));

for (const file of files) {
    setCurrentFile(testsDir.get_relative_path(file));
    await import(file.get_uri());
}

let passed = 0;
let failed = 0;
let lastFile = null;
const start = GLib.get_monotonic_time();

for (const {file, name, fn} of registeredTests) {
    if (file !== lastFile) {
        print(`\n${file}`);
        lastFile = file;
    }
    try {
        await fn();
        passed++;
        print(`  ✓ ${name}`);
    } catch (e) {
        failed++;
        print(`  ✗ ${name}`);
        print(`      ${e?.name ?? 'Error'}: ${e?.message ?? e}`);
        if (e?.name !== 'AssertionError' && e?.stack)
            print(e.stack.replace(/^/gm, '        '));
    }
}

const ms = Math.round((GLib.get_monotonic_time() - start) / 1000);
print(`\n${passed} passed, ${failed} failed (${files.length} files, ${ms} ms)`);

if (files.length === 0) {
    printerr('No test files found.');
    System.exit(1);
}
if (failed > 0)
    System.exit(1);
