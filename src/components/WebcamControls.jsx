import { useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';
import { CaptureTracker } from '../avatar/runtime';

const Panel = styled.div`
  position: absolute; left: 20px; bottom: 20px; z-index: 5;
  max-width: min(280px, calc(100% - 40px));
  padding: 10px; border-radius: 16px;
  background: rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.16);
  backdrop-filter: blur(14px); color: white;
  button { font-family: 'SartoshiScript', sans-serif; font-size: 1.2rem;
    color: white; background: transparent; border: 1px solid rgba(255,255,255,.24);
    border-radius: 10px; padding: 7px 12px; cursor: pointer; }
  button:hover { background: ${props => props.themeColor}44; }
  button:disabled { opacity: .45; cursor: default; }
  button:focus-visible { outline: 2px solid ${props => props.themeColor}; outline-offset: 2px; }
  video { width: 150px; height: 112px; object-fit: cover; transform: scaleX(-1);
    border-radius: 10px; margin-top: 10px; display: block; }
  video[hidden] { display: none; }
  p { margin: 8px 0 0; font: 12px/1.45 system-ui, sans-serif; color: #d6dedc; }
  .webcam-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
  @media (max-width: 768px) { position: absolute; left: 12px; bottom: 12px; padding: 8px;
    video { width: 104px; height: 78px; } p { max-width: 200px; font-size: 12px; } }
`;

/** Camera permission is requested only after the user presses Webcam. */
export default function WebcamControls({ captureRef, previewRef, themeColor }) {
  const videoRef = useRef(null);
  const trackerRef = useRef(null);
  const generation = useRef(0);
  const [status, setStatus] = useState({ state: 'off', message: '' });
  const active = status.state === 'running';
  const loading = status.state === 'loading';

  function clearCapture() {
    captureRef.current.active = false;
    captureRef.current.frame = null;
  }
  function stop() {
    generation.current++;
    trackerRef.current?.stop();
    trackerRef.current = null;
    clearCapture();
    setStatus({ state: 'off', message: '' });
  }
  useEffect(() => {
    const release = () => {
      generation.current++;
      trackerRef.current?.stop();
      trackerRef.current = null;
      clearCapture();
    };
    const pagehide = () => { release(); setStatus({ state: 'off', message: '' }); };
    const visibility = () => { if (document.hidden) pagehide(); };
    window.addEventListener('pagehide', pagehide);
    document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('pagehide', pagehide); document.removeEventListener('visibilitychange', visibility); release(); };
  }, [captureRef]);

  async function start() {
    if (active || loading) { stop(); return; }
    if (!previewRef.current?.ready) {
      setStatus({ state: 'error', message: 'Your avatar is still loading. Try again in a moment.' });
      return;
    }
    const current = ++generation.current;
    const tracker = new CaptureTracker({ video: videoRef.current,
      onFrame(frame) { if (generation.current === current) captureRef.current.frame = frame; },
      onStatus(next) {
        if (generation.current !== current) return;
        if (next.state === 'error') {
          // A track can end while start() is still awaiting model downloads.
          // Invalidate that pending start so it cannot revive stopped capture.
          generation.current++;
          tracker.stop();
          trackerRef.current = null;
          clearCapture();
          setStatus({ state: 'error', message: next.message });
        }
        else if (next.state === 'loading') setStatus({ state: 'loading', message: next.message });
      },
    });
    trackerRef.current = tracker;
    tracker.setTongueEnabled(true);
    setStatus({ state: 'loading', message: 'Allow camera access to move your avatar.' });
    try {
      await tracker.start({ camera: true, microphone: false, mode: 'enhanced', hands: true });
      if (generation.current !== current) { tracker.stop(); return; }
      captureRef.current.active = true;
      setStatus({ state: 'running', message: 'Face, body + hands · processed on your device' });
    } catch (error) {
      if (generation.current !== current) return;
      tracker.stop(); clearCapture();
      setStatus({ state: 'error', message: error.message || 'Could not start the camera. Please try again.' });
    }
  }
  function calibrate() {
    const calibrated = trackerRef.current?.calibrate() && previewRef.current?.calibrate(captureRef.current.frame);
    setStatus({ state: 'running', message: calibrated ? 'Neutral pose set. Move and speak naturally.' : 'Keep your face in view, then try Calibrate.' });
  }
  return <Panel themeColor={themeColor} data-testid="webcam-controls" data-state={status.state}>
    <div className="webcam-buttons">
      <button type="button" onClick={start} aria-pressed={active}>
        {loading ? 'Cancel camera' : active ? 'Stop webcam' : '◉ Webcam'}
      </button>
      {active && <button type="button" onClick={calibrate}>Calibrate</button>}
    </div>
    <video ref={videoRef} autoPlay playsInline muted hidden={!active} aria-label="Your webcam preview" />
    {status.message && <p role="status">{status.message}</p>}
  </Panel>;
}
