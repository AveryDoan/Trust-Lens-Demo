import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';
import { prog, window_ } from '../lib';
import type { CalloutCfg } from '../script';

// A label and an arrow to the element it names. `target` is in screen coordinates (already mapped by the caller).
export const Callout: React.FC<{ cfg: CalloutCfg; target: { x: number; y: number } }> = ({ cfg, target }) => {
  const f = useCurrentFrame();
  const o = window_(f, cfg.from, cfg.to, 6);
  if (o <= 0) return null;
  const h = 70;
  const sx = cfg.labelAt.x + cfg.width;
  const sy = cfg.labelAt.y + h / 2;
  const len = Math.hypot(target.x - sx, target.y - sy);
  const draw = prog(f, cfg.from + 2, cfg.from + 12);
  const ang = Math.atan2(target.y - sy, target.x - sx);
  const ex = sx + (target.x - sx) * draw;
  const ey = sy + (target.y - sy) * draw;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o }}>
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={C.accent} strokeWidth="5" strokeLinecap="round" />
        {draw > 0.95 && len > 20 && (
          <polygon points="0,0 -24,-11 -24,11" fill={C.accent} transform={`translate(${target.x} ${target.y}) rotate(${(ang * 180) / Math.PI})`} />
        )}
      </svg>
      <div style={{ position: 'absolute', left: cfg.labelAt.x, top: cfg.labelAt.y, width: cfg.width, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.accent, color: C.accentFg, borderRadius: 4, fontFamily: FONT, fontSize: 44, fontWeight: 700 }}>
        {cfg.label}
      </div>
    </div>
  );
};
