import React from 'react';
import { OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';
import { useFileExists } from '../lib';
import type { ClipConfig } from '../script';

export const useHasClip = (clip: ClipConfig) => useFileExists(clip.file);

// Uses the real recording if public/<clip.file> exists, otherwise renders `children` (a simulated screen).
export const ClipOrSimulated: React.FC<{ clip: ClipConfig; children: React.ReactNode }> = ({ clip, children }) => {
  const f = useCurrentFrame();
  const has = useFileExists(clip.file);
  if (!has) {
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        {children}
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <OffthreadVideo src={staticFile(clip.file)} startFrom={clip.startFrom} playbackRate={clip.playbackRate} muted style={{ width: 1920, height: 1080, objectFit: 'cover' }} />
      {clip.blurRegions.filter((r) => f >= r.from && f <= r.to).map((r, i) => (
        <div key={i} style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, backdropFilter: 'blur(22px)', background: 'rgba(30,35,33,0.35)' }} />
      ))}
    </div>
  );
};

export const SimulatedLabel: React.FC = () => (
  <div style={{ position: 'absolute', left: 24, top: 18, padding: '4px 12px', background: C.background, border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: FONT, fontSize: 24, fontWeight: 600, color: C.muted }}>
    Simulated screen
  </div>
);
