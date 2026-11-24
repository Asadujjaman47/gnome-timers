import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {Storage} from './src/services/storage.js';
import {GeneralPage} from './src/prefs/generalPage.js';

export default class TimersPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const storage = new Storage(this.getSettings());
        window.add(new GeneralPage({storage, metadata: this.metadata, extensionDir: this.dir}));
    }
}
