# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Project skeleton: extension and preferences entry points, GSettings schema,
  hourglass panel icon, fallback alarm sound.
- Development tooling: ESLint (with architecture import rules), GJS unit test
  runner, Makefile, GitHub Actions CI.
- Core logic (not yet wired to the UI): input parser for countdowns, labels
  and clock-time alarms; display formatting and automatic timer names;
  timer manager for multiple timers with pause/resume and restart-safe end
  times; presets, Recent list and versioned storage format.
- Panel button and menu: type a time (with live preview), run several timers
  at once, pause/resume/stop each; the panel shows the most urgent timer and
  how many others are running.
- When a timer finishes it plays its sound once (Bell, Complete, Message or a
  custom file), shows a short notification and clears itself. With "Repeat
  until stopped" it keeps ringing and gets a Stop button instead.
- Notifications follow Do Not Disturb; the sound still plays unless
  "Silence alarms during Do Not Disturb" is on. Timers that finished while
  logged out are reported silently.
- Timers survive disabling the extension and restarting GNOME Shell.
- Keyboard shortcut (default Ctrl+Super+T) opens the menu ready to type.
- Alarms at a clock time (`@14:30`, `@1010pm`, `@930`, `at 7 am meeting`):
  the panel shows an alarm icon with the countdown; menu rows show when an
  alarm rings ("Meeting · 14:30", "Alarm tomorrow 07:00"); timer and alarm
  rows have their own icons; everything follows the 12/24-hour setting.
- Alarms follow time zone changes: an alarm for 14:30 still rings at 14:30
  local time after the time zone changes.
- Presets: start saved timers with one click from the menu or with their own
  keyboard shortcut (up to 9). Each has a time, an optional name and its own
  sound. Manage them on the new Presets page in the preferences, or save a
  recent timer with ☆ in the menu.
- Recent list in the menu: timers you typed, newest first; click one to start
  it again. "Recent timers to show" in the preferences (0 hides the list).
- Preferences: default sound with preview, repeat option, shortcut recorder.
