import js from '@eslint/js';

// Globals provided by the GJS runtime and GNOME Shell.
const gjsGlobals = {
    ARGV: 'readonly',
    console: 'readonly',
    imports: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    print: 'readonly',
    printerr: 'readonly',
    TextDecoder: 'readonly',
    TextEncoder: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
};
const shellGlobals = {
    global: 'readonly',
};

// Architecture rules (see ../docs/PLAN.md, section 3), enforced by the linter.
const restrict = (...patterns) => ({
    'no-restricted-imports': ['error', {patterns}],
});
const NO_GI = {
    regex: '^(gi|resource)://',
    caseSensitive: true,
    message: 'src/core must stay pure JavaScript: no gi:// or resource:// imports.',
};
const NO_SHELL = {
    regex: '^resource:///org/gnome/shell/',
    caseSensitive: true,
    message: 'Preferences run outside GNOME Shell and cannot import Shell modules.',
};
const NO_GTK = {
    regex: '^gi://(Gtk|Gdk|Adw)(\\?.*)?$',
    caseSensitive: true,
    message: 'GNOME Shell code must not import Gtk, Gdk or Adw.',
};

export default [
    {
        ignores: ['node_modules/', 'build/'],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: gjsGlobals,
        },
        rules: {
            'no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
            'prefer-const': 'error',
            'no-var': 'error',
            'eqeqeq': ['error', 'always'],
            'curly': ['error', 'multi-or-nest', 'consistent'],
            'no-await-in-loop': 'warn',
            'object-shorthand': 'error',
            'prefer-template': 'error',
        },
    },
    {
        files: ['extension.js', 'src/ui/**/*.js', 'src/services/**/*.js'],
        languageOptions: {globals: {...gjsGlobals, ...shellGlobals}},
        rules: restrict(NO_GTK),
    },
    {
        files: ['prefs.js', 'src/prefs/**/*.js'],
        rules: restrict(NO_SHELL),
    },
    {
        files: ['src/core/**/*.js'],
        rules: restrict(NO_GI),
    },
];
