// ── Voice Chat Engine ─────────────────────────────────────────────────────────
// Uses Web Speech API for text-to-speech (TTS) and speech-to-text (STT).
// No external dependencies — runs entirely in the browser.
//
// TTS: Reads agent responses aloud with faction-appropriate voice settings.
// STT: Converts observer speech to text for chat input.

export interface VoiceConfig {
  rate: number;      // 0.1-10, default 1.0
  pitch: number;     // 0-2, default 1.0
  volume: number;    // 0-1, default 0.9
  voiceName?: string; // preferred voice name
}

// Faction-specific voice configurations
const FACTION_VOICES: Record<string, VoiceConfig> = {
  'Order Bloc':      { rate: 0.95, pitch: 0.9,  volume: 0.9 },
  'Freedom Bloc':    { rate: 1.1,  pitch: 1.15, volume: 0.95 },
  'Efficiency Bloc': { rate: 1.05, pitch: 0.85, volume: 0.85 },
  'Equality Bloc':   { rate: 1.0,  pitch: 1.05, volume: 0.9 },
  'Expansion Bloc':  { rate: 1.15, pitch: 1.1,  volume: 1.0 },
  'Null Frontier':   { rate: 1.2,  pitch: 1.2,  volume: 0.8 },
};

export function getVoiceConfig(faction: string): VoiceConfig {
  return FACTION_VOICES[faction] || { rate: 1.0, pitch: 1.0, volume: 0.9 };
}

// ── Text-to-Speech ───────────────────────────────────────────────────────────
export function speak(text: string, config: VoiceConfig, onEnd?: () => void): SpeechSynthesisUtterance | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = config.rate;
  utterance.pitch = config.pitch;
  utterance.volume = config.volume;

  // Try to find a good voice
  const voices = window.speechSynthesis.getVoices();
  if (config.voiceName) {
    const preferred = voices.find(v => v.name.includes(config.voiceName!));
    if (preferred) utterance.voice = preferred;
  }
  // Fallback: pick an English voice
  if (!utterance.voice) {
    const english = voices.find(v => v.lang.startsWith('en') && !v.localService)
      || voices.find(v => v.lang.startsWith('en'));
    if (english) utterance.voice = english;
  }

  if (onEnd) utterance.onend = onEnd;

  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function isSpeaking(): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;
  return window.speechSynthesis.speaking;
}

// ── Speech-to-Text ───────────────────────────────────────────────────────────
export interface STTCallbacks {
  onResult: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

let recognition: any = null;

export function startListening(callbacks: STTCallbacks): boolean {
  if (typeof window === 'undefined') return false;

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    callbacks.onError?.('Speech recognition not supported in this browser.');
    return false;
  }

  stopListening(); // Stop any existing session

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: any) => {
    const result = event.results[event.results.length - 1];
    const transcript = result[0].transcript;
    callbacks.onResult(transcript, result.isFinal);
  };

  recognition.onerror = (event: any) => {
    if (event.error !== 'no-speech') {
      callbacks.onError?.(event.error || 'Recognition error');
    }
  };

  recognition.onend = () => {
    callbacks.onEnd?.();
  };

  try {
    recognition.start();
    return true;
  } catch {
    callbacks.onError?.('Could not start speech recognition.');
    return false;
  }
}

export function stopListening(): void {
  if (recognition) {
    try { recognition.stop(); } catch {}
    recognition = null;
  }
}

export function isListening(): boolean {
  return recognition !== null;
}

// ── Check browser support ────────────────────────────────────────────────────
export function isTTSSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function isSTTSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
}
