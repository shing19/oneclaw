/**
 * Log sanitizer — masks sensitive patterns before displaying logs in the UI.
 *
 * Defensive measure to prevent accidental exposure of API keys, tokens,
 * or other credentials that might appear in kernel log messages.
 */

/** Patterns that match known secret/credential formats. */
const SENSITIVE_PATTERNS: readonly { pattern: RegExp; replacement: string }[] = [
  // API keys: sk-xxx, key-xxx (common LLM provider formats)
  { pattern: /\b(sk-)[a-zA-Z0-9]{10,}\b/g, replacement: "$1****" },
  { pattern: /\b(key-)[a-zA-Z0-9]{10,}\b/g, replacement: "$1****" },

  // Bearer tokens in header-like strings
  { pattern: /(Bearer\s+)[^\s"']+/gi, replacement: "$1****" },

  // Generic API key patterns in key=value or key: value context
  { pattern: /(api[_-]?key|api[_-]?secret|access[_-]?token|secret[_-]?key|app[_-]?secret|webhook[_-]?token)\s*[:=]\s*["']?[^\s"',}]+["']?/gi, replacement: "$1=****" },

  // Authorization header values
  { pattern: /(Authorization:\s*)[^\s\r\n]+/gi, replacement: "$1****" },
];

/**
 * Sanitize a log entry by masking known secret patterns.
 *
 * This is a defensive layer — the sidecar should never emit secrets in logs,
 * but this ensures they are masked even if an upstream component leaks them.
 */
export function sanitizeLogEntry(entry: string): string {
  let result = entry;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}
