import type { TrackingFrame } from './tracking';
import { cameraFlexMouthPose } from './retarget';
import type { MouthFlexPose } from '../integration/mouth-lipsync';

const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export interface RobotGrilleInputOptions {
  now: number; microphone: boolean; camera: boolean; face: boolean;
  mirror?: boolean; mouthSensitivity?: number;
}
const neutralPose = (): MouthFlexPose => ({ open: 0, narrow: 0, cornerLeft: 0, cornerRight: 0,
  shift: 0, stretchLeft: 0, stretchRight: 0 });
function freshFrame(frame: TrackingFrame | null, now: number): frame is TrackingFrame {
  return !!frame && Number.isFinite(now) && Number.isFinite(frame.timestamp)
    && now - frame.timestamp <= 750 && now >= frame.timestamp;
}

/** Explicit microphone input can drive vibration. Camera mouth geometry never
 * supplies a voice signal; callers can instead pass their own playback envelope.
 */
export function robotGrilleInput(frame: TrackingFrame | null, options: RobotGrilleInputOptions): number {
  if (!freshFrame(frame, options.now)) return 0;
  if (options.microphone) {
    // CaptureTracker already subtracts the microphone noise floor. Lift ordinary
    // speaking levels without making a quiet, held-open mouth buzz indefinitely.
    return clamp(Math.pow(Math.max(0, clamp(frame.audioLevel) - .01) * 2.2, .6));
  }
  return 0;
}

/** Camera opening is independent of microphone volume. Missing or stale face
 * samples request closure; audio alone can never separate the checker rows.
 */
export function robotGrilleOpening(frame: TrackingFrame | null, options: RobotGrilleInputOptions): number {
  return robotGrillePose(frame, options).open;
}

/** Uses the same calibrated, mirrored contour and closed-smile inference as the
 * other mouths. Microphone amplitude only affects vibration, never expression.
 */
export function robotGrillePose(frame: TrackingFrame | null, options: RobotGrilleInputOptions): MouthFlexPose {
  if (!freshFrame(frame, options.now)) return neutralPose();
  const timestamp = frame.faceTimestamp ?? frame.timestamp;
  if (!options.camera || !options.face || !frame.faceTracked || !frame.face
    || !Number.isFinite(timestamp) || options.now - timestamp > 500 || options.now < timestamp) return neutralPose();
  const calibration = frame.calibration;
  return cameraFlexMouthPose(frame.face, calibration?.face ?? {}, frame.mouthGeometry ?? null,
    calibration?.mouthGeometry ?? null, options.mirror ?? true,
    { lipClearance: 0, sensitivity: options.mouthSensitivity });
}

/** A short repeatable syllable pattern for previewing without capture. */
export function robotGrillePreview(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  const phrase = seconds % 2.6;
  if (phrase > 1.95) return 0;
  const syllable = Math.max(0, Math.sin(phrase * Math.PI * 5.4));
  return (.45 + .4 * Math.sin(phrase * 3 + .4) ** 2) * syllable ** .55;
}

/** Show row separation as well as ripple during the device-free preview. */
export function robotGrillePreviewOpening(seconds: number): number {
  return clamp(robotGrillePreview(seconds) * 1.2);
}

/** Device-free expression sweep for comparing the mechanical and full modes. */
export function robotGrillePreviewPose(seconds: number): MouthFlexPose {
  if (!Number.isFinite(seconds) || seconds < 0) return neutralPose();
  const phase = seconds % 8;
  const signed = Math.sin(phase * 1.7);
  const width = Math.sin(phase * 1.1);
  const round = Math.max(0, -width), wide = Math.max(0, width);
  return { open: robotGrillePreviewOpening(seconds), cornerLeft: .8 * signed,
    cornerRight: .8 * Math.sin(phase * 1.7 + .9), shift: .45 * Math.sin(phase * 1.3),
    narrow: .65 * round, stretchLeft: .55 * wide, stretchRight: .45 * wide };
}
