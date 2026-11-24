import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {GeneralPage} from './src/prefs/generalPage.js';

export default class TimersPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.add(new GeneralPage(this.getSettings(), this.metadata));
    }
}
