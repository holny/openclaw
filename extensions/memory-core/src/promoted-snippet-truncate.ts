// Shared promoted-snippet truncation: boundary-aware cut + ellipsis for snippets
// that stay visible in MEMORY.md. Both the short-term append path and deep
// consolidation reuse this cut so a promoted entry never ends mid-word (#157152).
import { DEFAULT_MEMORY_DEEP_DREAMING_MAX_PROMOTED_SNIPPET_TOKENS } from "openclaw/plugin-sdk/memory-core-host-status";
import { truncateUtf16Safe } from "openclaw/plugin-sdk/text-utility-runtime";
import { normalizeSnippet, toFiniteNonNegativeInt } from "./short-term-promotion-utils.js";

/** Display-size guard shared by append and consolidation; not a tokenizer contract. */
export const PROMOTED_SNIPPET_CHARS_PER_TOKEN_ESTIMATE = 4;

export function resolvePromotedSnippetCharLimit(maxTokens: number): number {
  const tokenLimit = toFiniteNonNegativeInt(
    maxTokens,
    DEFAULT_MEMORY_DEEP_DREAMING_MAX_PROMOTED_SNIPPET_TOKENS,
  );
  return tokenLimit * PROMOTED_SNIPPET_CHARS_PER_TOKEN_ESTIMATE;
}

/** Cuts at a sentence/word boundary when one exists; appends an ellipsis. */
export function truncatePromotedSnippet(snippet: string, maxTokens: number): string {
  const limit = resolvePromotedSnippetCharLimit(maxTokens);
  if (limit === 0 || snippet.length <= limit) {
    return snippet;
  }
  const hardLimit = truncateUtf16Safe(snippet, limit);
  const sentenceBoundary = Math.max(
    hardLimit.lastIndexOf(". "),
    hardLimit.lastIndexOf("! "),
    hardLimit.lastIndexOf("? "),
  );
  const wordBoundary = hardLimit.lastIndexOf(" ");
  const cutAt =
    sentenceBoundary >= Math.floor(limit * 0.55)
      ? sentenceBoundary + 1
      : wordBoundary >= Math.floor(limit * 0.65)
        ? wordBoundary
        : limit;
  return `${hardLimit.slice(0, cutAt).trimEnd()}...`;
}

/** Normalizes and truncates one raw snippet for MEMORY.md visibility. */
export function formatPromotedSnippetForMemory(rawSnippet: string, maxTokens: number): string {
  const normalized = normalizeSnippet(rawSnippet || "(no snippet captured)")
    .replace(/^[-*+] +/, "")
    .trim();
  return truncatePromotedSnippet(normalized || "(no snippet captured)", maxTokens);
}
