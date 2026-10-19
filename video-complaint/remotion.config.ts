import { Config } from '@remotion/cli/config';
import fs from 'node:fs';
import path from 'node:path';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

// Use the Chrome already on this machine when there is one (the downloaded headless shell is blocked on some Macs).
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (fs.existsSync(chrome)) Config.setBrowserExecutable(chrome);

// Which optional files exist in public/ (clips and audio). Written when Studio or a render starts, so restart Studio after adding a clip.
function listPublic(dir: string): string[] {
  const root = path.join(process.cwd(), 'public', dir);
  return fs.existsSync(root) ? fs.readdirSync(root).filter((f) => !f.startsWith('.')).map((f) => `${dir}/${f}`) : [];
}
fs.writeFileSync(path.join(process.cwd(), 'src', 'present.json'), JSON.stringify({ files: [...listPublic('clips'), ...listPublic('audio')] }, null, 2) + '\n');
