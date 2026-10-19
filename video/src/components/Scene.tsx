import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { C } from '../theme';
import { prog } from '../lib';

// A scene is a Sequence on the page background with short fades at both ends. Frames inside are relative.
export const Scene: React.FC<{ from: number; frames: number; fade?: number; children: React.ReactNode }> = ({ from, frames, fade = 6, children }) => (
  <Sequence from={from} durationInFrames={frames}>
    <Inner frames={frames} fade={fade}>{children}</Inner>
  </Sequence>
);

const Inner: React.FC<{ frames: number; fade: number; children: React.ReactNode }> = ({ frames, fade, children }) => {
  const f = useCurrentFrame();
  const opacity = Math.min(prog(f, 0, fade), 1 - prog(f, frames - fade, frames));
  return <AbsoluteFill style={{ background: C.background, opacity }}>{children}</AbsoluteFill>;
};
