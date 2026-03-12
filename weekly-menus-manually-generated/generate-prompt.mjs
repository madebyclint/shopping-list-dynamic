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
4. Diversify the meals (cuisine) and don't be shy about non-mainstream — think outside the box
5. Rainbow plate mentality if possible with always a serving of veggie or fruit and protein. Veggie proteins are ok too.
6. If we do pork, we need to do a pork portion and a non-pork portion for a couple family members.
7. We are a family of 4 with two teens

**Context:**
- Week of ${weekDate}
- Recent meals to avoid repeating (last ${WEEKS_TO_AVOID} weeks): ${recentMeals.join(', ')}${followingIdeas ? `\n- Ideas to consider from last week: ${followingIdeas}` : ''}
- We are in Brooklyn buying at small markets (higher prices than chain stores)
- Pantry staples on hand: olive oil, vegetable oil, soy sauce, fish sauce, rice vinegar, sesame oil, chicken broth, vegetable broth, salt, pepper, red pepper flakes, cumin, paprika, chili powder, garlic powder, oregano, turmeric, coriander, cinnamon, bay leaves, jasmine rice, flour, sugar, canned tomatoes/paste, canned chickpeas/black beans/kidney beans, couscous, pasta, hot sauce, Worcestershire, ketchup, fresh garlic, fresh ginger
- Weekly recurring items to always include: chips, Lactaid whole milk, cereal, eggs, fresh fruit

Please present 5 dinners + 1 breakfast for approval first (name + key components + estimated time), then I'll confirm before you generate the full plan.`;

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
