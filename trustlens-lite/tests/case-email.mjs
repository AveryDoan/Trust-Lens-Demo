// The text of the complaint email used as the test message body. The file demo/case-complaint/case-email.txt comes with
// the prepared data. Without it, quotes from the open email cannot be verified and the tests say so.
import { existsSync, readFileSync } from 'node:fs';
const FILE = new URL('../demo/case-complaint/case-email.txt', import.meta.url);
export const caseEmailText = () => (existsSync(FILE) ? readFileSync(FILE, 'utf8') : null);
