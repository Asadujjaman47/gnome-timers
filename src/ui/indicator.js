import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {SummaryState} from '../core/timerManager.js';
import {InputItem} from './inputItem.js';
import {PresetsSection, RecentSection} from './librarySections.js';
import {TimersSection} from './timersSection.js';
import {setDimmed, setStyleClass} from './util.js';

export const ICON_FILE = 'icons/timers-hourglass-symbolic.svg';

/**
 * The panel button and its menu.
 *
 * Panel: hourglass when idle; otherwise the most important timer's time
 * (finished › soonest running › soonest paused) and "+N" for the others.
 */
export const TimersIndicator = GObject.registerClass(
class TimersIndicator extends PanelMenu.Button {
    /**
     * @param {object} deps
     * @param {import('resource:///org/gnome/shell/extensions/extension.js').Extension} deps.extension
     * @param {import('../core/timerManager.js').TimerManager} deps.manager
     * @param {import('../services/ticker.js').Ticker} deps.ticker
     * @param {import('../core/format.js').Formatter} deps.formatter
     * @param {import('../services/clockFormat.js').ClockFormat} deps.clockFormat
     * @param {import('../services/library.js').Library} deps.library
     * @param {import('../services/storage.js').Storage} deps.storage
     */
    _init({extension, manager, ticker, formatter, clockFormat, library, storage}) {
        super._init(0.5, _('Timers'));
        this._manager = manager;
        this._ticker = ticker;
        this._formatter = formatter;
        this._clockFormat = clockFormat;
        this._library = library;
        this._storage = storage;
        this._focusId = 0;
        this._timerIcon = Gio.icon_new_for_string(`${extension.path}/${ICON_FILE}`);
        this._alarmGIcon = new Gio.ThemedIcon({name: 'alarm-symbolic'});

        this._buildPanel();
        this._buildMenu(extension);

        this._managerId = manager.connect('changed', () => this._sync());
        this._tickId = ticker.connect('tick', () => this._sync());
        this._clockFormatId = clockFormat.connect('changed', () => {
            this._rebuildLibrary();
            this._sync();
        });
        this._libraryId = library.connect('changed', () => this._rebuildLibrary());
        this._sessionModeId = Main.sessionMode.connect('updated',
            () => this._syncSensitivity());

        this._rebuildLibrary();
        this._sync();
        this._syncSensitivity();
    }

    /** Opens the menu with the time input focused (the global shortcut). */
    openForInput() {
        if (Main.sessionMode.isLocked)
            return;
        if (this.menu.isOpen)
            this._input.focusEntry();
        else
            this.menu.open();
    }

    _buildPanel() {
        this._icon = new St.Icon({
            gicon: this._timerIcon,
            style_class: 'system-status-icon',
        });
        // Marks the panel's countdown as an alarm.
        this._alarmIcon = new St.Icon({
            icon_name: 'alarm-symbolic',
            style_class: 'system-status-icon timers-panel-alarm-icon',
        });
        this._timeLabel = new St.Label({
            style_class: 'timers-panel-time',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._countLabel = new St.Label({
            style_class: 'timers-panel-count',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const box = new St.BoxLayout({style_class: 'timers-panel-box'});
        box.add_child(this._icon);
        box.add_child(this._alarmIcon);
        box.add_child(this._timeLabel);
        box.add_child(this._countLabel);
        this.add_child(box);
    }

    _buildMenu(extension) {
        const deps = {
            manager: this._manager,
            formatter: this._formatter,
            clockFormat: this._clockFormat,
            library: this._library,
            storage: this._storage,
            timerIcon: this._timerIcon,
            icons: {timer: this._timerIcon, alarm: this._alarmGIcon},
        };

        this._input = new InputItem(deps);
        this._input.connect('started', () => this.menu.close());
        this.menu.addMenuItem(this._input);

        this._timersSeparator = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(this._timersSeparator);
        this._timers = new TimersSection(deps);
        this.menu.addMenuItem(this._timers.section);

        this._librarySeparator = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(this._librarySeparator);
        this._presets = new PresetsSection(deps);
        this._recent = new RecentSection(deps);
        this._addScrollableSection([this._presets.section, this._recent.section]);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const settingsItem = new PopupMenu.PopupImageMenuItem(_('Settings'), 'preferences-system-symbolic');
        settingsItem.connect('activate', () => extension.openPreferences());
        this.menu.addMenuItem(settingsItem);

        this.menu.connect('open-state-changed', (_menu, open) => {
            if (!open)
                return;
            this._input.refresh();
            // Shortcut hints may have changed in the preferences.
            this._rebuildLibrary();
            this._focusInputLater();
        });
    }

    /**
     * Presets and Recent can be long, so they scroll: GNOME caps the menu's
     * height at the screen height, which only helps if part of it scrolls.
     * The sections stay children of the menu (for activation and closing);
     * only their container is moved into a scroll view.
     *
     * @param {PopupMenu.PopupMenuSection[]} sections
     */
    _addScrollableSection(sections) {
        const container = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(container);
        for (const section of sections)
            container.addMenuItem(section);

        const index = this.menu.box.get_children().indexOf(container.actor);
        this.menu.box.remove_child(container.actor);
        const scrollView = new St.ScrollView({
            style_class: 'timers-library-scroll vfade',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            x_expand: true,
            child: container.actor,
        });
        this.menu.box.insert_child_at_index(scrollView, index);
    }

    /**
     * The menu manager moves key focus to the panel button while handling
     * the same open-state-changed emission, so focus the entry right after.
     */
    _focusInputLater() {
        if (this._focusId)
            GLib.source_remove(this._focusId);
        this._focusId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._focusId = 0;
            this._input.focusEntry();
            return GLib.SOURCE_REMOVE;
        });
    }

    _rebuildLibrary() {
        const use12h = this._clockFormat.use12h;
        this._presets.rebuild(use12h);
        this._recent.rebuild(use12h);
        this._librarySeparator.visible = !this._presets.isEmpty || !this._recent.isEmpty;
    }

    _sync() {
        const use12h = this._clockFormat.use12h;
        const now = this._manager.now();
        const {state, primary, others} = this._manager.summary();
        const idle = state === SummaryState.IDLE;

        this._icon.visible = idle;
        this._alarmIcon.visible = !idle && primary.kind === 'alarm' && primary.isRunning;
        this._timeLabel.visible = !idle;
        this._countLabel.visible = !idle && others > 0;
        if (!idle) {
            this._timeLabel.text = this._formatter.remaining(primary.remainingAt(now));
            this._countLabel.text = `+${others}`;
        }
        setDimmed(this._timeLabel, state === SummaryState.PAUSED);
        setStyleClass(this._timeLabel, 'timers-finished', state === SummaryState.FINISHED);

        this._timers.sync(use12h);
        this._timersSeparator.visible = !this._timers.isEmpty;

        // Keep the preview current ("tomorrow", 12/24 h) while the menu is open.
        if (this.menu.isOpen)
            this._input.refresh();
    }

    /** Display-only while the screen is locked. */
    _syncSensitivity() {
        const unlocked = !Main.sessionMode.isLocked;
        if (!unlocked)
            this.menu.close();
        this.setSensitive(unlocked);
    }

    _onDestroy() {
        if (this._focusId) {
            GLib.source_remove(this._focusId);
            this._focusId = 0;
        }
        this._manager.disconnect(this._managerId);
        this._ticker.disconnect(this._tickId);
        this._clockFormat.disconnect(this._clockFormatId);
        this._library.disconnect(this._libraryId);
        Main.sessionMode.disconnect(this._sessionModeId);
        super._onDestroy();
    }
});
