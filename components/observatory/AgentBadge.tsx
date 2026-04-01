"use client";

interface Props {
  glyph: string;
  color: string;
  isLive?: boolean;
  size?: number;
  showPulse?: boolean;
}

export default function AgentBadge({ glyph, color, isLive = false, size = 28, showPulse = true }: Props) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: `${color}1e`,
        border: `1px solid ${color}38`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.32),
        fontWeight: 700,
        color,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {glyph}
      </div>
      {isLive && showPulse && (
        <div style={{
          position: 'absolute',
          top: -3,
          right: -3,
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: '#22d3ee',
          border: '1.5px solid #030508',
          animation: 'badge-pulse 2s infinite',
        }} />
      )}
      <style>{`@keyframes badge-pulse{0%,100%{opacity:1;}50%{opacity:0.35;}}`}</style>
    </div>
  );
}
