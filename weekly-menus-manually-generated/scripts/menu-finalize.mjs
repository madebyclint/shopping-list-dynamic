#!/usr/bin/env node
/**
 * Step 4 — Finalize
 * No AI calls. Updates all manifest and history files so the dashboard
 * reflects the new week.
 *
 * Operations:
 *   1. data.json        — currentWeek → lastWeek, new week data from draft
 *   2. menus/index.json — prepend new archive entry
 *   3. meal-history.md  — prepend new week block
 *
 * Usage:  npm run menu:finalize
 * Input:  drafts/<latest>-draft.json
 *         menus/YYYY-MM-DD-menu.md
 *         shopping-lists/YYYY-MM-DD-shopping-list.md
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { __appDir, findLatestDraft } from './utils.mjs';

// ─── Load draft ───────────────────────────────────────────────────────────────

const draftPath = findLatestDraft();
if (!draftPath) {
  console.error('\n❌  No draft file found in drafts/. Run `npm run menu:draft` first.\n');
  process.exit(1);
}

const draft = JSON.parse(readFileSync(draftPath, 'utf8'));
const { weekOf, weekLabel, meals } = draft;

// Validate downstream files exist
const menuPath = join(__appDir, 'menus', `${weekOf}-menu.md`);
const listPath = join(__appDir, 'shopping-lists', `${weekOf}-shopping-list.md`);

if (!existsSync(menuPath)) {
  console.error(`\n❌  menus/${weekOf}-menu.md not found. Run \`npm run menu:build\` first.\n`);
  process.exit(1);
}
if (!existsSync(listPath)) {
  console.error(`\n❌  shopping-lists/${weekOf}-shopping-list.md not found. Run \`npm run menu:shopping\` first.\n`);
  process.exit(1);
}

console.log(`\n📦  Finalizing week of ${weekOf} (${weekLabel})...\n`);

// ─── 1. Update data.json ──────────────────────────────────────────────────────

const dataPath = join(__appDir, 'data.json');
const data = JSON.parse(readFileSync(dataPath, 'utf8'));

// Build the new week's shoppingDate label (Sunday = weekOf)
const sundayDate = new Date(weekOf + 'T12:00:00Z');
const shoppingDateLabel = sundayDate.toLocaleDateString('en-US', {
  weekday: undefined,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'UTC',
}).replace(/\//g, '-');  // "MM-DD-YYYY" → we want YYYY-MM-DD
// Actually just use weekOf directly as the shoppingDate key
const newData = {
  ...data,
  // Preserve comments
  lastWeek: {
    currentWeek: data.currentWeek,
    weekLabel: data.weekLabel,
    shoppingDate: data.shoppingDate,
    files: data.files,
    meals: data.meals,
  },
  currentWeek: weekOf,
  weekLabel: weekLabel,
  shoppingDate: weekOf,
  files: {
    menu: `menus/${weekOf}-menu.md`,
    shoppingList: `shopping-lists/${weekOf}-shopping-list.md`,
  },
  meals: meals.map(({ brief: _brief, ...m }) => m),  // strip internal-only 'brief' field
};

writeFileSync(dataPath, JSON.stringify(newData, null, 2));
console.log('  ✅  data.json updated');

// ─── 2. Update menus/index.json ───────────────────────────────────────────────

const indexPath = join(__appDir, 'menus', 'index.json');
const indexData = JSON.parse(readFileSync(indexPath, 'utf8'));

// Build a human-readable label from weekLabel, e.g. "Week of May 3, 2026"
const sundayForLabel = new Date(weekOf + 'T12:00:00Z');
const labelMonth = sundayForLabel.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
const labelDay = sundayForLabel.getUTCDate();
const labelYear = sundayForLabel.getUTCFullYear();
const archiveLabel = `Week of ${labelMonth} ${labelDay}, ${labelYear}`;

const newEntry = {
  filename: `${weekOf}-menu.md`,
  date: weekOf,
  label: archiveLabel,
};

// Prepend only if not already present
const alreadyExists = indexData.menus.some((m) => m.date === weekOf);
if (!alreadyExists) {
  indexData.menus.unshift(newEntry);
  writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
  console.log('  ✅  menus/index.json updated');
} else {
  console.log('  ⚠️   menus/index.json already has an entry for this week — skipped');
}

// ─── 3. Prepend to meal-history.md ────────────────────────────────────────────

const historyPath = join(__appDir, 'meal-history.md');
const existingHistory = readFileSync(historyPath, 'utf8');

// Check if already added
if (existingHistory.includes(`## ${weekLabel}`)) {
  console.log('  ⚠️   meal-history.md already has an entry for this week — skipped');
} else {
  const dinners = meals.filter((m) => m.tagType !== 'special' && m.tag.toUpperCase() !== 'BRUNCH');
  const brunches = meals.filter((m) => m.tag.toUpperCase() === 'BRUNCH');

  let block = `## ${weekLabel}\n\n`;

  if (dinners.length) {
    block += `### Dinners\n\n`;
    for (const m of dinners) {
      const dayName = m.day.split(',')[0].toUpperCase();
      let dayLabel = dayName;
      if (m.tagType === 'fast') dayLabel = `${dayName} FAST`;
      else if (m.tagType === 'teen-prep') dayLabel = `${dayName} TEEN PREP`;
      block += `- ${m.emoji} ${m.name} *(${dayLabel})* — ${m.brief} — ${m.time}\n`;
    }
    block += '\n';
  }

  if (brunches.length) {
    block += `### Brunch\n\n`;
    for (const m of brunches) {
      const dayName = m.day.split(',')[0].toUpperCase();
      block += `- ${m.emoji} ${m.name} *(${dayName} BRUNCH)* — ${m.brief} — ${m.time}\n`;
    }
    block += '\n';
  }

  block += `### Notes\n\n- (Add notes after cooking — what worked, what to tweak, "For Following Week" ideas: ...)\n\n---\n\n`;

  // Insert after the first heading line in meal-history.md
  const insertAfter = '---\n\n';
  const insertIdx = existingHistory.indexOf(insertAfter);
  let updatedHistory;
  if (insertIdx !== -1) {
    updatedHistory =
      existingHistory.slice(0, insertIdx + insertAfter.length) +
      block +
      existingHistory.slice(insertIdx + insertAfter.length);
  } else {
    // Fallback: prepend after the first blank line
    updatedHistory = existingHistory.replace(/\n\n/, '\n\n' + block);
  }

  writeFileSync(historyPath, updatedHistory);
  console.log('  ✅  meal-history.md updated');
}

// ─── Done ─────────────────────────────────────────────────────────────────────

console.log('\n🎉  All done! The dashboard is ready for this week.\n');
console.log('Start the dashboard:  npm start\n');
console.log('─'.repeat(62));
console.log('Files updated this week:');
console.log(`  menus/${weekOf}-menu.md`);
console.log(`  shopping-lists/${weekOf}-shopping-list.md`);
console.log('  meals-ingredients.json');
console.log('  data.json');
console.log('  menus/index.json');
console.log('  meal-history.md');
console.log('─'.repeat(62) + '\n');
