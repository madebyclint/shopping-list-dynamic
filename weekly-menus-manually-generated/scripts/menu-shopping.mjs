#!/usr/bin/env node
/**
 * Step 3 — Shopping List Generation
 * Reads the menu file and calls the AI to produce an organized, priced
 * shopping list grouped by store section. Also generates the
 * meals-ingredients.json used by the X-Ray panel in the dashboard.
 *
 * Usage:  npm run menu:shopping
 * Input:  weekly-menus-manually-generated/menus/YYYY-MM-DD-menu.md
 *         weekly-menus-manually-generated/drafts/<latest>-draft.json
 * Output: weekly-menus-manually-generated/shopping-lists/YYYY-MM-DD-shopping-list.md
 *         weekly-menus-manually-generated/meals-ingredients.json
 * Next:   npm run menu:finalize
 */

import { config } from 'dotenv';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import readline from 'readline';
import OpenAI from 'openai';
import {
  __appDir,
  rootDir,
  WEEKLY_RECURRING,
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

// ─── Load draft + menu ────────────────────────────────────────────────────────

const draftPath = findLatestDraft();
if (!draftPath) {
  console.error('\n❌  No draft file found in drafts/. Run `npm run menu:draft` first.\n');
  process.exit(1);
}

const draft = JSON.parse(readFileSync(draftPath, 'utf8'));
const { weekOf, weekLabel } = draft;

const menuPath = join(__appDir, 'menus', `${weekOf}-menu.md`);
if (!existsSync(menuPath)) {
  console.error(`\n❌  Menu file not found: menus/${weekOf}-menu.md\n    Run \`npm run menu:build\` first.\n`);
  process.exit(1);
}

const menuContent = readFileSync(menuPath, 'utf8');

console.log(`\n🛒  Generating shopping list for week of ${weekOf}...\n`);

// ─── Shopping list prompt ─────────────────────────────────────────────────────

const shoppingSystemPrompt = `You are a precise and budget-conscious shopping list generator for a Brooklyn family.
You create organized, well-annotated grocery lists that are easy to shop from in small neighborhood markets.`;

const shoppingUserPrompt = `Using the menu below, generate a complete shopping list for the week of ${weekLabel}.

MENU FILE:
${menuContent}

WEEKLY RECURRING ITEMS (always include, even if not in a recipe):
${WEEKLY_RECURRING}

Format the shopping list as markdown using EXACTLY this structure:

# Shopping List — ${weekLabel} — ~$[estimated total]

> **Notes:** [2–4 sentences of practical sourcing notes — where to find specialty items, substitution options, which stores to check for specific things]

---

🥬 **PRODUCE**

**— Vegetables —**

- Item (quantity) — Which meal(s) — ~$X.XX/unit — **~$X.XX**

**— Fruit —**

- Item (quantity) — Which meal(s) — ~$X.XX/unit — **~$X.XX**

Produce Subtotal: **~$XX.XX**

---

🥩 **PROTEINS**

- Item (quantity and spec) — Which meal — ~$X.XX/lb — **~$X.XX**
  *(Sourcing note if helpful — where to find, what to ask butcher, substitution)*

Proteins Subtotal: **~$XX.XX**

---

🧀 **DAIRY & REFRIGERATED**

- Item (quantity) — Which meal — ~$X.XX — **~$X.XX**

Dairy & Refrigerated Subtotal: **~$XX.XX**

---

🛒 **PANTRY & DRY GOODS**

- Item (quantity) — Which meal — ~$X.XX — **~$X.XX**

Pantry & Dry Goods Subtotal: **~$XX.XX**

---

🧻 **HOUSEHOLD**

- Wet wipes — ~$X.XX
[common household item or two; skip section if nothing needed]

Household Subtotal: **~$X.XX**

---

🔄 **WEEKLY RECURRING**

- Chips (family snack packs, 2–3 bags) — ~$X.XX
- Lactaid whole milk (½ gallon) — ~$X.XX
- Cereal (1 box) — ~$X.XX
- Eggs (1 dozen) — ~$X.XX
- Fresh fruit (for snacking, beyond meal fruit) — ~$X.XX

Weekly Recurring Subtotal: **~$XX.XX**

---

**ESTIMATED TOTAL: ~$XXX**

Rules:
- Price estimates should reflect Brooklyn small-market prices (typically 20–30% above chain stores).
- Do NOT include pantry staples (olive oil, soy sauce, garlic, etc.) unless the recipe needs an unusually large quantity.
- Group shared ingredients across meals (e.g., if limes are used in 3 meals, one line with combined quantity).
- Include a buy note in parentheses for specialty or hard-to-find items.
- Output ONLY the markdown content — no preamble, no closing remarks.`;

// ─── X-Ray ingredients prompt ─────────────────────────────────────────────────

const xraySystemPrompt = `You extract structured ingredient data from menu files. Return only valid JSON.`;

const xrayUserPrompt = `From the menu below, extract the per-meal ingredient data for the X-Ray panel.

MENU:
${menuContent}

Return ONLY a valid JSON object (no markdown fences) with this shape:
{
  "week": "${weekOf}",
  "meals": [
    {
      "name": "Meal Name",
      "day": "Sunday brunch",
      "emoji": "🍚",
      "buy_these": ["Ingredient to buy (with quantity)", ...],
      "pantry": ["Pantry item name", ...]
    }
  ]
}

Rules:
- "buy_these" = items marked without "— pantry", plus garnishes/toppings to buy
- "pantry" = items marked "— pantry" in the Ingredients Used section
- Keep ingredient strings concise but include quantity in buy_these (e.g. "Ground beef (1 lb)")
- day should be a short label like "Sunday brunch", "Monday dinner", "Tuesday fast", "Thursday teen prep", etc.
- Include ALL meals from the menu in order.`;

// ─── Call both APIs in parallel ───────────────────────────────────────────────

console.log('🤖  Calling AI for shopping list + ingredient data... (may take ~30 sec)\n');

const [shoppingResponse, xrayResponse] = await Promise.all([
  client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: shoppingSystemPrompt },
      { role: 'user', content: shoppingUserPrompt },
    ],
    temperature: 0.3,
  }),
  client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: xraySystemPrompt },
      { role: 'user', content: xrayUserPrompt },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  }),
]);

const shoppingList = shoppingResponse.choices[0].message.content.trim();
const xrayData = JSON.parse(xrayResponse.choices[0].message.content);

// ─── Write files ──────────────────────────────────────────────────────────────

const listPath = join(__appDir, 'shopping-lists', `${weekOf}-shopping-list.md`);
writeFileSync(listPath, shoppingList);

const xrayPath = join(__appDir, 'meals-ingredients.json');
writeFileSync(xrayPath, JSON.stringify(xrayData, null, 2));

console.log(`✅  Shopping list saved → shopping-lists/${weekOf}-shopping-list.md`);
console.log(`✅  X-Ray data saved    → meals-ingredients.json\n`);
console.log('─'.repeat(62));
console.log('Review before finalizing:');
console.log(`  shopping-lists/${weekOf}-shopping-list.md`);
console.log('─'.repeat(62));

await pause('\nPress Enter when the list looks good → Step 4 (finalize) ...');
console.log('\nRun next:  npm run menu:finalize\n');
