# Weekly Menu System — Instructions

## How This Works

Each week, a new meal plan is generated and saved to this directory:

- `menus/YYYY-MM-DD-menu.md` — Quick Glance + Deep Dive for the week (use Monday's date)
- `shopping-lists/YYYY-MM-DD-shopping-list.md` — Full shopping list for the week
- `price-list.md` — Ongoing price reference, update as prices change
- `meal-history.md` — Running log of past weekly menus (to avoid repeats)

---

## The Prompt

Use the following prompt to generate a new weekly meal plan:

---

I need a meal plan for the next week. Here is the criteria:

1. Needs to be 5 dinners to cook + 1 breakfast
2. Keep them to under an hour to make, preferably closer to 30 min
3. Keep them budget friendly
4. Diversify the meals (cuisine) and don't be shy about non-mainstream — think outside the box
5. Rainbow plate mentality if possible with always a serving of veggie or fruit and protein. Veggie proteins are ok too.
6. If we do pork, we need to do a pork portion and a non-pork portion for a couple family members.
7. We are a family of 4 with two teens
8. **Tuesday must be a super fast no-cook or minimal-cook meal** — we get home at 8pm. Think hot dogs, mac and cheese, charcuterie board, quesadillas, etc.
9. **Thursday must be a kid-friendly prep meal** — the teens make it themselves. Keep it simple with clear steps (tacos, pasta, stir fry, sheet pan, etc.)

**Context to include with prompt:**
- Paste in recent entries from `meal-history.md` to avoid repeating recent meals
- **Avoid repeating meals from the last 4–6 weeks unless explicitly requested**
- **Avoid repeating the same cuisine twice in one week when possible**
- Reference `price-list.md` for current Brooklyn market prices
- We are in Brooklyn buying at small markets, so costs are higher than typical
- See Pantry Staples section below — do not add those to shopping list
- See Weekly Recurring Items section below — always include those in shopping list

---

## Output Format

### Step 1 — Meal Plan Approval

Present meals for approval first before generating full output:
- 5 dinners + 1 breakfast
- Brief one-liner per meal: name, key components, estimated time
- Label which meal is **Tuesday (fast/easy)** and which is **Thursday (kids prep)**

### Step 2 — After Approval, Generate These Sections

#### Section A: Quick Glance

```
## Quick Glance Meals

### This Week
○ [Meal Name] — [key sides/components] — [time] min
○ [Meal Name] — [key sides/components] — [time] min
...

### For Following Week
(optional — ideas or holdovers)
```

#### Section B: Deeper View

```
## Deeper View

**[Meal Name]**

Total time: ~X minutes
Approx calories: ~XXX per adult serving

**Ingredients Used**
- Item
- Item
...

**Cooking Overview**
[High-level steps in short paragraphs. Only include specific temps/times for baking.]
```

#### Section C: Shopping List

```
## Shopping List — Week of [DATE] — $XXX.XX

🥬 PRODUCE
○ [Item] — [meal] — [qty] [unit] — $[unit price] — $[total]
...
Category Subtotal: $XX.XX

---

🥩 REFRIGERATED / PROTEIN
○ [Item] — [meal] — [qty] [unit] — $[unit price] — $[total]
...
Category Subtotal: $XX.XX

---

🥖 DELI / BAKERY
...

❄️ FROZEN
...

🛒 AISLES
...

🌏 ASIAN / SPECIALTY
...

🧻 OTHER
...

---
**Total: $XXX.XX**
```

Rules:
- Combine ingredients across meals (e.g., recipe A needs 3 eggs + recipe B needs 2 → list as 1 dozen)
- Use ○ (open circle) for unchecked items
- Include category subtotals
- Include weekly recurring items (see below)

#### Section D: Shopping by Trip

```
## Shopping List by Trip

### Meals
○ [items needed specifically for this week's meals]

### Pantry / Weekly
○ [recurring weekly items — chips, milk, cereal, eggs, fruit, etc.]

### Other (Non-Food)
○ [toilet paper, paper towels, etc.]
```

---

## Pantry Staples (Always On Hand — Do Not Add to Shopping List)

- Olive oil, vegetable oil, canola oil
- Soy sauce, fish sauce, rice vinegar, sesame oil
- Chicken broth, vegetable broth
- Salt, black pepper, red pepper flakes
- Cumin, paprika, chili powder, garlic powder, oregano, turmeric, coriander, cinnamon
- Bay leaves
- Jasmine rice *(note if running low)*
- All-purpose flour, sugar
- Canned tomatoes, tomato paste
- Canned chickpeas, black beans, kidney beans
- Couscous *(note if running low)*
- Pasta *(note if running low)*
- Hot sauce, Worcestershire sauce, ketchup
- Garlic (fresh), ginger (fresh)

---

## Weekly Recurring Items (Always Include in Shopping List)

Add these every week under the appropriate categories:

| Item | Qty | Unit | Est. Unit Cost | Est. Total |
|------|-----|------|----------------|------------|
| Chips | 2 | bags | $4.50 | $9.00 |
| Cereal | 2 | boxes | ~$5.00 | ~$10.00 |
| Lactaid milk | 1 | gallon | $7.50 | $7.50 |
| Almond milk | 1 | ½ gallon | $4.50 | $4.50 |
| Fruit (assorted) | — | assorted | — | ~$10–$15 |
| Eggs | 1 | dozen | $6.50 | $6.50 |
| Ice cream | 1 | container | ~$5.00 | ~$5.00 |
| Trail mix | 1 | bag | ~$6.00 | ~$6.00 |
| Toilet paper | 1 | pack | ~$8.00 | ~$8.00 |
| Paper towels | 1 | pack | ~$5.00 | ~$5.00 |

---

## Notes

- **Store:** Primarily one Brooklyn market; occasionally a second
- **Pork rule:** When pork is included, always suggest a non-pork alternative portion
- **Meal ratings:** Planned for a future iteration — will add to `meal-history.md` when ready
- **File naming:** Use the Monday of that week's date for file names
  - Menu: `menus/2026-03-16-menu.md`
  - Shopping list: `shopping-lists/2026-03-16-shopping-list.md`
