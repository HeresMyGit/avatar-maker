/** Shared tongue evidence, independent of the capture implementation. */
export interface TongueObservation {
  amount: number;
  confidence: number;
  /** Head/mouth-relative motion: positive x is camera-image right, positive y is down. */
  x?: number;
  y?: number;
  /** Current measured tip in full, unmirrored camera-image coordinates [0, 1]. Omitted during a hold. */
  tip?: { x: number; y: number };
  /** Brief uncertain-evidence hold; timestamp remains the last real positive frame. */
  held?: boolean;
  state: 'uncalibrated' | 'calibrating' | 'unknown' | 'not-detected' | 'detected';
  timestamp: number;
  /** Detector is ready; neural tracking requires no user calibration. */
  calibrated: boolean;
  /** Reserved for compatible recorded frames; automatic neural observations use 0. */
  calibrationId: number;
  reason?: string;
}
