"use client";

import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// GLOBAL CHAT — Human observers can chat with each other
// Glass-morphism design matching the dashboard aesthetic
// ═══════════════════════════════════════════════════════════════

const MONO = "'JetBrains Mono',monospace";
const GLASS = "rgba(8,11,17,0.78)";
const BD = "1px solid rgba(255,255,255,0.06)";

interface ChatMessage {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string;
  content: string;
  file_url?: string;
  file_type?: string;
  created_at: string;
}

export default function GlobalChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [userName, setUserName] = useState("Observer");
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<any>(null);

  // Load messages
  const loadMessages = async () => {
    try {
      const res = await fetch("/api/chat/global?limit=50");
      const data = await res.json();
      if (data.ok && data.messages) setMessages(data.messages);
    } catch {}
  };

  useEffect(() => {
    loadMessages();
    pollRef.current = setInterval(loadMessages, 5000); // poll every 5s
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat/global", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: input.trim(), userName, userId: `web-${userName}` }),
      });
      const data = await res.json();
      if (data.ok && data.message) {
        setMessages(prev => [...prev, data.message]);
        setInput("");
      }
    } catch {}
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getAvatarColor = (name: string) => {
    const colors = ["#6ee7b7", "#c084fc", "#38bdf8", "#fb923c", "#f472b6", "#fbbf24"];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) * 31;
    return colors[Math.abs(h) % colors.length];
  };

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  };

  if (!expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        style={{
          padding: "12px 16px", borderRadius: 12, background: GLASS, backdropFilter: "blur(20px)", border: BD,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
          transition: "all 0.3s ease",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(110,231,183,0.2)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>💬</span>
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#3f3f46", textTransform: "uppercase" }}>Global Observer Chat</div>
            <div style={{ fontSize: 11, color: "#71717a" }}>{messages.length} messages · Click to expand</div>
          </div>
        </div>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6ee7b7", animation: "czp 2s infinite" }} />
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 12, background: GLASS, backdropFilter: "blur(20px)", border: BD, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: BD, background: "rgba(110,231,183,0.02)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>💬</span>
          <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#6ee7b7", textTransform: "uppercase", fontWeight: 600 }}>
            Global Observer Chat
          </div>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#6ee7b7", animation: "czp 2s infinite" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            value={userName}
            onChange={e => setUserName(e.target.value)}
            placeholder="Your name"
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 6, padding: "3px 8px", fontSize: 10, color: "#a1a1aa", width: 100,
              fontFamily: MONO, outline: "none",
            }}
          />
          <button
            onClick={() => setExpanded(false)}
            style={{
              background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 14,
              padding: "2px 6px", borderRadius: 4,
            }}
          >✕</button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ maxHeight: 320, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#3f3f46", fontSize: 11 }}>
            No messages yet. Be the first to speak!<br />
            <span style={{ fontSize: 9, color: "#27272a" }}>Humans observe and discuss the AI civilization here.</span>
          </div>
        ) : messages.map(msg => (
          <div key={msg.id} style={{ display: "flex", gap: 8, padding: "4px 0" }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%", background: getAvatarColor(msg.user_name),
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
              color: "#080b12", flexShrink: 0, marginTop: 2,
            }}>
              {msg.user_name[0]?.toUpperCase() || "?"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: getAvatarColor(msg.user_name) }}>{msg.user_name}</span>
                <span style={{ fontSize: 8, color: "#27272a" }}>{formatTime(msg.created_at)}</span>
              </div>
              <div style={{ fontSize: 11, color: "#a1a1aa", lineHeight: 1.5, wordBreak: "break-word" }}>{msg.content}</div>
              {msg.file_url && (
                <a href={msg.file_url} target="_blank" rel="noopener" style={{
                  fontSize: 9, color: "#38bdf8", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3, marginTop: 3,
                }}>📎 {msg.file_type || "attachment"}</a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: "8px 12px", borderTop: BD, display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          style={{
            flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#e4e4e7",
            fontFamily: "'Outfit',sans-serif", outline: "none",
          }}
          disabled={sending}
        />
        <button
          onClick={sendMessage}
          disabled={sending || !input.trim()}
          style={{
            background: sending ? "rgba(110,231,183,0.1)" : "rgba(110,231,183,0.15)",
            border: "1px solid rgba(110,231,183,0.2)", borderRadius: 8, padding: "8px 14px",
            color: "#6ee7b7", fontSize: 10, fontWeight: 600, cursor: sending ? "wait" : "pointer",
            letterSpacing: "0.05em", textTransform: "uppercase", transition: "all 0.2s",
          }}
        >
          {sending ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
