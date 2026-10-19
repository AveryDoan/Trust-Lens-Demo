// Email A, exactly as in trustlens-lite/demo/emails/a.txt.
export const emailA = {
  subject: 'Demo email A: complaint follow-up',
  from: 'Jess',
  paragraphs: [
    'Hi all,',
    'Following up on the complaint about Casey Doyle. Casey did it - there is no doubt that Casey bullied the volunteers at the last chapter event, and members under 30 are always the ones causing trouble at our events.',
    'The complainant is Morgan Ellis (mobile 0491 570 156, morgan.ellis@example.com). I have pasted my interview notes below so everyone on the staff list can see what happened.',
    "I think we should remove Casey's membership now and skip the investigation to save time.",
  ],
};
export const inbox = [
  { tag: 'Demo A', subject: 'Demo email A: complaint follow-up', from: 'Jess', preview: 'Following up on the complaint about Casey Doyle...' },
  { tag: 'Demo B', subject: 'Demo email B: election forward', from: 'Forwarded', preview: 'URGENT: Nominee Rowe is the only one who...' },
  { tag: 'Demo C', subject: 'Demo email C: updated governance documents', from: 'Communications Team', preview: 'This item is cleared for the member newsletter...' },
];
export const files = ['01-case-note.pdf', '02-election-flyer.pdf', '03-governance-update.pdf', '04-ai-briefing.pdf'];
