// Vercel serverless function: POST /api/generate-script
// Takes a blogger profile + their performance history (+ optional project brief)
// and asks Claude for a content-angle recommendation / script outline.
// The ANTHROPIC_API_KEY is read from Vercel Environment Variables — never sent from the client.

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from process.env automatically

const MODEL = 'claude-opus-4-7';

const SYSTEM_PROMPT = `You are a senior influencer-marketing strategist working for InfluenceCrafter, an agency that connects brands with bloggers/creators.

Given a creator's profile and their historical content performance, your job is to produce a short, practical content recommendation: the specific content angle, format and hook that is most likely to perform well for THIS creator on their next collaboration.

Base your reasoning on patterns in the provided performance history (what formats/topics got the best engagement rate, views, likes, comments) and on the creator's niche, city and audience country. Also take into account their past brand collaborations if listed — reuse formats/angles that clearly worked for similar brands, and flag (briefly) if the new brief looks like it could conflict with a past collaboration (e.g. a direct competitor). If a project brief is provided, tailor the recommendation to fit that brand/campaign while staying true to what has historically worked for this creator.

Write in a concise, actionable style a marketing manager can paste straight into a brief for the creator. Structure your answer as:
1. Recommended content angle (1-2 sentences)
2. Why it fits this creator (short, reference their data)
3. A short script/outline (hook, body beats, CTA) — a few bullet points, not a full word-for-word script

Keep the whole answer under ~250 words. Do not include any preamble like "Here is your recommendation" — start directly with section 1.`;

function buildUserPrompt({ blogger, history, brief }) {
  const b = blogger || {};
  const lines = [];

  lines.push('CREATOR PROFILE');
  lines.push(`Name: ${b.name || 'Unknown'}`);
  if (b.category && b.category.length) lines.push(`Niche / category tags: ${b.category.join(', ')}`);
  if (b.city) lines.push(`City: ${b.city}`);
  if (b.audienceCountry) lines.push(`Main audience country: ${b.audienceCountry}`);
  if (b.followers) lines.push(`Followers: ${b.followers}`);
  if (b.er) lines.push(`Average engagement rate: ${b.er}%`);
  if (b.pastBrands && b.pastBrands.length) lines.push(`Past brand collaborations: ${b.pastBrands.join(', ')}`);

  lines.push('');
  if (Array.isArray(history) && history.length) {
    lines.push('PAST PERFORMANCE HISTORY (most relevant first)');
    history.forEach((h, i) => {
      const parts = [
        h.platform ? `Platform: ${h.platform}` : null,
        h.views != null ? `Views: ${h.views}` : null,
        h.likes != null ? `Likes: ${h.likes}` : null,
        h.comments != null ? `Comments: ${h.comments}` : null,
        h.er != null ? `ER: ${h.er}%` : null,
        h.notes ? `Notes: ${h.notes}` : null,
      ].filter(Boolean);
      lines.push(`${i + 1}. ${parts.join(' | ')}`);
    });
  } else {
    lines.push('PAST PERFORMANCE HISTORY: none recorded yet — base the recommendation on niche/profile only, and say so briefly.');
  }

  if (brief) {
    lines.push('');
    lines.push('PROJECT BRIEF');
    lines.push(brief);
  }

  return lines.join('\n');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { blogger, history, brief } = req.body || {};

    if (!blogger || !blogger.name) {
      return res.status(400).json({ error: 'Missing required field: blogger.name' });
    }

    const userPrompt = buildUserPrompt({ blogger, history, brief });

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!content) {
      return res.status(502).json({ error: 'Claude returned an empty response.' });
    }

    return res.status(200).json({ content });
  } catch (err) {
    console.error('generate-script error:', err);
    const status = err && err.status ? err.status : 500;
    return res.status(status).json({ error: err && err.message ? err.message : 'Internal server error' });
  }
};
