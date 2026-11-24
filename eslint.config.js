import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';

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
        plugins: {'@stylistic': stylistic},
        rules: {
            // Code style, following GNOME Shell's own lint rules.
            '@stylistic/indent': ['error', 4, {
                SwitchCase: 0,
                // GObject.registerClass(class Foo extends Bar { … }) keeps the
                // class body at the left margin, as in GNOME Shell.
                ignoredNodes: [
                    'CallExpression[callee.object.name=GObject][callee.property.name=registerClass] > ClassExpression',
                ],
            }],
            '@stylistic/quotes': ['error', 'single', {avoidEscape: true}],
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/comma-dangle': ['error', 'always-multiline'],
            '@stylistic/arrow-parens': ['error', 'as-needed'],
            '@stylistic/brace-style': ['error', '1tbs'],
            '@stylistic/keyword-spacing': 'error',
            '@stylistic/space-infix-ops': 'error',
            '@stylistic/comma-spacing': 'error',
            '@stylistic/key-spacing': 'error',
            '@stylistic/space-before-blocks': 'error',
            '@stylistic/space-before-function-paren': ['error', {
                named: 'never', anonymous: 'always', asyncArrow: 'always',
            }],
            '@stylistic/no-trailing-spaces': 'error',
            '@stylistic/no-multiple-empty-lines': ['error', {max: 1}],
            '@stylistic/eol-last': 'error',
            '@stylistic/quote-props': ['error', 'consistent-as-needed'],
            '@stylistic/max-len': ['error', {code: 110, ignoreStrings: true, ignoreTemplateLiterals: true}],

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
    {
        // Test tooling runs its steps one after another on purpose.
        files: ['tools/**/*.js', 'tests/**/*.js'],
        rules: {'no-await-in-loop': 'off'},
    },
];
