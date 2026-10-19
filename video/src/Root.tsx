import React from 'react';
import { Composition } from 'remotion';
import { Intro } from './Intro';
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH, validateScript } from './script';

validateScript();

export const Root: React.FC = () => (
  <Composition id="TrustLensIntro" component={Intro} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} />
);
