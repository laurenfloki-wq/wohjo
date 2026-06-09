// Shared scene types — the audio contract between useSceneAudio and
// the SceneOrchestrator (flostruction-v5.html:849-873).
export interface SceneAudio {
  /** Resume/create the AudioContext on a user gesture. */
  ac: () => void;
  sndTx: () => void;
  sndRx: () => void;
  sndSeal: () => void;
  sndHold: () => void;
}
