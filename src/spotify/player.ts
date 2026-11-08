// Web Playback SDK wrapper + set runner (play segment → fade → jump to next cue → fade in).
// No overlap between tracks: Spotify's Developer Policy forbids mixing/overlapping content.
import { getAccessToken } from "./auth";
import { playOnDevice, type Track } from "./api";
import type { Segment } from "../mix/music";

let sdkReady: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  sdkReady ??= new Promise((resolve) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement("script");
    s.src = "https://sdk.scdn.co/spotify-player.js";
    document.body.appendChild(s);
  });
  return sdkReady;
}

export interface BrowserPlayer {
  player: Spotify.Player;
  deviceId: string;
}

/** Creates the in-browser Spotify device. Requires Premium. */
export async function createPlayer(): Promise<BrowserPlayer> {
  await loadSdk();
  const player = new Spotify.Player({
    name: "Spotify Mix",
    volume: 0.8,
    getOAuthToken: (cb) => void getAccessToken().then((t) => t && cb(t)),
  });
  return new Promise((resolve, reject) => {
    player.addListener("ready", ({ device_id }) => resolve({ player, deviceId: device_id }));
    player.addListener("initialization_error", ({ message }) => reject(new Error(`SDK init: ${message}`)));
    player.addListener("authentication_error", ({ message }) => reject(new Error(`SDK auth: ${message}`)));
    player.addListener("account_error", () => reject(new Error("Χρειάζεται Spotify Premium.")));
    void player.connect();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fade(player: Spotify.Player, from: number, to: number, ms: number, maxVolume: number) {
  const steps = Math.max(1, Math.round(ms / 80));
  for (let i = 1; i <= steps; i++) {
    await player.setVolume(Math.max(0.0001, (from + ((to - from) * i) / steps) * maxVolume));
    await sleep(ms / steps);
  }
}

/** Current position in ms, extrapolated from the last reported state. */
async function positionMs(player: Spotify.Player): Promise<number | null> {
  const state = await player.getCurrentState();
  if (!state) return null;
  return state.paused ? state.position : state.position + (Date.now() - state.timestamp);
}

export interface SetItem {
  track: Track;
  segment: Segment;
}

export interface RunOptions {
  fadeMs: number;
  volume: number; // 0..1
  onTrack?: (index: number) => void;
  onProgress?: (index: number, positionSec: number) => void;
}

/** Plays a set; returns a stop() function. */
export function runSet(bp: BrowserPlayer, items: SetItem[], opts: RunOptions): () => void {
  let stopped = false;
  const { player, deviceId } = bp;

  (async () => {
    for (let i = 0; i < items.length && !stopped; i++) {
      const { track, segment } = items[i];
      opts.onTrack?.(i);
      await player.setVolume(0.0001);
      await playOnDevice(deviceId, track.uri, segment.startSec * 1000);
      await fade(player, 0, 1, opts.fadeMs, opts.volume);

      const endMs = segment.endSec * 1000 - opts.fadeMs;
      while (!stopped) {
        const pos = await positionMs(player);
        if (pos !== null) {
          opts.onProgress?.(i, pos / 1000);
          if (pos >= endMs) break;
        }
        await sleep(200);
      }
      if (!stopped) await fade(player, 1, 0, opts.fadeMs, opts.volume);
    }
    if (!stopped) {
      await player.pause();
      await player.setVolume(opts.volume);
    }
  })().catch((e) => console.error("runSet", e));

  return () => {
    stopped = true;
    void player.pause().then(() => player.setVolume(opts.volume));
  };
}
