import React, { useEffect, useState } from 'react';
import { Audio, Sequence, continueRender, delayRender, staticFile, useCurrentFrame } from 'remotion';
import timeline from './data/timeline60.json';
import { useLocalFonts } from './lib';
import present from './present.json';
import { CaptionsOn, SceneFrom } from './components/shot';
import { FactsContext, S1, S2, S3, S4, S5, S6 } from './scenes60/Scenes60';
import type { Facts } from './facts';

const SCENES: Record<string, React.FC> = { S1, S2, S3, S4, S5, S6 };

// Scenes must cover frames 0 to 1799 with no gap and no overlap.
let next = 0;
for (const s of timeline.scenes) { if (s.from !== next) throw new Error(`Scene ${s.id} starts at ${s.from}, expected ${next}`); next = s.to + 1; }
if (next !== timeline.total) throw new Error(`Scenes end at ${next}, expected ${timeline.total}`);

export const hasVoiceover = (present.files as string[]).includes('voiceover.mp3');

// Probe: with the prop `probe` the frame logs every word it shows, so scripts/probe60.mjs can search the whole video for text.
const Probe: React.FC = () => {
  const f = useCurrentFrame();
  const [h] = useState(() => delayRender('probe'));
  useEffect(() => { const t = setTimeout(() => { console.log('PROBE ' + JSON.stringify({ f, t: document.body.innerText })); continueRender(h); }, 50); return () => clearTimeout(t); }, [f, h]);
  return null;
};

export const Demo60: React.FC<{ facts: Facts; captions: boolean; probe?: boolean }> = ({ facts, captions, probe }) => {
  useLocalFonts();
  return (
    <FactsContext.Provider value={facts}>
      <CaptionsOn.Provider value={captions}>
        {probe && <Probe />}
        {hasVoiceover && <Audio src={staticFile('voiceover.mp3')} />}
        {timeline.scenes.map((s) => {
          const Scene = SCENES[s.id];
          return <Sequence key={s.id} from={s.from} durationInFrames={s.to - s.from + 1}><SceneFrom value={s.from}><Scene /></SceneFrom></Sequence>;
        })}
      </CaptionsOn.Provider>
    </FactsContext.Provider>
  );
};
