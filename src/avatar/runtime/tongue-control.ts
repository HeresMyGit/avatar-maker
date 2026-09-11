import type { TongueObservation } from './tongue-types';

export interface TonguePose { out: number; x: number; y: number; }
export interface TongueControlInput {
  enabled: boolean;
  manual: number;
  manualX: number;
  manualY: number;
  webcam: boolean;
  mirror: boolean;
  now: number;
  detection?: TongueObservation;
}
const clamp = (value: number, minimum = 0) => Number.isFinite(value) ? Math.max(minimum, Math.min(1, value)) : 0;

/** Camera coordinates are unmirrored; manual direction already uses avatar-view axes. */
export function resolveTonguePose(input: TongueControlInput): TonguePose {
  const hidden = { out: 0, x: 0, y: 0 };
  if (!input.enabled) return hidden;
  const manual = clamp(input.manual);
  if (manual > 0) return { out: manual, x: clamp(input.manualX, -1), y: clamp(input.manualY, -1) };
  const detected = input.detection;
  if (!input.webcam || detected?.state !== 'detected' || !detected.calibrated
    || !Number.isFinite(detected.timestamp) || input.now < detected.timestamp
    || input.now - detected.timestamp > (detected.held ? 180 : 350)) return hidden;
  const out = clamp(detected.amount);
  if (!out) return hidden;
  return { out, x: clamp((detected.x ?? 0) * (input.mirror ? -1 : 1), -1), y: clamp(detected.y ?? 0, -1) };
}
