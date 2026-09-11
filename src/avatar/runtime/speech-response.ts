/** Opening needed to separate each thick lip pair in the current studio rig.
 * Measured from the projected upper/lower center-plane triangle silhouettes.
 * These compensate mesh overlap, not extra detected facial movement.
 */
export const SPEECH_LIP_CLEARANCE: Readonly<Record<string, number>> = Object.freeze({
  mouth_smile: .29, mouth_flat: .42,
  mouth_smile_metal: .29, mouth_flat_metal: .42,
  mouth_smile_mfercoin: .35, mouth_flat_mfercoin: .52,
});

export interface SpeechMouthOptions {
  sensitivity?: number;
  lipClearance?: number;
}

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));

/** Continuous small-speech response: exact zero at rest, full range retained.
 * Acquire the overlap compensation gradually so tiny lip jitter cannot pop the
 * mouth open. Sensitivity changes speech amplitude without lowering that gate.
 */
export function speechMouthOpening(value: number, options: SpeechMouthOptions = {}): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const signal = clamp(value);
  const sensitivity = Number.isFinite(options.sensitivity) ? clamp(options.sensitivity!, .5, 2) : 1;
  const clearance = Number.isFinite(options.lipClearance) ? clamp(options.lipClearance!, 0, .6) : .29;
  const t = clamp(signal / .08);
  const acquisition = t * t * (3 - 2 * t);
  const speech = 1 - Math.pow(1 - clamp(signal * sensitivity), 1.25);
  return acquisition * (clearance + (1 - clearance) * speech);
}
