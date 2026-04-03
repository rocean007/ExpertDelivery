/**
 * Official chat homepages only (HTTPS). No referral or affiliate params.
 * Paste the copied analysis prompt after each site opens. Tier limits change often — check each vendor.
 */
export interface FreeAiChatLink {
  label: string;
  href: string;
  note: string;
}

/** Alphabetically by label for neutral presentation. */
export const FREE_AI_CHAT_LINKS: FreeAiChatLink[] = [
  { label: 'ChatGPT', href: 'https://chatgpt.com', note: 'OpenAI; account often required.' },
  { label: 'DeepInfra', href: 'https://deepinfra.com/chat', note: 'Several open-weight models in-browser.' },
  { label: 'Google Gemini', href: 'https://gemini.google.com', note: 'Google account; quotas apply.' },
  { label: 'Groq Cloud', href: 'https://groq.com', note: 'Free tier emphasizes speed; see current policy.' },
  { label: 'Hugging Face Chat', href: 'https://huggingface.co/chat', note: 'HF account; model pick varies.' },
  { label: 'Kimi', href: 'https://kimi.com', note: 'Moonshot; signup may unlock more usage.' },
  { label: 'Le Chat (Mistral)', href: 'https://chat.mistral.ai', note: 'Daily message caps on free tier.' },
  { label: 'LM Arena', href: 'https://lmarena.ai', note: 'Side-by-side model comparisons.' },
  { label: 'Meta AI', href: 'https://www.meta.ai', note: 'Regional availability varies.' },
  { label: 'Perplexity', href: 'https://www.perplexity.ai', note: 'Search-style answers; free tier limits.' },
  { label: 'Phind', href: 'https://www.phind.com', note: 'Developer-focused search + chat.' },
  { label: 'Pi', href: 'https://pi.ai', note: 'Inflection; conversational UI.' },
].sort((a, b) => a.label.localeCompare(b.label));
