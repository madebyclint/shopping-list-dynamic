#!/usr/bin/env node
/**
 * One-shot update: adds menu + shopping list to the Camping Trip event.
 * Run: node weekly-menus-manually-generated/scripts/update-camping-menu.mjs
 */
import { fileURLToPath } from 'url';
import path from 'path';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: new URL('../../.env.local', import.meta.url).pathname });

const DB_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!DB_URL) throw new Error('No POSTGRES_URL / DATABASE_URL in environment');

const pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

const SHOPPING_LIST_MD = `# Camping Trip — Shopping List (May 23–25, 2026)

> Pick up perishables day-of or the night before. Keep everything in the cooler.

---

🌭 **PROTEINS**
- Hot dogs (1 pack)
- Hot dog buns (1 pack)
- Sausages (1 pack)
- Rotisserie chicken *or* Asian beef meatballs (1 pack)
- Selection of meats — non-pork (salami, turkey, prosciutto, etc.)

🧀 **DAIRY & REFRIGERATED**
- Cream cheese (1 block)
- Selection of cheeses (2–3 types — cheddar, gouda, brie, etc.)

🥬 **PRODUCE & FRESH**
- Grapes (1 bunch)
- Fruit × 3 days (bananas, apples, berries — whatever travels well)

🛒 **PANTRY & DRY GOODS**
- Instant ramen packs (4–6)
- Frozen mixed veggies (1–2 bags — keep in cooler)
- Bagels (1 pack)
- Crackers (1–2 boxes — sturdy, for charcuterie)
- Pickles (1 jar)
- Olives (1 jar or container)
- Chips (2 bags)
- Trail mix (1 large bag)

🔥 **S'MORES**
- Graham crackers (1 box)
- Marshmallows (1 bag)
- Chocolate bars (4–6 bars — Hershey's)

🥤 **DRINKS**
- Capri Sun (1 pack)
- Sparkling water (1 case / 12-pack)
- Beer (1 six-pack or more)

🧴 **CONDIMENTS**
- Ketchup
- Mustard
- Hot dog toppings (relish, onions, hot sauce — whatever you like)

---

| Category | Est. Total |
|---|---|
| Proteins | ~$25 |
| Dairy | ~$15 |
| Produce | ~$15 |
| Pantry & Snacks | ~$30 |
| S'mores | ~$10 |
| Drinks | ~$20 |
| Condiments | ~$10 |
| **GRAND TOTAL** | **~$125** |
`;

const MENU_MD = `# Camping Trip — Menu (May 23–25, 2026)

## 🗓 Meal Plan

| Meal | What |
|---|---|
| **Sat dinner** | Hot dogs · chips · fruit |
| **Sun breakfast** | Bagels with cream cheese · fruit |
| **Sun lunch** | Charcuterie board (meats, cheeses, crackers, pickles, olives, grapes) |
| **Sun dinner** | Instant ramen + protein (chicken or meatballs) + frozen veggies · fruit |
| **Mon breakfast** | Sausages · fruit |
| **Every night** | S'mores 🔥 |

---

## 🍳 Cooking Notes

### Hot Dogs *(Sat dinner)*
Grill over fire or on camp stove. Offer all the toppings — ketchup, mustard, relish.
Serve with chips and whatever fruit you brought.

### Bagels + Cream Cheese *(Sun breakfast)*
No cooking needed. Slice, spread, eat. Pair with fruit.

### Charcuterie Board *(Sun lunch)*
Lay everything out on the folding table or a cutting board — meats, cheeses, crackers,
pickles, olives, grapes. No cooking, maximum vibe.

### Ramen + Protein + Veggies *(Sun dinner)*
Boil water on the camp stove. Cook ramen per pack instructions.
Add frozen veggies for the last 2 minutes. Top with sliced rotisserie chicken or meatballs.
One pot, done in 15 minutes.

### Sausages *(Mon breakfast)*
Grill over remaining fire coals or on the camp stove. Serve with fruit.
Keep it simple — you're packing up soon.

### S'mores *(Every night)*
Graham crackers + marshmallow (toasted over the fire) + chocolate bar.
Classic. Non-negotiable.
`;

async function run() {
  const client = await pool.connect();
  try {
    const { rowCount } = await client.query(
      `UPDATE special_events
       SET shopping_list_md = $1, recipes_md = $2
       WHERE slug = '2026-05-23-camping-trip'`,
      [SHOPPING_LIST_MD, MENU_MD],
    );
    if (rowCount === 0) {
      console.error('❌ Camping event not found — run seed-pantry-and-camping.mjs first');
      process.exit(1);
    }
    console.log('✅ Camping Trip updated with menu + shopping list');
  } finally {
    client.release();
    await pool.end();
  }
}

run();
