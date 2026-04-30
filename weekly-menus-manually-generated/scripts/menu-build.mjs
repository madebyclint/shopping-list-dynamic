#!/usr/bin/env node
/**
 * Step 2 — Full Recipe Build
 * Reads the approved draft JSON and calls the AI to generate a complete
 * menu markdown file with Quick Glance + Deep Dive sections for every meal.
 *
 * Usage:  npm run menu:build
 * Input:  weekly-menus-manually-generated/drafts/<latest>-draft.json
 * Output: weekly-menus-manually-generated/menus/YYYY-MM-DD-menu.md
 * Next:   npm run menu:shopping
 */

import { config } from 'dotenv';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import readline from 'readline';
import OpenAI from 'openai';
import {
  __appDir,
  rootDir,
  HOUSE_RULES,
  PANTRY_STAPLES,
  findLatestDraft,
} from './utils.mjs';

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

// ─── Load draft ───────────────────────────────────────────────────────────────

const draftPath = findLatestDraft();
if (!draftPath) {
  console.error('\n❌  No draft file found in drafts/. Run `npm run menu:draft` first.\n');
  process.exit(1);
}

const draft = JSON.parse(readFileSync(draftPath, 'utf8'));
const { weekOf, weekLabel, meals } = draft;

console.log(`\n📋  Building full menu from draft: ${weekOf}\n`);
console.log('Meals:');
meals.forEach((m) => console.log(`  ${m.emoji}  ${m.name}  (${m.day})`));
console.log();

// ─── Prompt ───────────────────────────────────────────────────────────────────

const mealList = meals
  .map((m) => {
    const label = m.tag ? ` [${m.tag}]` : '';
    return `- ${m.emoji} ${m.name}${label} · ${m.day} · ${m.time}\n  Brief: ${m.brief}`;
  })
  .join('\n');

const systemPrompt = `You are a professional food writer and home-cooking recipe developer.
${HOUSE_RULES}
Write in a warm, practical tone. Recipes should be achievable by a home cook on a weeknight.`;

const userPrompt = `Generate a complete weekly menu markdown file for the week of ${weekLabel}.

Here are the approved meals:
${mealList}

Pantry always on hand (do NOT add these to the shopping list, mark as "— pantry"):
${PANTRY_STAPLES}

Format the output as a markdown file using EXACTLY this structure:

---
# Menu — ${weekLabel}

---

## Quick Glance Meals

### Sun–Fri Plan

- emoji Name *(DAY LABEL, Mon DD)* — key components — fruit/side — XX min
[list all non-brunch meals here]

### Sunday Brunch *(add context if applicable — e.g., guests)*

- emoji Name *(SUNDAY BRUNCH, Mon DD)* — description — XX min
[only if there's a brunch meal; omit this section otherwise]

> One paragraph (3–5 sentences) about this week's themes and flow — how the meals connect, what's special, what to look forward to. Mention day-specific context (guests, fast nights, teen prep).

---

## Deeper View

---

**emoji Name** *(DAY LABEL, Month DD)*
Total time: ~XX min · Approx calories: ~XXX per adult

> 2–3 sentence evocative description. Context about the dish — origin, why it works for this family, any notes.

**Ingredients Used**

- Ingredient (amount) — notes if any
- Pantry ingredient (amount) — pantry

**Cooking Overview**

1. Step 1 — concise, actionable
2. Step 2
[4–8 steps]

> Pro tip or substitution note (optional — include if genuinely useful)

---

[Repeat the --- separator and the full Deeper View block for EACH meal]

---

Rules:
- Mark pantry ingredients with "— pantry" at the end of their line.
- Items to buy have no "— pantry" suffix.
- Include a "Garnishes" or "Toppings" sub-section when relevant (e.g., arroz caldo, tacos).
- For Tuesday fast meals, keep steps minimal (≤ 4 steps).
- For Thursday teen-prep meals, make steps extremely clear and numbered — written as if talking to a 14-year-old.
- Calories are estimates; round to nearest 10.
- Output ONLY the markdown content — no preamble, no closing remarks.`;

// ─── Call API ─────────────────────────────────────────────────────────────────

console.log('🤖  Calling AI to build full recipes... (this may take ~30 sec)\n');

const response = await client.chat.completions.create({
  model: MODEL,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
  temperature: 0.7,
});

const menuContent = response.choices[0].message.content.trim();

// ─── Write menu file ──────────────────────────────────────────────────────────

const menusDir = join(__appDir, 'menus');
const menuPath = join(menusDir, `${weekOf}-menu.md`);
writeFileSync(menuPath, menuContent);

console.log(`✅  Menu saved → menus/${weekOf}-menu.md\n`);
console.log('─'.repeat(62));
console.log('Open the file to review:');
console.log(`  menus/${weekOf}-menu.md`);
console.log('─'.repeat(62));

await pause('\nPress Enter when the menu looks good → Step 3 (shopping list) ...');
console.log('\nRun next:  npm run menu:shopping\n');
