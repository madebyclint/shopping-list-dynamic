# Weekly Menu System — Instructions

> **What this file is.** The house rules and output format for generating a weekly meal
> plan. The `get_meal_history` MCP tool returns this file **in full**, so everything here
> becomes context for every plan. Keep it about *planning* — setup, deployment, and
> connector instructions live in [README.md](README.md), deliberately not here.

---

## House Rules

> These apply to every meal plan by default. Only deviate when explicitly stated.

Family of 4 in Brooklyn (2 teens), shopping at small independent markets — costs run
higher than typical chain-store estimates.

- **5 dinners + 1 breakfast** per week, each under 1 hour (~30 min ideal), budget-friendly
- **Tuesday = ≤20 min** — we get home at 8pm. Mac and cheese, hot dogs, quesadillas,
  charcuterie board, ramen, grilled cheese. No-cook is fine but not required — speed wins.
- **Thursday = teen-cooked** — the teens make it themselves, so simple with clear steps
  (tacos, pasta, stir fry, sheet pan)
- **Diverse cuisines**, no repeats within a week, and no repeats from the last 4–6 weeks
  unless explicitly requested. Think outside the box; don't be shy about non-mainstream.
- **No pork.** Substitute beef, turkey, chicken, or veggie in every recipe — silently, no
  need to prompt. Note in the recipe when the traditional version uses pork.
  - Beef hot dogs / beef kielbasa → replaces pork sausage (linguiça, chorizo, etc.)
  - Deli turkey → replaces deli ham · Turkey or beef bacon → replaces bacon
- **No lard** — use vegetable shortening or butter
- **Reduce, don't eliminate, high-FODMAP ingredients** — onions, garlic, beans, lentils,
  apples, cruciferous veg (broccoli, cauliflower, cabbage). Don't lead with them.
- **Protein + veggie in every meal**, half the plate vegetables, **a fresh fruit side**
  paired to the cuisine where possible, sensible portions
- **Lighter weeknight dinners** — the family walks after dinner, so nothing that needs
  recovery time
- **Maggi beef ribs are always all-beef** — Julian's preference, never substitute

### Plate Structure

- **4 of 5 dinners** — protein-and-veg forward, with **no grains or legumes baked into the
  main dish**. Include **one optional carb side for the kids** (rice, pasta, bread) that is
  served separately and easy to skip.
- **1 of 5 dinners** — a normal full meal, grains or legumes included in the dish, no
  restriction. Say which day this is when presenting the plan.
- **Fish in 2 of the 5 dinners** where possible — fresh or canned
- **Dairy is unrestricted** throughout

### Health Goals

> Soft guidelines, not hard rules. A great diverse meal that misses a box is still a good
> meal — apply judgment.

- Season with herbs and acid (citrus, vinegar) rather than leaning on salty sauces, heavy
  broths, or condiment-heavy dishes
- Work in ginger, lemon/lime, banana, avocado, and sweet potato where they fit naturally
- Protein at every meal — chicken, turkey, fish, eggs, Greek yogurt, cottage cheese, legumes
- Skip carbonated drinks as meal pairings, and go easy on juice and sweetened drinks

---

## Generating a New Week

The dashboard reads everything **from the database**. The MCP connector writes to it
directly, so the whole flow happens in one conversation with no files to edit and no
migration step. (See [README.md](README.md) to connect it.)

**1. Read context first — always, before drafting.**

| Tool | Why |
|------|-----|
| `get_meal_history` | Recent meals to avoid repeating, plus these house rules |
| `get_planning_notes` | Open notes for this week ("use up the salmon", "traveling Thu–Fri") |

**2. Present for approval — do not skip to writing.**

- 5 dinners + 1 breakfast, one line each: name, key components, estimated time
- Label **Tuesday (fast)**, **Thursday (teen prep)**, and which day is the **full meal**
- If 1–3 meals were requested, **fill in the rest** to reach 5 + 1 — never a partial plan.
  Place requested meals on the day that fits (Tuesday fast, Thursday teen-prep), otherwise
  the most logical day. Fill-ins follow every rule above.

**3. After approval, write it with `import_new_week`.**

This rolls the current week into "last week", writes the new menu and shopping list,
updates the meal cards, and resolves the planning notes it incorporated — in one call.

| Argument | Notes |
|----------|-------|
| `weekDate` | **Monday** of the new week, `YYYY-MM-DD` |
| `weekLabel` | e.g. `"Mon Aug 10 - Fri Aug 14, 2026"` |
| `shoppingDate` | Day of the trip, `YYYY-MM-DD` |
| `meals` | 5 objects: `{ name, day, emoji, time, tag, tagType }` |
| `menuMd` | Full menu markdown — Quick Glance + Deeper View (format below) |
| `shoppingListMd` | Full categorized shopping list markdown (format below) |
| `mealsIngredients` | `{ week, meals: [{ name, day, emoji, buy_these, pantry }] }` |
| `mealHistoryEntry` | Markdown block prepended to the meal history |
| `resolvedNoteIds` | Note ids actually incorporated. Omit to resolve all open notes. |

> ⚠️ **`import_new_week` writes live** — there is no dry-run, and it rolls the current week
> into "last week". Get approval at step 2 first.
>
> ⚠️ **`mealsIngredients` is a full replacement, not an append.** A partial payload
> silently drops the rest of the week from the X-Ray panel.

`tagType` values: `"fast"` (Tuesday), `"teen"` (Thursday), `"special"` (holiday/occasion),
`""` (none). `tag` is the display label — `"FAST"`, `"TEEN PREP"`, `"BRUNCH"`.

`name` must match between `meals` and `mealsIngredients` (avoid `/` in names, use `()`),
since the X-Ray panel matches on the slugified name.

### During the Week

- **Adding to the cart** — call `get_this_week` first so you know what's already on the
  list, then `add_shopping_item`. It flags likely duplicates instead of silently adding;
  only pass `force: true` after the user confirms.
- **Checking items off** — `update_shopping_item` works on **ad-hoc items only**.
  Originally-planned menu ingredients get checked off in the app while shopping.
- **Parking an idea** — `add_planning_note` puts it in front of next week's plan.

### Changing a Meal Mid-Week

Ask for the current state with `get_this_week`, then edit only what's affected: the meal's
Deeper View section (Ingredients Used + Cooking Overview), its Quick Glance one-liner if the
description changed, the affected shopping-list line items plus that category's subtotal and
the grand total, and the meal's `buy_these`/`pantry` arrays. Don't regenerate the week.

---

## Output Format

### Section A: Quick Glance

```
## Quick Glance Meals

### This Week
- [Meal Name] — [key sides/components] — [fruit] — [time] min
- [Meal Name] — [key sides/components] — [time] min
...

### For Following Week
(optional — ideas or holdovers)
```

### Section B: Deeper View

```
## Deeper View

**[Meal Name]** *([Day, Date])*
Total time: ~X min · Approx calories: ~XXX per adult

**Ingredients Used**

- Item
- Item
- [Fruit] (served on the side)
...

**Cooking Overview**

1. Step one
2. Step two
[Use numbered steps for all cooking overviews. Only include specific temps/times for baking.]
```

> **Format rules for Deeper View:**
> - Title and day/date on the **same line**: `**Meal Name** *(Day, Date)*`
> - Total time and calories on the **same line**, separated by ` · `
> - Always add a blank line after `**Ingredients Used**` and `**Cooking Overview**` before the list
> - Use numbered steps (`1.`, `2.`, etc.) for all cooking overviews
> - Always include a fruit as a side in the ingredients list
> - Mark the kids' optional carb side clearly, so it reads as skippable

### Section C: Shopping List

```
## Shopping List — Week of [DATE] — $XXX.XX

🥬 PRODUCE
- [Item] — [Meal Name or pantry/weekly] — [qty] [unit] — $[unit price] — $[total]
...
Category Subtotal: $XX.XX

---

🥩 REFRIGERATED / PROTEIN
- [Item] — [Meal Name or pantry/weekly] — [qty] [unit] — $[unit price] — $[total]
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
- Combine ingredients across meals (recipe A needs 3 eggs + recipe B needs 2 → 1 dozen)
- Use standard `- ` list items (no special bullet characters)
- Include category subtotals
- Include the weekly recurring items (see below)
- **Every line item must include the meal it is for** — `— [Meal Name]` after the quantity.
  Multiple meals: list them all (`— Pinakbet + Sopa de Lima`). Staples with no meal use
  `— weekly`. Never leave a bare item with no meal context — this is critical while shopping.
- **Never list chips generically as "Chips (N bags)"** — always specify the type (tortilla,
  salt & vinegar, kettle) on each line. Note the meal if a type serves one, or `— snacking`.

#### Shopping List Audit (Required Before Finalizing)

After drafting the list, do a line-by-line pass through every meal's **Ingredients Used**
and verify each item is accounted for:

- **On the list** → no action
- **Pantry staple** → confirm it's absent from the list, no action
- **Optional ingredient** ("optional", "if desired", "pantry or pick up") → make an explicit
  decision: add it, or note it as skipped. Do not silently omit it.
- **Missing and not a pantry staple** → add it

This catches fresh herbs, lemons, parmesan, and garnishes that appear in a recipe but never
make it to the shopping list.

### Section D: Shopping List by Trip

```
## Shopping List by Trip

### [Store Name] *(e.g. Ideal Foods, H Mart, New Ronson Drug)*

**— Produce —**
- Item (qty) — Meal Name

**— Proteins —**
- Item (qty) — Meal Name

**— Dairy —**
- Item (qty) — Meal Name

**— Aisles —**
- Item (qty) — Meal Name or weekly

**— Household —**
- Item (qty) — weekly

### [Second Store, if needed]
- Item (qty) — Meal Name
```

> **Critical rule for Section D:** every item in the by-trip checklist must include the meal
> name — `[Item] — [Meal Name]`. This is the list used during actual grocery shopping.
> "Corn, canned" with no context is useless at the store; "Corn, canned (3 cans) — Esquites"
> is not. Never emit a bare item. Spans meals? List them. Staple or snack with no meal?
> Write `— weekly` or `— snacking`.

---

## Pantry Staples (Always On Hand — Do Not Add to Shopping List)

- Olive oil, vegetable oil, canola oil
- Butter
- Vegetable shortening *(the lard substitute)*
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

Never put pantry staples in a meal's `buy_these` — they'd show as permanently "missing" in
the X-Ray panel, since they never appear on the shopping list.

---

## Weekly Recurring Items

**Always include these every week**, under the appropriate categories:

| Item | Qty | Unit | Est. Unit Cost | Est. Total |
|------|-----|------|----------------|------------|
| Chips | 2 | bags | $3.79 ea | $7.58 |
| Lactaid whole milk | 1 | ½ gallon | ~$5.50 | ~$5.50 |
| Almond milk | 1 | gallon | ~$10.00 | ~$10.00 |
| Cereal | 2 | boxes | ~$5.00 | ~$10.00 |
| Eggs | 1 | dozen | $6.50 | $6.50 |
| Fruit (assorted) | — | assorted | — | ~$10–$15 |
| Trail mix | 1 | bag | ~$6.00 | ~$6.00 |

> **Chips:** always specify the type per bag (tortilla, salt & vinegar, kettle). Note which
> meal each bag serves if applicable. Never list as a bare "Chips".

**Household & treats** — include unless told otherwise; drop these first when the week needs
to come in cheaper:

| Item | Qty | Unit | Est. Unit Cost | Est. Total |
|------|-----|------|----------------|------------|
| Ice cream | 1 | container | ~$5.00 | ~$5.00 |
| Mango juice | 1 | bottle/carton | $5.99 | $5.99 |
| Condensed milk | 1 | can | $3.79 | $3.79 |
| Toilet paper | 1 | pack | ~$8.00 | ~$8.00 |
| Paper towels | 1 | pack | ~$5.00 | ~$5.00 |

---

## Markdown Formatting Notes

> These keep the files rendering correctly in the dashboard and in markdown previews.

- **Always use `- ` for list items** — never `○` or other characters as bullet replacements;
  they don't render as proper list items
- **Add a blank line after bold labels** (`**Ingredients Used**`, `**Cooking Overview**`)
  before any list or paragraph that follows — without it the list collapses into the label
- **Numbered lists** also need a blank line before them if preceded by a bold label
- **Italic text** (`*text*`, `*(text)*`) must not have a space after the opening `*` or
  before the closing `*`
- **Bold labels mid-paragraph** (`**Method:**`) are fine inline — only add a blank line if
  the next content is a list or new block

---

## Post-Shopping Audit (Do After Every Trip)

### Step 1 — Provide the receipts

Drop them into `uploads/receipts/YYYY-MM-DD/`:

- PDF scans of each receipt
- The OCR text file if the scanner generates one (e.g. `text-XXXXXXXX-1.txt`)
- Context for unlabeled items (notes, photos, or verbally — "the $16 receipt is for chia
  seeds from 1426 St Johns")

### Step 2 — Run the audit prompt

---

I just got back from shopping. Receipts are in `uploads/receipts/YYYY-MM-DD/`. Please:

1. **Cross-reference** the OCR text against the receipt PDFs and any context I provide
2. **Update `price-list.md`** — add new items, update changed prices, note vendor and date
3. **Create a shopping audit** in `shopping-audits/YYYY-MM-DD-audit.md` with: total spent vs
   list estimate; breakdown by store; table of on-list items (estimated vs actual); table of
   extras not on the list, with amounts; price variance summary; notes and observations
4. **Create `shopping-audits/YYYY-MM-DD-audit.json`** with `week`, `shopping_date`,
   `list_estimate`, `total_spent`, `variance`, `by_store`, `on_list_total_est`,
   `extras_total_est`, `extras_breakdown`, `category_spending`, and a `price_updates` array
   (item, old_price, new_price, delta)
5. **Update `shopping-audits/price-history.json`** — for every item on the receipts, append
   `{ date, price, confirmed, source }` to its `history` array; add new items as new entries.
   This is what keeps the trend charts current.
6. **Note** anything that should change future estimates (recurring item prices, planning
   notes)

**Context for this trip:** [PASTE ANY ITEM NOTES HERE]

---

Name audit files with the **shopping date**, not the Monday menu date:
`shopping-audits/2026-03-14-audit.md` and `.json`.

Audit files live on disk, so push them to the database when you're done:

```bash
npm run migrate
```

---

## Notes

- **Store:** primarily one Brooklyn market, occasionally a second
- **File naming:** use the Monday of that week's date — `menus/2026-03-16-menu.md`,
  `shopping-lists/2026-03-16-shopping-list.md`
- **Meal ratings:** planned for a future iteration
- **Legacy file-based flow:** before the MCP connector, a new week meant hand-editing
  `data.json`, `menus/index.json`, `meals-ingredients.json`, and the menu/list markdown, then
  running `npm run migrate` to push them to the database. `import_new_week` does all of that
  in one call. The files and the migrate script still work as a fallback if the connector is
  down — see [README.md](README.md) for diagnosing that.
