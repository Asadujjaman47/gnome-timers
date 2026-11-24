import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {parseInput} from '../core/parser.js';
import {makeVertical} from '../services/compat.js';

const MAX_INPUT_LENGTH = 80;

/**
 * The time input at the top of the menu, with a live preview line showing
 * how the input is understood ("→ 12 min · Pizza") or what is wrong with it.
 *
 * Signal: `started` () - a timer was started from the input.
 */
export const InputItem = GObject.registerClass({
    Signals: {started: {}},
}, class TimersInputItem extends PopupMenu.PopupBaseMenuItem {
    /**
     * @param {object} deps
     * @param {import('../core/timerManager.js').TimerManager} deps.manager
     * @param {import('../core/format.js').Formatter} deps.formatter
     * @param {import('../services/clockFormat.js').ClockFormat} deps.clockFormat
     * @param {import('../services/library.js').Library} deps.library - starts
     *   timers and records them in Recent
     */
    _init({manager, formatter, clockFormat, library}) {
        super._init({reactive: false, can_focus: false, style_class: 'timers-input-item'});
        this._manager = manager;
        this._library = library;
        this._formatter = formatter;
        this._clockFormat = clockFormat;

        this._entry = new St.Entry({
            hint_text: _('5m, 1:30, 12m pizza, @14:30'),
            can_focus: true,
            x_expand: true,
            style_class: 'timers-entry',
            secondary_icon: new St.Icon({
                icon_name: 'media-playback-start-symbolic',
                style_class: 'timers-entry-start',
            }),
        });
        this._entry.clutter_text.set_max_length(MAX_INPUT_LENGTH);
        this._entry.clutter_text.connect('text-changed', () => this.refresh());
        this._entry.clutter_text.connect('activate', () => this._start());
        this._entry.connect('secondary-icon-clicked', () => this._start());

        this._preview = new St.Label({
            style_class: 'timers-preview',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const box = makeVertical(new St.BoxLayout({x_expand: true, style_class: 'timers-input-box'}));
        box.add_child(this._entry);
        box.add_child(this._preview);
        this.add_child(box);

        this.refresh();
    }

    focusEntry() {
        this._entry.grab_key_focus();
    }

    /** Re-renders the preview, e.g. when the menu opens (alarm "today/tomorrow"). */
    refresh() {
        const result = parseInput(this._entry.get_text());
        let text;
        if (result.ok) {
            text = `→ ${this._formatter.preview(result.spec, this._manager.now(), this._clockFormat.use12h)}`;
            this._preview.remove_style_class_name('timers-preview-error');
        } else {
            text = this._formatter.parseError(result.error);
            this._preview.add_style_class_name('timers-preview-error');
        }
        this._preview.text = text;
        this._preview.visible = text !== '';
    }

    _start() {
        const result = this._library.startInput(this._entry.get_text());
        if (!result.ok)
            return;
        this._entry.set_text('');
        this.emit('started');
    }
});
