import { config } from './config';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

const SYSTEM_PROMPT =
  'You summarize YouTube video transcripts. Start with a one-line TL;DR, then 5-8 concise bullet points covering the key ideas, facts, and takeaways. Be direct and skip filler. If the transcript is fragmentary, summarize what is there.';

export const summarizeWithHostedKey = async (
  title: string,
  transcript: string,
): Promise<string> => {
  const body = JSON.stringify({
    model: config.llmModel,
    temperature: 0.3,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Video title: ${title}\n\nTranscript:\n${transcript}` },
    ],
  });

  let lastError = new Error('request failed');
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${config.llmEndpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.llmApiKey}`,
        },
        body,
      });
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep((RETRY_DELAYS_MS[attempt] ?? 1000) + Math.random() * 500);
        continue;
      }
      throw lastError;
    }
    if (res.status === 429 || res.status >= 500) {
      await res.text().catch(() => '');
      lastError = new Error(`upstream HTTP ${res.status}`);
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep((RETRY_DELAYS_MS[attempt] ?? 1000) + Math.random() * 500);
        continue;
      }
      throw new Error('The summarization service is busy. Try again in a bit.');
    }
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`upstream HTTP ${res.status}: ${errBody.slice(0, 160)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('empty response from model');
    return content;
  }
  throw lastError;
};
