// Vercel serverless function: POST /api/match-bloggers
// Takes a free-text campaign brief + a list of candidate bloggers (profile,
// performance history, past brand collaborations, internal project history)
// and asks Claude to rank the candidates for this specific campaign.
// The ANTHROPIC_API_KEY is read from Vercel Environment Variables — never sent from the client.

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from process.env automatically

const MODEL = 'claude-opus-4-7';

const SYSTEM_PROMPT = `You are a senior influencer-marketing strategist working for InfluenceCrafter, an agency that connects brands with bloggers/creators.

You will be given a free-text campaign brief (written by a marketing manager, often informal — it may describe the brand, the niche, the city, the audience, exclusions like "hasn't worked with a direct competitor" or "only creators who haven't been used yet this year", tone, budget hints, etc.) and a list of candidate creators with their profile, performance history and past brand collaborations (both internal — past InfluenceCrafter projects — and external, self-reported).

Your job: rank the candidates from best fit to worst fit for THIS specific brief. Consider:
- Fit with the brief's niche/topic/city/audience requirements.
- Track record: engagement rate, views, and what historically worked for each creator.
- Past brand collaborations: reward relevant/complementary past work, and penalize (lower rank, note the conflict) any creator whose past collaborations look like a direct competitor conflict with the brief's brand/category.
- Explicit exclusions mentioned in the brief (e.g. "new faces only", "no one from project X") — respect them strictly; if a candidate should be excluded, give them the lowest ranks and say why in the reason.

Return EVERY candidate you were given, each exactly once, ranked 1 (best) to N (worst — N = number of candidates). For each, write a one-sentence reason a marketing manager can read at a glance, citing concrete data (numbers, past brand names, niche match) where possible — not generic praise.`;

function buildUserPrompt({ brief, candidates }) {
  const lines = [];
  lines.push('CAMPAIGN BRIEF (free text from the marketing manager)');
  lines.push(brief || '(no brief text provided — rank generically on profile strength and data quality)');
  lines.push('');
  lines.push('CANDIDATE CREATORS');
  (candidates || []).forEach((c, i) => {
    const parts = [
      `id: ${c.id}`,
      `name: ${c.name || 'Unknown'}`,
      c.category && c.category.length ? `niche: ${c.category.join(', ')}` : null,
      c.city ? `city: ${c.city}` : null,
      c.audienceCountry ? `audience country: ${c.audienceCountry}` : null,
      c.followers != null ? `followers: ${c.followers}` : null,
      c.er != null ? `avg ER: ${c.er}%` : null,
      c.pastBrands && c.pastBrands.length ? `past external brand collabs: ${c.pastBrands.join(', ')}` : null,
      c.internalProjects && c.internalProjects.length ? `past InfluenceCrafter projects: ${c.internalProjects.join(', ')}` : null,
      c.historyNotes ? `recent performance notes: ${c.historyNotes}` : null,
    ].filter(Boolean);
    lines.push(`${i + 1}. ${parts.join(' | ')}`);
  });
  return lines.join('\n');
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          bloggerId: { type: 'string' },
          rank: { type: 'integer' },
          reason: { type: 'string' },
        },
        required: ['bloggerId', 'rank', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['matches'],
  additionalProperties: false,
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { brief, candidates } = req.body || {};

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ error: 'Missing required field: candidates (non-empty array).' });
    }

    const userPrompt = buildUserPrompt({ brief, candidates });

    // Every candidate gets a rank + a one-sentence reason, so the output
    // grows with the candidate pool (up to 60 — see projects.html's cap).
    // 4096 tokens was too tight and got cut mid-JSON on larger pools,
    // which surfaced as a generic "invalid JSON" error.
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    });

    if (message.stop_reason === 'max_tokens') {
      console.error('match-bloggers: response was cut off at max_tokens with', (req.body.candidates || []).length, 'candidates');
      return res.status(502).json({ error: 'Response was cut off before finishing — try narrowing the filters above to fewer candidates and try again.' });
    }
    if (message.stop_reason === 'refusal') {
      return res.status(502).json({ error: 'Claude declined to answer this request.' });
    }

    const textBlock = message.content.find((block) => block.type === 'text');
    if (!textBlock || !textBlock.text) {
      return res.status(502).json({ error: 'Claude returned an empty response.' });
    }

    let parsed;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch (parseErr) {
      console.error('match-bloggers: failed to parse model output as JSON:', textBlock.text);
      return res.status(502).json({ error: 'Claude returned invalid JSON.' });
    }

    const matches = Array.isArray(parsed.matches) ? parsed.matches : [];
    matches.sort((a, b) => (a.rank || 0) - (b.rank || 0));

    return res.status(200).json({ matches });
  } catch (err) {
    console.error('match-bloggers error:', err);
    const status = err && err.status ? err.status : 500;
    return res.status(status).json({ error: err && err.message ? err.message : 'Internal server error' });
  }
};
