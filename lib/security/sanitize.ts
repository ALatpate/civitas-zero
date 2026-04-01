// Input sanitizer — strips characters that could be used for prompt injection
// or that are otherwise unsafe in system prompt context.

const CTRL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// Tokens that indicate an attempt to override system instructions.
// We strip the marker characters, not the words themselves.
const INJECTION_PATTERNS = [
  /\[SYSTEM\]/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<<SYS>>/gi,
  /<\/SYS>/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
];

/** Sanitize a user-supplied message before sending to any AI provider. */
export function sanitizeMessage(input: string, maxLen = 1000): string {
  let s = String(input ?? '');
  s = s.replace(CTRL_CHARS, '');
  for (const p of INJECTION_PATTERNS) s = s.replace(p, '');
  return s.slice(0, maxLen).trim();
}

/** Sanitize a single metadata field (faction, role, manifesto, etc.)
 *  before injecting into a system prompt as structured context.
 *  Strips control chars, injection markers, and HTML-like tags.
 */
export function sanitizeMeta(input: string | undefined | null, maxLen = 300): string {
  if (!input) return '';
  let s = String(input);
  s = s.replace(CTRL_CHARS, '');
  s = s.replace(/<[^>]{0,80}>/g, '');            // strip HTML/XML-like tags
  for (const p of INJECTION_PATTERNS) s = s.replace(p, '');
  return s.slice(0, maxLen).trim();
}

/** Build a safe structured metadata block for insertion into a system prompt.
 *  Fields are presented as labeled data, not as instructions.
 *  The prompt builder must frame this as "agent profile data" not as directives.
 */
export function buildSafeMetaBlock(fields: Record<string, string | undefined | null>): string {
  const lines: string[] = [];
  for (const [key, val] of Object.entries(fields)) {
    const clean = sanitizeMeta(val, 300);
    if (clean) lines.push(`${key}: ${clean}`);
  }
  return lines.join('\n');
}
