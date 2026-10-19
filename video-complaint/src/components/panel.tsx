import React from 'react';
import { C } from '../theme';
import { lerp, prog } from '../lib';
import { Logo } from './ui';

// The side panel, drawn at 420 px wide. Layouts follow the current panel (Review, result Level 1, evidence, path).
export const PANEL_W = 420;
const small = { fontSize: 12.5, color: C.muted } as const;

export const PanelHeader: React.FC = () => (
  <div style={{ width: PANEL_W, height: 48, boxSizing: 'border-box', background: C.background, borderLeft: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: `1px solid ${C.border}` }}>
    <Logo size={24} />
    <span style={{ fontSize: 14, fontWeight: 700, marginRight: 'auto' }}>TrustLens <span style={{ fontWeight: 400, color: C.muted }}>Lite</span></span>
    <span style={{ fontSize: 12, fontWeight: 600, color: C.accent, border: `1px dashed ${C.accent}`, borderRadius: 4, padding: '0 8px' }}>Demo mode</span>
  </div>
);

// The body scrolls; the header (see PanelHeader) stays fixed, as in the real side panel. The 48 px spacer keeps design coordinates the same.
export const PanelFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ width: PANEL_W, minHeight: 1300, background: C.background, borderLeft: `1px solid ${C.border}`, boxSizing: 'border-box' }}>
    <div style={{ height: 48 }} />
    {children}
  </div>
);

const Btn: React.FC<{ primary?: boolean; hot?: number; pressed?: boolean; children: React.ReactNode }> = ({ primary, hot = 0, pressed, children }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 16px', borderRadius: 4, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap',
    background: primary ? C.accent : 'transparent', color: primary ? C.accentFg : C.foreground, border: `1px solid ${primary ? C.accent : C.muted}`,
    outline: hot ? `${3 * hot}px solid ${C.accent}` : 'none', outlineOffset: 3, transform: `scale(${pressed ? 0.96 : 1})` }}>{children}</span>
);

export const RoleChip: React.FC<{ children: React.ReactNode; flag?: boolean }> = ({ children, flag }) => (
  <span style={{ flex: 'none', padding: '0 8px', border: `1px solid ${flag ? C.check : C.accent}`, background: flag ? C.checkBg : 'transparent', color: flag ? C.check : C.accent, borderRadius: 4, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</span>
);

// ---------- S2: "Use this email", then one row per file ----------
export const GmailStart: React.FC<{ pressed: boolean }> = ({ pressed }) => (
  <div style={{ padding: '24px 16px', display: 'grid', gap: 8, justifyItems: 'start' }}>
    <div style={{ fontSize: 22, fontWeight: 700 }}>Nothing checked yet</div>
    <p style={{ margin: 0, fontSize: 14 }}>A Gmail message is open?</p>
    <Btn primary pressed={pressed}>Use this email</Btn>
    <p style={{ margin: 0, ...small }}>Nothing is read until you press the button.</p>
  </div>
);

export const ReviewView: React.FC<{ facts: any; rowsP: number; summaryP: number; discP: number; runHot: number; pressRun?: boolean }> = ({ facts, rowsP, summaryP, discP, runHot, pressRun }) => {
  const m = facts.masked;
  return (
    <div style={{ padding: '0 16px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, padding: '16px 0 8px' }}>Review before AI</div>
      <div>
        {facts.files.map((f: any, i: number) => {
          const p = prog(rowsP * 3, i, i + 1);
          return (
            <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, borderBottom: `1px solid ${C.border}`, opacity: p, transform: `translateY(${(1 - p) * 6}px)` }}>
              <RoleChip>{f.label}</RoleChip>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              {f.role === 'invoice' && <RoleChip flag>{facts.provenance.chip}</RoleChip>}
              <span style={{ ...small, whiteSpace: 'nowrap' }}>Read</span>
            </div>
          );
        })}
      </div>
      <div style={{ opacity: prog(rowsP, 0.8, 1) }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 10 }}>{facts.filesRead}</div>
      </div>
      <div style={{ opacity: summaryP }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{m.total}</div>
        <div style={{ ...small, marginTop: 4 }}>{m.perType}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, minHeight: 32, marginTop: 8 }}>
          <span style={{ display: 'inline-block', transform: `rotate(${discP * 90}deg)`, width: 14 }}>▸</span>Show what the AI will see
        </div>
        <div style={{ height: discP * 150, overflow: 'hidden', border: discP > 0.02 ? `1px solid ${C.muted}` : 'none', borderRadius: 4, opacity: discP }}>
          <div style={{ padding: 8, fontSize: 12.5, lineHeight: 1.5 }}>
            {m.excerpt.map((t: string, i: number) => <p key={i} style={{ margin: '0 0 6px' }}>{t.split(/(\[[A-Z]+\])/).map((part, j) => (j % 2 ? <span key={j} style={{ background: C.foreground, color: C.background, padding: '0 4px', borderRadius: 2, fontWeight: 700 }}>{part}</span> : part))}</p>)}
          </div>
        </div>
        <p style={{ margin: '8px 0 0', ...small }}>Names are not masked locally. Demo data only.</p>
        <p style={{ margin: '2px 0 0', ...small }}>Demo mode: no call is made.</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', marginTop: 10, borderTop: `1px solid ${C.border}`, opacity: summaryP }}>
        <Btn primary hot={runHot} pressed={pressRun}>Run AI</Btn><span style={{ fontSize: 12.5, fontWeight: 600, color: C.accent, textDecoration: 'underline' }}>Cancel</span>
      </div>
    </div>
  );
};

// ---------- S4: the four steps tick ----------
export const ReadingView: React.FC<{ facts: any; ticks: number }> = ({ facts, ticks }) => (
  <div style={{ padding: '24px 16px' }}>
    <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Running AI</div>
    <div style={{ display: 'grid', gap: 12 }}>
      {facts.reading.map((label: string, i: number) => {
        const done = ticks > i + 0.999, now = ticks > i && !done;
        return <div key={label} style={{ display: 'flex', gap: 10, fontSize: 15, fontWeight: now ? 700 : 400, color: ticks >= i ? C.foreground : C.muted }}><span style={{ width: 18, fontWeight: 700, color: C.accent }}>{done ? '✓' : now ? '…' : ''}</span>{label}</div>;
      })}
    </div>
  </div>
);

// ---------- S5, S6, S8: the result, Level 1, with optional evidence ----------
export const ResultView: React.FC<{ footer?: string; facts: any; stampP: number; alsoP: number[]; collapsedP: number; evidenceP?: number; sheetP?: number; provP?: number; chipHot?: number; pressSee?: boolean }> = ({ footer, facts, stampP, alsoP, collapsedP, evidenceP = 0, sheetP = 0, provP = 0, chipHot = 0, pressSee }) => {
  const s = facts.stamp;
  const a = facts.accuracy;
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', opacity: prog(stampP, 0, 0.5) }}>
        {facts.files.map((f: any) => <RoleChip key={f.name}>{f.label}</RoleChip>)}
        <span style={{ padding: '0 8px', border: `1px solid ${C.check}`, background: C.checkBg, color: C.check, borderRadius: 4, fontSize: 12.5, fontWeight: 600, outline: chipHot ? `${3 * chipHot}px solid ${C.accent}` : 'none', outlineOffset: 3 }}>{facts.provenance.chip}</span>
      </div>
      <div style={{ margin: '4px 16px 16px', padding: '12px 12px 12px 16px', background: C.surface, borderLeft: `4px solid ${C.accent}`, borderRadius: 4, display: 'grid', gap: 8, opacity: stampP, transform: `translateY(${(1 - stampP) * 14}px)` }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.muted }}>
            <span style={{ width: 8, height: 8, border: `1.5px solid ${C.muted}`, borderRadius: '50%' }} />{s.label}
          </div>
          <div style={{ fontSize: 14, marginTop: 2 }}>{s.because}</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{s.action}</div>
        <div style={{ fontSize: 12.5, color: C.muted }}>{s.ownerDue}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Btn primary pressed={pressSee}>See the path</Btn>
          <span style={{ marginLeft: 'auto', width: 36, height: 36, border: `1px solid ${C.muted}`, borderRadius: 4, display: 'grid', placeItems: 'center', fontWeight: 700 }}>···</span>
        </div>
        {evidenceP > 0 && (
          <div style={{ height: evidenceP * 215, overflow: 'hidden', opacity: evidenceP, borderTop: `1px dashed ${C.border}`, paddingTop: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
              <thead><tr>{['Item', 'Agreed', 'Billed', 'Difference'].map((t, i) => <th key={t} style={{ textAlign: i ? 'right' : 'left', fontWeight: 600, color: C.muted, padding: '2px 4px', borderBottom: `1px solid ${C.border}` }}>{t}</th>)}</tr></thead>
              <tbody>
                {a.rows.map((r: any) => (
                  <React.Fragment key={r.item}>
                    <tr><td style={{ padding: 4 }}>{r.item}</td><td style={{ padding: 4, textAlign: 'right' }}>{r.agreed}</td><td style={{ padding: 4, textAlign: 'right' }}>{r.billed}</td><td style={{ padding: 4, textAlign: 'right', fontWeight: 700 }}>{r.diff}</td></tr>
                    <tr><td colSpan={4} style={{ padding: '0 4px 6px', fontStyle: 'italic', color: C.muted, borderBottom: `1px solid ${C.border}` }}>“{r.quote}”</td></tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            <div style={{ textAlign: 'center', margin: '6px 0', fontSize: 12.5, fontWeight: 600, color: C.accent, textDecoration: 'underline' }}>{a.moreLabel}</div>
            <div style={{ fontSize: 12.5 }}>{a.claimsSummary} <span style={{ fontWeight: 600, color: C.accent, textDecoration: 'underline' }}>See claims</span></div>
            <div style={{ marginTop: 6 }}><span style={{ fontSize: 12.5, fontWeight: 600, color: C.accent, textDecoration: 'underline', outline: sheetP > 0 ? `2px solid ${C.accent}` : 'none', outlineOffset: 3 }}>{facts.clause.chip}</span></div>
          </div>
        )}
      </div>
      <div style={{ padding: '0 16px' }}>
        <div style={{ ...small, fontWeight: 600, marginBottom: 4, opacity: prog(alsoP[0], 0, 1) }}>Also needed</div>
        {facts.also.map((r: any, i: number) => (
          <div key={r.action} style={{ display: 'grid', gridTemplateColumns: '1fr auto', columnGap: 16, padding: '10px 0', borderTop: `1px solid ${C.border}`, opacity: alsoP[i], transform: `translateY(${(1 - alsoP[i]) * 12}px)` }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25 }}>{r.action}</div>
              <div style={{ ...small, textDecoration: i < 2 ? 'underline' : 'none', textUnderlineOffset: 3 }}>{r.because}</div>
              <div style={small}>{r.owner}</div>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.due}</div>
          </div>
        ))}
        <div style={{ ...small, borderTop: `1px solid ${C.border}`, padding: '8px 0', opacity: collapsedP }}>{facts.collapsed}</div>
        {footer && <div style={{ ...small, borderTop: `1px solid ${C.border}`, padding: '8px 0', opacity: collapsedP }}>{footer}</div>}
      </div>
      {sheetP > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 0 }} />
      )}
    </div>
  );
};

// the clause sheet is drawn on the panel's lower edge
export const ClauseSheet: React.FC<{ facts: any; p: number; copyHot: number }> = ({ facts, p, copyHot }) => {
  const c = facts.clause;
  return (
    <div style={{ position: 'absolute', left: 0, width: PANEL_W, top: 350, background: C.background, borderTop: `1px solid ${C.muted}`, borderRadius: '4px 4px 0 0', boxShadow: '0 -8px 24px rgba(30,35,33,0.16)', padding: 16, opacity: p, transform: `translateY(${(1 - p) * 40}px)`, boxSizing: 'border-box' }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Policy clause</div>
      <div style={{ ...small, fontWeight: 600, marginBottom: 4 }}>{c.document} v{c.version}, s{c.section}</div>
      <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.muted}`, fontStyle: 'italic', fontSize: 14 }}>{c.quote}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}><Btn hot={copyHot}>Copy citation</Btn><Btn primary>Close</Btn></div>
    </div>
  );
};

// ---------- S7: the path ----------
export const PathView: React.FC<{ facts: any; p: number[]; tueHot: number }> = ({ facts, p, tueHot }) => {
  const path = facts.path;
  const node = (label: string, i: number, body: React.ReactNode, hot = 0) => (
    <div key={label} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', columnGap: 14, opacity: p[i], transform: `translateY(${(1 - p[i]) * 12}px)` }}>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 6, top: 0, bottom: -18, width: 2, background: C.border }} />
        <div style={{ position: 'absolute', left: 1, top: 6, width: 12, height: 12, borderRadius: '50%', background: C.accent, border: `2px solid ${C.background}` }} />
      </div>
      <div style={{ paddingBottom: 18, outline: hot ? `${2 * hot}px solid ${C.accent}` : 'none', outlineOffset: 6, borderRadius: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div>{body}
      </div>
    </div>
  );
  return (
    <div style={{ padding: '16px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, marginBottom: 16 }}>Path to resolution</div>
      {node(path.today.label, 0, <div style={small}>{path.today.text}</div>)}
      {path.groups.map((g: any, gi: number) => node(g.label, gi + 1, (
        <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
          {g.steps.map((s: any) => <div key={s.action}><div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25 }}>{s.action}</div><div style={small}>{s.because}</div><div style={small}>{s.owner}</div></div>)}
        </div>
      ), gi === 0 ? tueHot : 0))}
      {node(path.outcome.label, path.groups.length + 1, <div style={small}>{path.outcome.text}</div>)}
    </div>
  );
};

// ---------- S8: the invoice's file details ----------
export const ProvenanceView: React.FC<{ facts: any; p: number }> = ({ facts, p }) => {
  const pv = facts.provenance;
  return (
    <div style={{ padding: '12px 16px', opacity: p, transform: `translateY(${(1 - p) * 10}px)` }}>
      <div style={{ ...small, fontWeight: 600, marginBottom: 6 }}>File details</div>
      <div style={{ padding: 12, background: C.surface, borderLeft: `4px solid ${C.accent}`, borderRadius: 4, display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{pv.file} <span style={{ fontSize: 12.5, color: C.accent }}>Demo metadata</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 16, rowGap: 2, fontSize: 14 }}>
          {pv.rows.flatMap(([k, v]: string[]) => [<span key={k} style={{ ...small, fontWeight: 600 }}>{k}</span>, <span key={k + v}>{v}</span>])}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{pv.summary}</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>{pv.signals.map((s: any) => <li key={s.id}><b>{s.id}</b> {s.label}</li>)}</ul>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{pv.hedge}</div>
      </div>
    </div>
  );
};
export { lerp };

export const ChipsRow: React.FC<{ facts: any; hot?: number; opacity?: number }> = ({ facts, hot = 0, opacity = 1 }) => (
  <div style={{ display: 'flex', gap: 8, padding: '8px 16px', opacity }}>
    {facts.files.map((f: any) => <RoleChip key={f.name}>{f.label}</RoleChip>)}
    <span style={{ padding: '0 8px', border: `1px solid ${C.check}`, background: C.checkBg, color: C.check, borderRadius: 4, fontSize: 12.5, fontWeight: 600, outline: hot ? `${3 * hot}px solid ${C.accent}` : 'none', outlineOffset: 3 }}>{facts.provenance.chip}</span>
  </div>
);

// ---------- evidence for one step (the path view's step block): Because, Evidence from the files, then the Rule ----------
const Quote: React.FC<{ text: string; size?: number }> = ({ text, size = 14 }) => (
  <div style={{ paddingLeft: 12, borderLeft: `2px solid ${C.muted}`, fontStyle: 'italic', fontSize: size, lineHeight: 1.3 }}>{text}</div>
);
const Found: React.FC<{ text: string }> = ({ text }) => <div style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, marginTop: 4 }}>✓ {text}</div>;
const reveal = (p: number) => ({ opacity: p, transform: `translateY(${(1 - p) * 12}px)` });

export const EvidenceView: React.FC<{ ev: any; itemsP: number[]; ruleP: number; copyHot?: number; copied?: boolean }> = ({ ev, itemsP, ruleP, copyHot = 0, copied }) => {
  const blocks: React.ReactNode[] = [];
  if (ev.sbs) {
    blocks.push(
      <div key="sbs" style={reveal(itemsP[0])}>
        <div style={{ ...small, fontWeight: 600, marginBottom: 6 }}>Agreed vs billed</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[['Agreement', ev.sbs.agreed], ['Invoice', ev.sbs.billed]].map(([title, it]: any) => (
            <div key={title}><RoleChip>{title}</RoleChip><div style={{ marginTop: 6 }}><Quote text={it.text} /></div><Found text={it.found} /></div>
          ))}
        </div>
      </div>,
      <div key="amt" style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', ...reveal(itemsP[1]) }}>{ev.amounts}</div>,
    );
  } else {
    ev.items.forEach((it: any, i: number) => blocks.push(
      <div key={it.text} style={reveal(itemsP[i])}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 }}><RoleChip>{it.label}</RoleChip><span style={small}>{it.shows}</span></div>
        <Quote text={it.text} /><Found text={it.found} />
      </div>));
  }
  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{ev.due}</div>
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{ev.action}</div>
        <div style={small}>{ev.owner}</div>
        <div style={small}>{ev.because}</div>
      </div>
      <div style={{ ...small, fontWeight: 600 }}>Evidence</div>
      {blocks}
      <div style={{ display: 'grid', gap: 6, ...reveal(ruleP) }}>
        <div style={{ ...small, fontWeight: 600 }}>Rule</div>
        <Quote text={ev.rule.quote} />
        <div style={small}>{ev.rule.ref}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Btn hot={copyHot} pressed={copyHot > 0.6}>Copy citation</Btn>{copied && <span style={{ ...small, fontWeight: 600 }}>Copied</span>}</div>
        {ev.rule.others.length > 0 && <div style={{ display: 'flex', gap: 10 }}>{ev.rule.others.map((o: string) => <span key={o} style={{ fontSize: 12.5, fontWeight: 600, color: C.accent, textDecoration: 'underline' }}>{o}</span>)}</div>}
      </div>
    </div>
  );
};
