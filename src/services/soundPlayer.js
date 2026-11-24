import GLib from 'gi://GLib';
import Gst from 'gi://Gst?version=1.0';

/** Pause between repetitions when looping. */
const LOOP_GAP_MS = 1500;

/**
 * Plays one sound at a time with GStreamer, optionally looping until stopped.
 */
export class SoundPlayer {
    /** @type {Gst.Element|null} */
    #pipeline = null;
    #busId = 0;
    #loop = false;
    #gapId = 0;

    get playing() {
        return this.#pipeline !== null;
    }

    /**
     * Stops anything playing and starts `file`.
     *
     * @param {import('gi://Gio').default.File} file
     * @param {{loop?: boolean}} [options]
     */
    play(file, {loop = false} = {}) {
        this.stop();
        if (!ensureGst())
            return;

        const pipeline = Gst.ElementFactory.make('playbin', null);
        if (!pipeline) {
            console.error('Timers: GStreamer "playbin" is not available');
            return;
        }
        pipeline.uri = file.get_uri();

        const bus = pipeline.get_bus();
        bus.add_signal_watch();
        this.#busId = bus.connect('message', (_bus, message) => this.#onMessage(message));

        this.#pipeline = pipeline;
        this.#loop = loop;
        pipeline.set_state(Gst.State.PLAYING);
    }

    stop() {
        if (this.#gapId) {
            GLib.source_remove(this.#gapId);
            this.#gapId = 0;
        }
        if (!this.#pipeline)
            return;

        const bus = this.#pipeline.get_bus();
        bus.disconnect(this.#busId);
        bus.remove_signal_watch();
        this.#busId = 0;
        this.#pipeline.set_state(Gst.State.NULL);
        this.#pipeline = null;
    }

    destroy() {
        this.stop();
    }

    #onMessage(message) {
        if (message.type === Gst.MessageType.EOS) {
            if (this.#loop)
                this.#replayAfterGap();
            else
                this.stop();
        } else if (message.type === Gst.MessageType.ERROR) {
            const [error] = message.parse_error();
            console.error(`Timers: could not play sound: ${error.message}`);
            this.stop();
        }
    }

    #replayAfterGap() {
        this.#pipeline.set_state(Gst.State.PAUSED);
        this.#gapId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, LOOP_GAP_MS, () => {
            this.#gapId = 0;
            this.#pipeline?.seek_simple(Gst.Format.TIME,
                Gst.SeekFlags.FLUSH | Gst.SeekFlags.KEY_UNIT, 0);
            this.#pipeline?.set_state(Gst.State.PLAYING);
            return GLib.SOURCE_REMOVE;
        });
    }
}

/**
 * GStreamer is initialised on first use, not at import: initialising it
 * while GNOME Shell starts up can stall the startup.
 */
function ensureGst() {
    if (Gst.is_initialized())
        return true;
    try {
        Gst.init(null);
        return true;
    } catch (e) {
        console.error('Timers: could not initialise GStreamer', e);
        return false;
    }
}
