#!/usr/bin/env node
// Usage: node weekly-menus-manually-generated/generate-prompt.mjs
// Reads meal-history.md and prints a ready-to-paste weekly menu prompt.

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Config ---
const WEEKS_TO_AVOID = 6;

// --- Get next Monday ---
function nextMonday() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 1=Mon...
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
  const next = new Date(today);
  next.setDate(today.getDate() + daysUntilMonday);
  return next.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// --- Parse recent meals from meal-history.md ---
function getRecentMeals() {
  const historyPath = join(__dirname, 'meal-history.md');
  const text = readFileSync(historyPath, 'utf8');

  const weekBlocks = text.split(/^## Week of /m).slice(1); // split by week heading
  const recent = weekBlocks.slice(0, WEEKS_TO_AVOID);

  const meals = [];
  for (const block of recent) {
    const lines = block.split('\n');
    let inDinners = false;
    for (const line of lines) {
      if (/^### Dinners/i.test(line)) { inDinners = true; continue; }
      if (/^### /i.test(line)) { inDinners = false; continue; }
      if (inDinners && line.startsWith('- ')) {
        // Extract just the meal name (before the em dash)
        const name = line.replace(/^- /, '').split(' — ')[0].trim();
        if (name && !name.startsWith('*(')) meals.push(name);
      }
    }
  }
  return meals;
}

// --- Get "For Following Week" ideas from most recent week ---
function getFollowingWeekIdeas() {
  const historyPath = join(__dirname, 'meal-history.md');
  const text = readFileSync(historyPath, 'utf8');
  const match = text.match(/"For Following Week" ideas?:([^\n]+)/i);
  return match ? match[1].trim() : null;
}

// --- Build prompt ---
const weekDate = nextMonday();
const recentMeals = getRecentMeals();
const followingIdeas = getFollowingWeekIdeas();

const prompt = `I need a meal plan for the next week. Here is the criteria:

1. Needs to be 5 dinners to cook + 1 breakfast
2. Keep them to under an hour to make, preferably closer to 30 min
3. Keep them budget friendly
4. Diversify the meals (cuisine) — don't be shy about non-mainstream, think outside the box, and **avoid repeating the same cuisine twice in one week**
5. Rainbow plate mentality — always a serving of veggie and protein. Veggie proteins are ok too. **Every meal must include a fresh fruit as a side** — list it in both the meal summary and ingredients. Pick fruits that pair with the cuisine where possible.
6. If we do pork, we need to do a pork portion and a non-pork portion for a couple family members.
7. We are a family of 4 with two teens
8. **Tuesday must be a super fast meal (≤20 min)** — we get home at 8pm. Think mac and cheese, hot dogs, quesadillas, charcuterie board, ramen, grilled cheese, etc. No-cook is fine but not required — speed is the priority.
9. **Thursday must be a kid-friendly prep meal** — the teens make it themselves. Keep it simple with clear steps (tacos, pasta, stir fry, sheet pan, etc.)

**Health goals to keep in mind (soft guidelines, not hard rules):**
- Reduce bloating: pull back on high-FODMAP ingredients (onions, garlic, beans, cruciferous veggies) where possible — don't eliminate, just don't lead with them. Prefer meals that are easy to digest on weeknights.
- Weight loss: protein at every meal, half the plate veggies, sensible portions. Ginger, lemon/lime, avocado, sweet potato, and banana are all good additions where they fit naturally.
- Lighter weeknight dinners preferred — the family does a short walk after dinner.

**Context:**
- Week of ${weekDate}
- Recent meals to avoid repeating (last ${WEEKS_TO_AVOID} weeks): ${recentMeals.join(', ')}${followingIdeas ? `\n- Ideas to consider from last week: ${followingIdeas}` : ''}
- We are in Brooklyn buying at small markets (higher prices than chain stores)

**Pantry staples — do NOT add these to the shopping list:**
- Olive oil, vegetable oil, canola oil, butter
- Soy sauce, fish sauce, rice vinegar, sesame oil
- Chicken broth, vegetable broth
- Salt, black pepper, red pepper flakes
- Cumin, paprika, chili powder, garlic powder, oregano, turmeric, coriander, cinnamon, bay leaves
- Jasmine rice, all-purpose flour, sugar
- Canned tomatoes, tomato paste, canned chickpeas, black beans, kidney beans
- Couscous, pasta
- Hot sauce, Worcestershire sauce, ketchup
- Fresh garlic, fresh ginger

**Weekly recurring items — always include in the shopping list:**
- Chips (2 bags — always specify type, e.g. tortilla, salt & vinegar; note the meal if applicable)
- Cereal (2 boxes)
- Lactaid whole milk (1 half-gallon)
- Almond milk (1 gallon)
- Eggs (1 dozen)
- Assorted fresh fruit (~$10–$15)
- Ice cream (1 container)
- Trail mix (1 bag)
- Mango juice (1 bottle/carton)
- Condensed milk (1 can)
- Toilet paper (1 pack)
- Paper towels (1 pack)

---

Please present 5 dinners + 1 breakfast for approval first (name + key components + estimated time), label which is **Tuesday (fast/easy)** and which is **Thursday (kids prep)**, then after I confirm generate the full output in these sections:

**FILE 1 — \`menus/YYYY-MM-DD-menu.md\`**

Use the Monday date for the filename. Structure:
\`\`\`
# Menu — [Week Label]

## Quick Glance Meals

### Sun–Fri Plan
- [emoji] [Meal Name] *([DAY LABEL, Date])* — [key components] — [fruit side] — [X] min
...

### For Following Week
(optional ideas)

[One short narrative paragraph summarizing the week's theme/flow]

---

## Deeper View

**[Meal Name]** *([Day, Date])*
Total time: ~X min · Approx calories: ~XXX per adult

> [1–2 sentence flavor/background note]

**Ingredients Used**

- Ingredient
- [Fruit] (served on the side)

**Cooking Overview**

1. Step
2. Step

---
\`\`\`
Format rules: title + day on same line; blank line after bold labels before lists; numbered steps only; fruit in both Quick Glance and Ingredients Used.

**FILE 2 — \`shopping-lists/YYYY-MM-DD-shopping-list.md\`**

\`\`\`
# Shopping List — [Date Range] — ~$XXX

> [Notes blurb: where to find specialty items, substitutes, tips]

---

🥬 **PRODUCE**
- Item (qty) — Meal Name — ~$price ea — **~$total**
...
Produce Subtotal: **~$XX.XX**

🥩 **PROTEINS**
...
Proteins Subtotal: **~$XX.XX**

🧀 **DAIRY & REFRIGERATED**
...

🛒 **PANTRY & DRY GOODS**
...

🧻 **HOUSEHOLD**
...

🛍 **WEEKLY STAPLES**
...

---
| Category | Est. Total |
|---|---|
| Produce | $XX |
| Proteins | $XX |
| ... | ... |
| **GRAND TOTAL** | **~$XXX** |
\`\`\`
Rules: every line item includes the meal it's for; never bare "Chips" — always specify type; combine shared ingredients across meals; do a line-by-line audit against Ingredients Used before finalizing; pantry staples must not appear.

After the grand total table, add a section with this EXACT heading (the dashboard checklist depends on it):
\`\`\`
## Shopping List by Trip

### Meals
- Item (qty) — Meal Name
...

### Pantry / Weekly
- Item — weekly
...

### Non-Food
- Item — weekly
\`\`\`
Every item must include the meal name after a dash. Weekly staples use \`— weekly\`. Snacks use \`— snacking\`.

**FILE 3 — \`data.json\` currentWeek block**

Output only the updated \`currentWeek\` JSON block:
\`\`\`json
"currentWeek": "YYYY-MM-DD",
"weekLabel": "Sun Mon D - Fri Mon D, YYYY",
"shoppingDate": "YYYY-MM-DD",
"files": {
  "menu": "menus/YYYY-MM-DD-menu.md",
  "shoppingList": "shopping-lists/YYYY-MM-DD-shopping-list.md"
},
"meals": [
  { "name": "...", "day": "Sunday, Mon D", "emoji": "...", "time": "X min", "tag": "", "tagType": "" }
]
\`\`\`
tagType values: "fast" (Tuesday), "teen" (Thursday), "special" (occasion), "" (none). tag is the display label: "FAST", "TEEN PREP", "BRUNCH", etc.

**FILE 4 — \`meal-history.md\` entry**

One-liner per meal in this format, grouped under a new week heading:
\`\`\`
## [Week Label]

### Dinners
- [emoji] [Meal Name] *([DAY LABEL])* — key components — X min

### Breakfast / Brunch
- [emoji] [Meal Name] *([DAY LABEL])* — key components — X min

### Notes
- Any substitutions, special notes, or "For Following Week" ideas
\`\`\`

**FILE 5 — \`menus/index.json\` entry**

Single line to prepend to the menus array:
\`\`\`json
{ "filename": "YYYY-MM-DD-menu.md", "date": "YYYY-MM-DD", "label": "Week of Month D, YYYY" }
\`\`\``;

console.log('\n' + '='.repeat(60));
console.log('  WEEKLY MENU PROMPT — copy everything below the line');
console.log('='.repeat(60) + '\n');
console.log(prompt);
console.log('\n' + '='.repeat(60) + '\n');

try {
  execSync('pbcopy', { input: prompt });
  console.log('✓ Prompt copied to clipboard!\n');
} catch {
  console.log('(pbcopy not available — copy manually above)\n');
}
