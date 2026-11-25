# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

First release.

### Timers

- Run several countdown timers at once from the top panel, each with an
  optional name: `12m pizza`. Pause, resume or stop each one from the menu.
- Type times the way you say them: `5m`, `90s`, `1h30m`, `5 min`,
  `2 hours`, `1.5h`, `in 10 min tea`, `1:30`, or digits only (`530` → 5:30).
  A preview under the input shows how it is understood. Digits from other
  scripts (for example Bengali) work too.
- Alarms at a clock time: `@14:30`, `at 7 am`, `5:30 pm`, `@1010pm`, `@noon`.
  An alarm for a time that has passed rings tomorrow, and alarms keep their
  local time when the time zone changes.
- The panel shows the timer that ends soonest and how many others run; an
  alarm is marked with ⏰. Menu rows show when each alarm rings.
- Timers keep counting on the lock screen and survive restarting GNOME Shell.

### When a timer finishes

- It plays its sound once (Bell, Complete, Message or your own file), shows a
  short notification and clears itself.
- With "Repeat until stopped" it keeps ringing and the notification gets a
  Stop button.
- Notifications follow Do Not Disturb; the sound still plays unless
  "Silence alarms during Do Not Disturb" is on.
- Timers that ended while you were logged out are reported quietly.

### Presets and Recent

- Presets start saved timers with one click or their own keyboard shortcut
  (up to 9), each with its own sound. Manage them on the Presets page in the
  preferences, or save a recent timer with ☆ in the menu.
- The Recent list shows the timers you typed, newest first; click one to
  start it again.

### Preferences and shortcuts

- Alarm sound with preview, "Repeat until stopped", "Silence alarms during
  Do Not Disturb", number of recent timers, and the shortcut that opens the
  menu ready to type (default Ctrl+Super+T).

### Quality

- Supports GNOME Shell 46–51; checked on 46, 48, 49, 50 and 51.
- Works in the light, dark and high-contrast styles and with large text (the
  presets and recent timers scroll when the menu would not fit the screen).
- Light on battery: nothing runs while no timer does, and running timers wake
  GNOME Shell once per second however many there are.
- Tested for memory leaks and with 20 000 generated inputs.
