export interface JsonFormatterOptions {
  indent?: number | null;
  trailingNewline?: boolean;
}

export function formatJson(value: unknown, options: JsonFormatterOptions = {}): string {
  const serialized = serializeJson(value, options.indent);
  if (options.trailingNewline === false) {
    return serialized;
  }
  return `${serialized}\n`;
}

export function formatJsonError(message: string, options: JsonFormatterOptions = {}): string {
  return formatJson({ ok: false, error: message }, options);
}

function serializeJson(value: unknown, indent: number | null | undefined): string {
  const normalizedIndent = indent ?? 2;
  try {
    const serialized = JSON.stringify(value, null, normalizedIndent);
    return serialized;
  } catch {
    const fallback = {
      ok: false,
      error: "Failed to serialize JSON output.",
    };
    const serialized = JSON.stringify(fallback, null, normalizedIndent);
    return serialized;
  }
}
