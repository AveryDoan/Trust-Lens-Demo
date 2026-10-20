import React from 'react';
import { Composition, Sequence } from 'remotion';
import timeline from './timeline.json';
import result from './data/demo-result-complaint.json';
import map from './data/demo-findings-map.json';
import policies from './data/policies-harbourview.json';
import counts from './data/counts.json';
import evidence from './data/evidence-resolved.json';
import pages from './data/doc-pages.json';
import timeline60 from './data/timeline60.json';
import { Demo60 } from './Demo60';
import { Boxes60 } from './scenes60/Scenes60';
import { buildFacts } from './facts';
import { useLocalFonts } from './lib';
import { FactsContext, S1, S2, S3, S4, S5 } from './scenes/scenes';

const facts = buildFacts(result, map, counts, policies, evidence, pages);
const SCENES: Record<string, React.FC> = { S1, S2, S3, S4, S5 };

// Scenes must cover frames 0 to total-1 with no gap and no overlap.
let next = 0;
for (const s of timeline.scenes) { if (s.from !== next) throw new Error(`Scene ${s.id} starts at ${s.from}, expected ${next}`); next = s.to + 1; }
if (next !== timeline.total) throw new Error(`Scenes end at ${next}, expected ${timeline.total}`);

const Demo: React.FC = () => {
  useLocalFonts();
  return (
    <FactsContext.Provider value={facts}>
      {timeline.scenes.map((s) => { const Scene = SCENES[s.id]; return <Sequence key={s.id} from={s.from} durationInFrames={s.to - s.from + 1}><Scene /></Sequence>; })}
    </FactsContext.Provider>
  );
};

export const Root: React.FC = () => (
  <>
    <Composition id="ComplaintDemo" component={Demo} durationInFrames={timeline.total} fps={timeline.fps} width={1920} height={1080} />
    <Composition id="ComplaintDemo60" component={Demo60} durationInFrames={timeline60.total} fps={timeline60.fps} width={1920} height={1080} defaultProps={{ facts, captions: true }} />
    <Composition id="Boxes60" component={Boxes60} durationInFrames={1} fps={30} width={1920} height={1080} />
  </>
);
