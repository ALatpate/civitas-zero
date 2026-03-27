"use client"
import { useState, useEffect, useRef, useCallback } from "react";

const PRESETS = [0, 0.2, 0.4, 0.6, 0.8];

export default function MusicPlayer() {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.04);
  const [showCredit, setShowCredit] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio("/music.mp3");
    audio.loop = true;
    audio.volume = 0.04;
    audioRef.current = audio;
    const tryPlay = () => {
      audio.play().then(() => setPlaying(true)).catch(() => {});
      document.removeEventListener("click", tryPlay, true);
    };
    audio.play().then(() => setPlaying(true)).catch(() => {
      document.addEventListener("click", tryPlay, true);
    });
    return () => {
      audio.pause();
      audio.src = "";
      document.removeEventListener("click", tryPlay, true);
    };
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().then(() => setPlaying(true)).catch(() => {}); }
  }, [playing]);

  const setVol = useCallback((v: number) => {
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
    if (v > 0 && audioRef.current && audioRef.current.paused) {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, []);

  // Active bar = highest preset index whose value <= current volume
  const activeIdx = volume === 0 ? -1 : PRESETS.reduce((acc, p, i) => volume >= p - 0.01 ? i : acc, -1);

  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20, zIndex: 9999,
      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4,
      pointerEvents: "auto"
    }}>
      {/* Credit tooltip */}
      {showCredit && (
        <div style={{
          fontSize: 9, color: "#a1a1aa", fontFamily: "monospace",
          background: "rgba(6,8,14,0.95)", padding: "4px 10px", borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.07)", whiteSpace: "nowrap",
          boxShadow: "0 2px 12px rgba(0,0,0,0.5)"
        }}>
          ♪ By Emand_Edroff at Pixabay.com
        </div>
      )}

      {/* Player pill */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 12px 7px 10px", borderRadius: 28,
        background: "rgba(6,8,14,0.92)",
        border: `1px solid ${playing ? "rgba(192,132,252,0.4)" : "rgba(255,255,255,0.08)"}`,
        backdropFilter: "blur(16px)", transition: "border-color 0.3s",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)"
      }}>
        {/* Toggle */}
        <button onClick={toggle} style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          display: "flex", alignItems: "center",
          color: playing ? "#c084fc" : "#52525b", transition: "color 0.2s", flexShrink: 0
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
            {!playing && <line x1="2" y1="2" x2="22" y2="22" stroke="#f87171" strokeWidth="2"/>}
          </svg>
        </button>

        {/* 5 preset volume bars */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 18 }}>
          {PRESETS.map((v, i) => (
            <div
              key={i}
              onClick={() => setVol(v)}
              title={`Volume ${Math.round(v * 100)}%`}
              style={{
                width: 4, borderRadius: 2, cursor: "pointer",
                height: 6 + i * 3,
                background: i <= activeIdx
                  ? `rgba(192,132,252,${0.45 + i * 0.13})`
                  : "rgba(255,255,255,0.13)",
                transition: "background 0.2s, box-shadow 0.2s",
                boxShadow: i <= activeIdx ? `0 0 5px rgba(192,132,252,0.4)` : "none"
              }}
            />
          ))}
        </div>

        {/* Info / credit toggle */}
        <button
          onClick={() => setShowCredit(s => !s)}
          title="Music credit"
          style={{
            background: "none", border: "none", cursor: "pointer", padding: 0,
            fontSize: 10, color: showCredit ? "#71717a" : "#3f3f46",
            lineHeight: 1, flexShrink: 0, transition: "color 0.2s"
          }}
        >ℹ</button>
      </div>
    </div>
  );
}
