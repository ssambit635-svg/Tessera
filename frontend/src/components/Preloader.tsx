import { useEffect, useRef, useState } from "react";

interface PreloaderProps {
  state: "loading" | "leaving";
  ready: boolean;
  complete: boolean;
  reducedMotion: boolean;
  onComplete: () => void;
}

/** Play the supplied brand animation once; the app decides when it is ready to reveal. */
export function Preloader({ state, ready, complete, reducedMotion, onComplete }: PreloaderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (reducedMotion || complete) return;
    const video = videoRef.current;
    // A failed, blocked, or stalled video must never trap visitors on the splash.
    const timeout = window.setTimeout(onComplete, 12000);
    if (video) {
      try {
        const playback = video.play();
        playback?.catch(onComplete);
      } catch {
        onComplete();
      }
    }
    return () => window.clearTimeout(timeout);
  }, [reducedMotion, complete, onComplete]);

  return (
    <div className={`pre ${dark ? "is-dark" : ""} ${state === "leaving" ? "is-leaving" : ""}`}>
      {reducedMotion ? (
        <img className="pre-video" src="/brand/tessera-intro-poster.jpg" alt="" />
      ) : (
        <video
          ref={videoRef}
          className="pre-video"
          src="/brand/tessera-intro.mp4"
          poster="/brand/tessera-intro-poster.jpg"
          autoPlay
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          onTimeUpdate={(event) => {
            if (event.currentTarget.currentTime >= 1.25) setDark(true);
          }}
          onEnded={onComplete}
          onError={onComplete}
        />
      )}
      {!complete && state !== "leaving" && (
        <button className="pre-skip" type="button" onClick={() => { videoRef.current?.pause(); onComplete(); }}>Skip intro</button>
      )}
      <p className="pre-status" role="status" aria-live="polite">
        {!ready && complete ? "Preparing your workspace…" : <span className="pre-sr-only">Loading Tessera</span>}
      </p>
    </div>
  );
}
