import React from 'react';
import { Audio, staticFile } from 'remotion';
import { Scene } from './components/Scene';
import { CloseScene, DriveScene, GmailScene, HookScene, PolicyScene, ProductScene } from './Scenes';
import { script } from './script';
import { useFileExists, useLocalFonts } from './lib';

// Optional audio: used only if the file exists in public/audio/.
const MaybeAudio: React.FC<{ file: string; volume: number }> = ({ file, volume }) => {
  const has = useFileExists(file);
  return has ? <Audio src={staticFile(file)} volume={volume} /> : null;
};

export const Intro: React.FC = () => {
  useLocalFonts();
  const s = script.scenes;
  return (
    <>
      <Scene from={s.hook.from} frames={s.hook.frames}><HookScene /></Scene>
      <Scene from={s.product.from} frames={s.product.frames}><ProductScene /></Scene>
      <Scene from={s.gmail.from} frames={s.gmail.frames}><GmailScene /></Scene>
      <Scene from={s.drive.from} frames={s.drive.frames}><DriveScene /></Scene>
      <Scene from={s.policy.from} frames={s.policy.frames}><PolicyScene /></Scene>
      <Scene from={s.close.from} frames={s.close.frames}><CloseScene /></Scene>
      <MaybeAudio file={script.audio.music.file} volume={script.audio.music.volume} />
      <MaybeAudio file={script.audio.voiceover.file} volume={script.audio.voiceover.volume} />
    </>
  );
};
