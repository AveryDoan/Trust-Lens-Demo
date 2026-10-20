// Extra panel screens for the 60 second video. Every fact comes from the facts object (the prepared JSON). Light theme only.
import React from 'react';
import { C } from '../theme';
import { prog } from '../lib';
import { Btn, RoleChip, small } from './panel';

const reveal = (p: number) => ({ opacity: p, transform: `translateY(${(1 - p) * 12}px)` });
const Quote: React.FC<{ text: string; size?: number }> = ({ text, size = 14 }) => (
  <div style={{ paddingLeft: 12, borderLeft: `2px solid ${C.muted}`, fontStyle: 'italic', fontSize: size, lineHeight: 1.3 }}>{text}</div>
);
const Found: React.FC<{ text: string }> = ({ text }) => <div style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, marginTop: 4 }}>✓ {text}</div>;
const Label: React.FC<{ children: React.ReactNode; p?: number }> = ({ children, p = 1 }) => <div style={{ ...small, fontWeight: 600, ...reveal(p) }}>{children}</div>;

// a quote block: document chip and "shows" caption above, the quote, then "Found in ..."
export const QuoteBlock: React.FC<{ item: any; p?: number }> = ({ item, p = 1 }) => (
  <div style={reveal(p)}>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 }}><RoleChip>{item.label}</RoleChip><span style={small}>{item.shows}</span></div>
    <Quote text={item.text} /><Found text={item.found} />
  </div>
);

// ---- S2: the tools list ----
export const ToolsView: React.FC<{ facts: any; p: number[]; hot?: number }> = ({ facts, p, hot = 0 }) => (
  <div style={{ padding: 16 }}>
    {facts.labels.tools.map((t: string, i: number) => (
      <div key={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${C.border}`, fontSize: 16, fontWeight: i === 0 ? 700 : 600, ...reveal(p[i] ?? 1), color: i === 0 ? C.accent : C.foreground }}>
        <span>{t}</span><span style={{ color: C.muted, fontWeight: 400 }}>›</span>
      </div>
    ))}
  </div>
);

// ---- S3: the permission screen (a mock-up) ----
export const ConsentView: React.FC<{ facts: any; rowP: number[]; tickP: number[]; allowHot: number; pressed: boolean }> = ({ facts, rowP, tickP, allowHot, pressed }) => {
  const c = facts.labels.consent;
  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, ...reveal(rowP[0]) }}>{c.title}</div>
      {c.rows.map((r: string, i: number) => (
        <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: `1px solid ${C.border}`, fontSize: 16, fontWeight: 600, ...reveal(rowP[i + 1]) }}>
          <span style={{ width: 22, height: 22, borderRadius: 4, border: `2px solid ${C.accent}`, display: 'grid', placeItems: 'center', background: tickP[i] > 0.5 ? C.accent : 'transparent', color: C.accentFg, fontSize: 14, lineHeight: 1 }}>{tickP[i] > 0.5 ? '✓' : ''}</span>
          <span>{r}</span>
        </div>
      ))}
      <div style={{ ...small, fontSize: 14, color: C.foreground, ...reveal(rowP[3]) }}>{c.note}</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6, ...reveal(rowP[4]) }}><Btn primary hot={allowHot} pressed={pressed}>{c.allow}</Btn><Btn>{c.notNow}</Btn></div>
    </div>
  );
};

// ---- one side-by-side for the whole video: LEFT is what is being checked (the customer's email, or the invoice),
// RIGHT is the source of truth (the agreement, the policy pack, or the correspondence thread). Same layout everywhere. ----
export type SideItem = { head: string; shows?: string; text?: string; found?: string; note?: string };
export const SideBySide: React.FC<{ left: SideItem; right: SideItem; tag: string; p?: number; leftP?: number; rightP?: number }> = ({ left, right, tag, p = 1, leftP, rightP }) => {
  const col = (it: SideItem, isRight: boolean, cp: number) => (
    <div key={it.head} style={{ display: 'grid', gap: 6, alignContent: 'start', minWidth: 0, ...reveal(cp) }}>
      <div><RoleChip>{it.head}</RoleChip></div>
      {/* the tag sits under the right heading; the left column keeps the same space so the quotes line up */}
      <div style={{ height: 15, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: C.accent }}>{isRight ? tag : ''}</div>
      {it.shows && <div style={small}>{it.shows}</div>}
      {it.text && <Quote text={it.text} />}
      {it.found && <Found text={it.found} />}
      {it.note && <div style={{ fontSize: 13.5, lineHeight: 1.35, fontWeight: it.text ? 400 : 600, color: C.foreground }}>{it.note}</div>}
    </div>
  );
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>{col(left, false, leftP ?? p)}{col(right, true, rightP ?? p)}</div>;
};

// ---- S4 and S5: the assessment, four checks; one row opens in place ----
type Open = 'none' | 'bias' | 'accuracy' | 'misleading';
export const AssessView: React.FC<{ facts: any; rowsP: number[]; open: Open; sub?: 'Misinformation' | 'Needs checking' | null; contentP: number[]; tagsP?: number }> = ({ facts, rowsP, open, sub, contentP, tagsP = 1 }) => {
  const a = facts.sixty.assess;
  const sixty = facts.sixty;
  const tag = facts.labels.sourceOfTruth;
  const policyHead = facts.labels.tools[3].split(':')[0];
  const chip = (text: string, strong = false) => (
    <span style={{ display: 'inline-block', padding: '0 8px', border: `1.5px solid ${strong ? C.accent : C.check}`, background: strong ? C.accent : C.checkBg, color: strong ? C.accentFg : C.check, borderRadius: 4, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{text}</span>
  );
  const claim = sub === 'Misinformation' ? sixty.claims.misinformation : sixty.claims.needsChecking;
  const content: Record<string, React.ReactNode> = {
    bias: (
      <div style={{ display: 'grid', gap: 10, marginTop: 10, ...reveal(contentP[0] ?? 1) }}>
        <SideBySide tag={tag} p={contentP[1] ?? 1}
          left={{ head: sixty.bias.items[0].label, shows: sixty.bias.items[0].shows, text: sixty.bias.items[0].text, found: sixty.bias.items[0].found }}
          right={{ head: policyHead, note: sixty.bias.note }} />
      </div>
    ),
    accuracy: sub ? (
      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        <div style={{ ...reveal(contentP[0] ?? 1) }}>{chip(sub, true)}</div>
        <div style={{ ...reveal(contentP[0] ?? 1) }}>
          <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>{claim.claim}</div>
          {sub === 'Misinformation' && <div style={{ fontSize: 13.5, marginTop: 4, lineHeight: 1.35 }}>{claim.reason}</div>}
        </div>
        <SideBySide tag={tag} p={contentP[1] ?? 1}
          left={{ head: claim.customer.label, shows: claim.customer.shows, text: claim.customer.text, found: claim.customer.found }}
          right={{ head: claim.file.label, shows: claim.file.shows, text: claim.file.text, found: claim.file.found, note: sub === 'Needs checking' ? claim.note : undefined }} />
      </div>
    ) : null,
    misleading: (
      <div style={{ marginTop: 10, ...reveal(contentP[0] ?? 1) }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 }}><RoleChip>{sixty.rush.billed.label}</RoleChip><span style={small}>{sixty.rush.billed.shows}</span></div>
        <Quote text={sixty.rush.billed.text} /><Found text={sixty.rush.billed.found} />
      </div>
    ),
  };
  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <div style={{ ...small, fontWeight: 600, margin: '8px 0 4px' }}>{a.title}</div>
      {a.rows.map((r: any, i: number) => {
        const isOpen = open === r.key;
        const showQuestion = open === 'none';
        const bias = r.key === 'bias';
        return (
          <div key={r.key} style={{ padding: '10px 0', borderTop: `1px solid ${C.border}`, ...reveal(rowsP[i]) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: isOpen ? 19 : bias ? 18 : 16, fontWeight: 700, textDecoration: bias ? 'underline' : 'none', textDecorationColor: C.accent, textDecorationThickness: bias ? 3 : undefined, textUnderlineOffset: 4 }}>{r.label}</span>
              {chip(r.status)}
            </div>
            {showQuestion && <div style={{ ...small, marginTop: 4 }}>{r.question}</div>}
            {r.key === 'accuracy' && (showQuestion || isOpen) && <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', opacity: tagsP }}>{a.tags.map((t: string) => <span key={t}>{chip(t)}</span>)}</div>}
            {isOpen && content[r.key]}
          </div>
        );
      })}
    </div>
  );
};

// ---- S5: invoice (billed) on the left, agreement (agreed) on the right, then the calculation line by line ----
export const RushCalc: React.FC<{ facts: any; p: number[]; finalHot: number }> = ({ facts, p, finalHot }) => {
  const r = facts.sixty.rush, c = facts.sixty.calc;
  return (
    <div style={{ padding: 16, display: 'grid', gap: 14 }}>
      <SideBySide tag={c.heads.tag} p={p[0]}
        left={{ head: c.heads.left, text: r.billed.text, found: r.billed.found }}
        right={{ head: c.heads.right, text: r.agreed.text, found: r.agreed.found }} />
      <div style={{ display: 'grid', gap: 0 }}>
        {c.lines.map((l: any, i: number) => {
          const last = i === c.lines.length - 1;
          const cut = l.expr.lastIndexOf('= ');
          const [pre, post] = last && cut >= 0 ? [l.expr.slice(0, cut + 2), l.expr.slice(cut + 2)] : [l.expr, ''];
          return (
            <div key={l.label} style={{ display: 'grid', gridTemplateColumns: '104px 1fr', alignItems: 'center', padding: '5px 0', fontSize: 14.5, fontVariantNumeric: 'tabular-nums', fontWeight: last ? 700 : 400, borderTop: last ? `2px solid ${C.foreground}` : 'none', marginTop: last ? 6 : 0, ...reveal(p[i + 1]) }}>
              <span style={{ color: last ? C.foreground : C.muted, fontWeight: 600 }}>{l.label}</span>
              <span>{pre}{post && <span style={{ background: `rgba(43,74,122,${finalHot})`, color: finalHot > 0.5 ? C.accentFg : C.foreground, borderRadius: 3, padding: '0 6px' }}>{post}</span>}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---- S6: the recommended next step: the stamp, its Because line, then the rule ----
export const StampRule: React.FC<{ facts: any; stampP: number; ruleP: number; copyHot: number; seeHot?: number; pressSee?: boolean }> = ({ facts, stampP, ruleP, copyHot, seeHot = 0, pressSee }) => {
  const s = facts.stamp;
  const rule = facts.evidence.approve.rule;
  return (
    <div style={{ padding: '14px 16px', display: 'grid', gap: 12 }}>
      <div style={{ ...small, fontWeight: 600, ...reveal(stampP) }}>{facts.labels.recommended}</div>
      <div style={{ padding: '12px 12px 12px 16px', background: C.surface, borderLeft: `4px solid ${C.accent}`, borderRadius: 4, display: 'grid', gap: 8, ...reveal(stampP) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.muted }}>
          <span style={{ width: 8, height: 8, border: `1.5px solid ${C.muted}`, borderRadius: '50%' }} />{s.label}
        </div>
        <div style={{ fontSize: 14 }}>{s.because}</div>
        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{s.action}</div>
        <div style={{ fontSize: 13.5, color: C.muted }}>{s.ownerDue}</div>
        <div><Btn primary hot={seeHot} pressed={pressSee}>See the path</Btn></div>
      </div>
      <div style={{ display: 'grid', gap: 8, ...reveal(ruleP) }}>
        <Label>Rule</Label>
        <Quote text={rule.quote} size={16} />
        <div style={small}>{rule.ref}</div>
        <div><Btn hot={copyHot} pressed={copyHot > 0.6}>Copy citation</Btn></div>
      </div>
    </div>
  );
};

// ---- S6: the path (the timeline) ----
export const PathView60: React.FC<{ facts: any; p: number[] }> = ({ facts, p }) => {
  const path = facts.path;
  const node = (label: string, i: number, body: React.ReactNode) => (
    <div key={label} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', columnGap: 14, ...reveal(p[i] ?? 1) }}>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 6, top: 0, bottom: -18, width: 2, background: C.border }} />
        <div style={{ position: 'absolute', left: 1, top: 6, width: 12, height: 12, borderRadius: '50%', background: C.accent, border: `2px solid ${C.background}` }} />
      </div>
      <div style={{ paddingBottom: 18 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div>{body}</div>
    </div>
  );
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, marginBottom: 16 }}>Path to resolution</div>
      {node(path.today.label, 0, <div style={small}>{path.today.text}</div>)}
      {path.groups.map((g: any, gi: number) => node(g.label, gi + 1, (
        <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
          {g.steps.map((s: any) => <div key={s.action} style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>{s.action}</div>)}
        </div>
      )))}
      {node(path.outcome.label, path.groups.length + 1, <div style={small}>{path.outcome.text}</div>)}
    </div>
  );
};

// ---- S6, slow: the accounts-team step in four beats, the other steps dimmed, then who to contact ----
export const AccountsFocus: React.FC<{ facts: any; beats: number[]; dim: number; whoP: number; whoHot: number }> = ({ facts, beats, dim, whoP, whoHot }) => {
  const a = facts.sixty.accounts;
  const tag = facts.labels.sourceOfTruth;
  const others = facts.path.groups.flatMap((g: any) => g.steps.filter((s: any) => s.action !== a.action).map((s: any) => `${g.label}  ·  ${s.action}`));
  return (
    <div style={{ padding: 16 }}>
      <div style={{ opacity: 1 - 0.72 * dim, display: 'grid', gap: 4, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Path to resolution</div>
        {others.map((o: string) => <div key={o} style={{ ...small, fontSize: 12 }}>{o}</div>)}
        <div style={{ ...small, fontSize: 12 }}>{facts.path.outcome.label}  ·  {facts.path.outcome.text}</div>
      </div>
      <div style={{ padding: '10px 12px', borderLeft: `4px solid ${C.accent}`, background: C.surface, borderRadius: 4, display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, ...reveal(beats[0]) }}>{a.action}</div>
        <div style={{ display: 'grid', gap: 8, ...reveal(beats[1]) }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{a.because}</div>
          <SideBySide tag={tag} p={1}
            left={{ head: a.customer.label, text: a.customer.text, found: a.customer.found }}
            right={{ head: a.file.label, text: a.file.text, found: a.file.found, note: a.note }} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, ...reveal(beats[2]) }}>{a.owner}  ·  {a.due}</div>
        <div style={{ fontSize: 14, fontWeight: 700, ...reveal(beats[3]) }}>{facts.labels.guidanceNote}</div>
      </div>
      <div style={{ marginTop: 16, ...reveal(whoP) }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Who to contact</div>
        {facts.sixty.who.map((w: any) => (
          <div key={w.owner} style={{ padding: '7px 8px', borderTop: `1px solid ${C.border}`, background: w.hot ? `rgba(43,74,122,${0.1 * whoHot})` : 'transparent', outline: w.hot && whoHot > 0 ? `${2.5 * whoHot}px solid ${C.accent}` : 'none', outlineOffset: -1, borderRadius: 4 }}>
            <span style={{ fontSize: 14.5, fontWeight: 700 }}>{w.owner}</span><span style={{ ...small, marginLeft: 8 }}>({w.role})</span>
          </div>
        ))}
      </div>
    </div>
  );
};
