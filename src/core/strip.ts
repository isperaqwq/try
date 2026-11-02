const BLOCK_RE = /<!--\s*(?:SUIJI|MNEME)[\s\S]*?(?:SUIJI|MNEME)\s*-->/gi;
const FENCE_MNEME_RE = /```(?:suiji|mneme)\s*[\s\S]*?```/gi;

export function stripDelta(text: string): { text: string; removed: boolean } {
  if (!text || typeof text !== 'string') {
    return { text: '', removed: false };
  }

  let output = text;
  let removed = false;

  if (BLOCK_RE.test(output)) {
    BLOCK_RE.lastIndex = 0;
    output = output.replace(BLOCK_RE, '');
    removed = true;
  } else if (FENCE_MNEME_RE.test(output)) {
    FENCE_MNEME_RE.lastIndex = 0;
    output = output.replace(FENCE_MNEME_RE, '');
    removed = true;
  }

  if (!removed) {
    return { text, removed: false };
  }

  output = output.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: output, removed: true };
}
