// Shared utilities for the multi-step menu generation scripts.
// All file paths are resolved relative to this script's location,
// so scripts work correctly regardless of the cwd they're invoked from.

import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __scriptsDir = dirname(__filename);

// weekly-menus-manually-generated/
export const __appDir = dirname(__scriptsDir);

// project root (one level above weekly-menus-manually-generated/)
export const rootDir = dirname(__appDir);

// How many past weeks of meals to reference when avoiding repeats
export const WEEKS_TO_AVOID = 6;

// ─── House rules ─────────────────────────────────────────────────────────────

export const HOUSE_RULES = `
House rules (apply silently — never call out substitutions):
- Pork-free household. Substitute pork with beef or turkey in all recipes.
  Examples: ham → turkey deli, bacon → turkey bacon or beef bacon,
  pork sausage → beef kielbasa, pulled pork → pulled beef.
- Maggi beef ribs: always use all-beef ribs (Julian's preference).
`.trim();

// ─── Pantry & recurring items ─────────────────────────────────────────────────

export const PANTRY_STAPLES =
  'olive oil, vegetable oil, soy sauce, fish sauce, rice vinegar, sesame oil, ' +
  'chicken broth, vegetable broth, salt, pepper, red pepper flakes, cumin, paprika, ' +
  'chili powder, garlic powder, oregano, turmeric, coriander, cinnamon, bay leaves, ' +
  'jasmine rice, flour, sugar, canned tomatoes/paste, canned chickpeas/black beans/kidney beans, ' +
  'couscous, pasta, hot sauce, Worcestershire, ketchup, fresh garlic, fresh ginger';

export const WEEKLY_RECURRING =
  'chips (family snack packs), Lactaid whole milk, cereal (1 box), eggs (1 dozen), fresh fruit';

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Returns dates for the upcoming week.
 * The "week" runs Sun (brunch/dinner) through Fri (dinner).
 * Identified by the Sunday date; Monday is the first weekday.
 *
 * @returns {{ sunday: string, weekLabel: string, mondayLabel: string }}
 *   sunday      — YYYY-MM-DD of the upcoming Sunday (used as filename key)
 *   weekLabel   — e.g. "Sun May 3 - Fri May 8, 2026"  (for data.json)
 *   mondayLabel — e.g. "May 4, 2026"                   (for prompts)
 */
export function nextWeekDates() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 1=Mon …

  // How many days until next Monday (if today IS Monday, go 7 days ahead)
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;

  const nextMon = new Date(today);
  nextMon.setDate(today.getDate() + daysUntilMonday);

  // Sunday is the day before that Monday
  const sunday = new Date(nextMon);
  sunday.setDate(nextMon.getDate() - 1);

  // Friday is 4 days after Monday
  const friday = new Date(nextMon);
  friday.setDate(nextMon.getDate() + 4);

  const toISO = (d) => d.toISOString().slice(0, 10);

  const shortFmt = (d) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const longFmt = (d) =>
    d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return {
    sunday: toISO(sunday),
    weekLabel: `Sun ${shortFmt(sunday)} - Fri ${shortFmt(friday)}, ${friday.getFullYear()}`,
    mondayLabel: longFmt(nextMon),
  };
}

// ─── Meal history helpers ─────────────────────────────────────────────────────

/**
 * Parse the last WEEKS_TO_AVOID weeks of dinner names from meal-history.md.
 * Returns a flat array of meal name strings.
 */
export function getRecentMeals() {
  const historyPath = join(__appDir, 'meal-history.md');
  const text = readFileSync(historyPath, 'utf8');

  // Split on any h2 heading (handles both "## Week of ..." and "## Sun Apr ..." formats)
  const weekBlocks = text.split(/^## /m).slice(1);
  const recent = weekBlocks.slice(0, WEEKS_TO_AVOID);

  const meals = [];
  for (const block of recent) {
    const lines = block.split('\n');
    let inDinners = false;
    for (const line of lines) {
      if (/^### Dinners/i.test(line)) { inDinners = true; continue; }
      if (/^### /i.test(line)) { inDinners = false; continue; }
      if (inDinners && line.startsWith('- ')) {
        // Strip leading emoji (one or more non-letter chars) and trailing *(annotations)*
        let name = line
          .replace(/^-\s+/, '')
          .split(' — ')[0]
          .replace(/\s*\*\([^)]+\)\*/g, '')
          .replace(/^[^\p{L}]+/u, '')
          .trim();
        if (name) meals.push(name);
      }
    }
  }
  return meals;
}

/**
 * Extract the "For Following Week" ideas line from the most recent week in meal-history.md.
 * Returns the ideas string, or null if not present.
 */
export function getFollowingWeekIdeas() {
  const historyPath = join(__appDir, 'meal-history.md');
  const text = readFileSync(historyPath, 'utf8');
  const match = text.match(/"For Following Week" ideas?:\s*([^\n]+)/i);
  return match ? match[1].trim() : null;
}

// ─── Draft file helpers ───────────────────────────────────────────────────────

/**
 * Find the most recent draft file in weekly-menus-manually-generated/drafts/.
 * Returns the full path, or null if none found.
 */
export function findLatestDraft() {
  const draftsDir = join(__appDir, 'drafts');
  if (!existsSync(draftsDir)) return null;
  const files = readdirSync(draftsDir)
    .filter((f) => f.endsWith('-draft.json'))
    .sort()
    .reverse();
  return files.length ? join(draftsDir, files[0]) : null;
}
