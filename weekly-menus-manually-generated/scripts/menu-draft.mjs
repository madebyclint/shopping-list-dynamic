#!/usr/bin/env node
/**
 * Step 1 — Menu Draft
 * Calls the AI to propose 6 meal names (5 dinners + 1 breakfast) with day
 * assignments, timing, and a 1-line brief. Writes a draft JSON file and
 * pauses for human review before proceeding.
 *
 * Usage:  npm run menu:draft
 * Output: weekly-menus-manually-generated/drafts/YYYY-MM-DD-draft.json
 * Next:   npm run menu:build
 */

import { config } from 'dotenv';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import readline from 'readline';
import OpenAI from 'openai';
import {
  __appDir,
  rootDir,
  WEEKS_TO_AVOID,
  HOUSE_RULES,
  PANTRY_STAPLES,
  WEEKLY_RECURRING,
  nextWeekDates,
  getRecentMeals,
  getFollowingWeekIdeas,
} from './utils.mjs';

// Load env — try .env.local first (Next.js convention), then .env
config({ path: join(rootDir, '.env.local') });
config({ path: join(rootDir, '.env') });

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';

if (!process.env.OPENAI_API_KEY) {
  console.error('\n❌  OPENAI_API_KEY is not set. Add it to .env.local at the project root.\n');
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function pause(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => { rl.close(); resolve(); });
  });
}

// ─── Build context ────────────────────────────────────────────────────────────

const { sunday, weekLabel, mondayLabel } = nextWeekDates();
const recentMeals = getRecentMeals();
const followingIdeas = getFollowingWeekIdeas();

// ─── Prompt ───────────────────────────────────────────────────────────────────

const systemPrompt = `You are a creative home-cooking meal planner for a Brooklyn family of 4 with two teens.
${HOUSE_RULES}`;

const userPrompt = `Draft a meal plan for the week of ${mondayLabel} (${weekLabel}).

Requirements:
1. 5 dinners + 1 breakfast (6 meals total)
2. Under 1 hour each — aim for ~30 min
3. Budget-friendly (Brooklyn small-market prices, slightly higher than chains)
4. Diverse cuisines — think globally, avoid repetition across the week
5. Rainbow plate mentality — always include vegetables/fruit + protein
6. Tuesday MUST be a super-fast or no-cook meal (family arrives home at 8pm).
   Think: hot dogs, quesadillas, charcuterie board, mac & cheese, hamburgers, etc.
7. Thursday MUST be teen-friendly prep — the teens make it themselves.
   Think: tacos, pasta, stir fry, sheet pan, nachos, etc. Clear, simple steps.
8. Avoid repeating meals from the last ${WEEKS_TO_AVOID} weeks:
   ${recentMeals.join(', ') || '(none on record)'}
${followingIdeas ? `9. Ideas to consider from last week: ${followingIdeas}` : ''}

Pantry always on hand: ${PANTRY_STAPLES}
Always include on shopping list (recurring): ${WEEKLY_RECURRING}

Return ONLY a valid JSON object (no markdown code fences, no extra text) with this exact shape:
{
  "weekOf": "${sunday}",
  "weekLabel": "${weekLabel}",
  "meals": [
    {
      "name": "Meal Name",
      "day": "Sunday, May 3",
      "emoji": "🍲",
      "time": "30 min",
      "tag": "",
      "tagType": "",
      "brief": "key components, cooking method — fruit/side — 1 concise line"
    }
  ]
}

Rules for tag / tagType:
- Tuesday fast meal:  tag = "FAST",      tagType = "fast"
- Thursday teen prep: tag = "TEEN PREP", tagType = "teen-prep"
- Sunday brunch:      tag = "BRUNCH",    tagType = "special"
- All others:         tag = "",          tagType = ""

Order meals by day: Sunday brunch first (if any), then Mon–Fri dinners.
The day field uses format "Weekday, Mon D" — e.g. "Monday, May 4".`;

// ─── Call API ─────────────────────────────────────────────────────────────────

console.log('\n🍽️  Generating meal draft with AI...\n');

const response = await client.chat.completions.create({
  model: MODEL,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
  temperature: 0.8,
  response_format: { type: 'json_object' },
});

const draft = JSON.parse(response.choices[0].message.content);

// ─── Write draft file ─────────────────────────────────────────────────────────

const draftsDir = join(__appDir, 'drafts');
mkdirSync(draftsDir, { recursive: true });
const draftPath = join(draftsDir, `${sunday}-draft.json`);
writeFileSync(draftPath, JSON.stringify(draft, null, 2));

// ─── Display results ──────────────────────────────────────────────────────────

console.log(`✅  Draft saved → drafts/${sunday}-draft.json\n`);
console.log('─'.repeat(62));
for (const m of draft.meals) {
  const label = m.tag ? `  [${m.tag}]` : '';
  console.log(`  ${m.emoji}  ${m.name}${label}`);
  console.log(`     ${m.day} · ${m.time}`);
  console.log(`     ${m.brief}`);
  console.log();
}
console.log('─'.repeat(62));
console.log('\n📝  Review above. Edit drafts/' + sunday + '-draft.json if you want changes.');

await pause('\nPress Enter when happy with the draft → Step 2 (full recipes) ...');
console.log('\nRun next:  npm run menu:build\n');
