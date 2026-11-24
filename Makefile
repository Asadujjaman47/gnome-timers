UUID      := timers@asadujjaman47.github.io
BUILD_DIR := build
ZIP       := $(BUILD_DIR)/$(UUID).shell-extension.zip

JS_SOURCES   := extension.js prefs.js $(shell find src -name '*.js')
PACK_SOURCES := metadata.json stylesheet.css $(JS_SOURCES) \
                $(wildcard schemas/*.gschema.xml) $(wildcard po/*.po) \
                $(shell find icons sounds -type f)

# GNOME 49+ replaced `gnome-shell --nested` with `--devkit` (needs mutter-devkit).
NESTED_FLAG := $(shell gnome-shell --help 2>/dev/null | grep -q -- --devkit && echo --devkit || echo --nested)

.PHONY: help check lint test schemas schemas-check pack install enable disable \
        uninstall run pot clean

help:
	@echo "Targets:"
	@echo "  check      lint + tests + schema check (what CI runs)"
	@echo "  lint       ESLint"
	@echo "  test       unit tests (gjs)"
	@echo "  pack       build $(ZIP)"
	@echo "  install    pack and install for the current user"
	@echo "  enable     enable the extension (after re-login on Wayland)"
	@echo "  run        install and start a nested GNOME Shell for testing"
	@echo "  pot        regenerate po/timers.pot"
	@echo "  clean      remove build output"

check: lint test schemas-check

node_modules: package.json package-lock.json
	npm ci
	@touch node_modules

lint: node_modules
	npx eslint .

test:
	gjs -m tests/run.js

schemas:
	glib-compile-schemas --strict schemas/

schemas-check:
	glib-compile-schemas --strict --dry-run schemas/

pack: $(ZIP)

$(ZIP): $(PACK_SOURCES)
	@mkdir -p $(BUILD_DIR)
	gnome-extensions pack --force --out-dir=$(BUILD_DIR) \
		--extra-source=src --extra-source=icons --extra-source=sounds \
		--podir=po .

install: pack
	gnome-extensions install --force $(ZIP)
	@echo "Installed $(UUID)."
	@echo "On Wayland GNOME Shell only loads new extensions after you log out and back in; then run: make enable"

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

uninstall:
	gnome-extensions uninstall $(UUID)

run: install
	@echo "Starting nested GNOME Shell ($(NESTED_FLAG)). Close its window to stop."
	dbus-run-session -- gnome-shell $(NESTED_FLAG) --wayland

pot:
	xgettext --from-code=UTF-8 --language=JavaScript \
		--keyword=_ --keyword=N_ --keyword=ngettext:1,2 --keyword=pgettext:1c,2 \
		--package-name=Timers --add-comments=TRANSLATORS \
		--output=po/timers.pot $(JS_SOURCES)

clean:
	rm -rf $(BUILD_DIR) schemas/gschemas.compiled
