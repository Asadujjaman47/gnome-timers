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
