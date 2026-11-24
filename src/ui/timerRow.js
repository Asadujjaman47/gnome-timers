import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {setDimmed, setStyleClass} from './util.js';

/**
 * One timer in the menu: name, time left, pause/resume and stop buttons.
 * Alarms have no pause button; a finished timer's stop button dismisses it.
 */
export const TimerRow = GObject.registerClass(
class TimersTimerRow extends PopupMenu.PopupBaseMenuItem {
    /**
     * @param {import('../core/timer.js').Timer} timer
     * @param {object} deps
     * @param {import('../core/timerManager.js').TimerManager} deps.manager
     * @param {import('../core/format.js').Formatter} deps.formatter
     */
    _init(timer, {manager, formatter}) {
        super._init({activate: false, can_focus: false, style_class: 'timers-row'});
        this._timer = timer;
        this._formatter = formatter;

        this._name = new St.Label({
            style_class: 'timers-row-name',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._name.clutter_text.ellipsize = Pango.EllipsizeMode.END;

        this._time = new St.Label({
            style_class: 'timers-row-time',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._pauseButton = this._makeButton(() => {
            if (this._timer.isPaused)
                manager.resume(this._timer.id);
            else
                manager.pause(this._timer.id);
        });
        this._stopButton = this._makeButton(() => manager.stop(this._timer.id));

        this.add_child(this._name);
        this.add_child(this._time);
        this.add_child(this._pauseButton);
        this.add_child(this._stopButton);
    }

    get timerId() {
        return this._timer.id;
    }

    /**
     * @param {number} now
     * @param {boolean} use12h
     */
    sync(now, use12h) {
        const timer = this._timer;
        this._name.text = this._formatter.timerName(timer, use12h);
        this._time.text = this._formatter.remaining(timer.remainingAt(now));

        this._pauseButton.visible = timer.kind === 'countdown' && !timer.isFinished;
        this._setButton(this._pauseButton, timer.isPaused
            ? ['media-playback-start-symbolic', _('Resume')]
            : ['media-playback-pause-symbolic', _('Pause')]);
        this._setButton(this._stopButton, timer.isFinished
            ? ['object-select-symbolic', _('Dismiss')]
            : ['media-playback-stop-symbolic', _('Stop')]);

        setDimmed(this._name, timer.isPaused);
        setDimmed(this._time, timer.isPaused);
        setStyleClass(this, 'timers-finished', timer.isFinished);
    }

    _makeButton(onClicked) {
        const button = new St.Button({
            style_class: 'icon-button timers-row-button',
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({style_class: 'popup-menu-icon'}),
        });
        button.connect('clicked', onClicked);
        return button;
    }

    _setButton(button, [iconName, accessibleName]) {
        button.child.icon_name = iconName;
        button.accessible_name = accessibleName;
    }
});

