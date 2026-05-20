#!/usr/bin/env node
/**
 * One-shot seed: inserts salsa macha pantry recipe + camping event.
 * Run: node weekly-menus-manually-generated/scripts/seed-pantry-and-camping.mjs
 */
import { fileURLToPath } from 'url';
import path from 'path';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: new URL('../../.env.local', import.meta.url).pathname });

const DB_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!DB_URL) throw new Error('No POSTGRES_URL / DATABASE_URL in environment');

const pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

// ── Salsa Macha recipe ─────────────────────────────────────────────────────────
const SALSA_MACHA_MD = `## Ingredients

- 1 cup canola oil
- 40 dried chiles de árbol, stemmed (seeds left in)
- 6 cloves garlic, peeled
- 3 tbsp sesame seeds
- 1 tsp fine salt

---

## Instructions

1. **Prep the chiles** — Keep the seeds in — they're essential for the heat level. You can leave the chiles whole or tear them roughly in half.

2. **Fry the garlic** — Warm the oil in a small saucepan over medium-low heat. Add garlic and fry gently, stirring occasionally, until golden and fragrant — about 3 minutes. Don't let it brown too dark. Remove with a slotted spoon and set aside.

3. **Toast sesame seeds** — Add sesame seeds to the same oil. Stir constantly for about 45–60 seconds until lightly golden. Remove and set aside. Watch carefully — sesame seeds burn fast.

4. **Fry the chiles** — Add all the chiles to the oil. Fry over medium-low heat, stirring constantly, for 1–2 minutes. They should turn a deeper brick red and smell smoky-toasty. Pull them the moment they start to darken — burnt árbol turns bitter fast. Remove pan from heat and let the oil cool for 15 minutes.

5. **Pulse to texture** — Transfer the chiles, garlic, sesame seeds, and all the oil to a blender. Add the salt. Pulse 4–6 times for a rustic, chunky texture — you want visible chile flakes and sesame seeds, not a smooth purée.

6. **Season & store** — Taste and adjust salt. Transfer to a jar — the salsa should be well-submerged in oil. Keeps in the fridge for up to 6 weeks. The heat mellows very slightly after a couple days.
`;

const SALSA_MACHA_NOTES = `- **Heat level:** 40 chiles de árbol with seeds lands around 3/4 picante. For 2/4, use 25 chiles and remove most seeds. For full fire, go 50+.
- **Seeds in or out:** Leaving seeds in is key to reaching that 3/4 heat level. Remove half for a slightly smoother burn.
- **Texture:** La Villana's is chunky/rustic — a few short pulses is the move. Don't fully blend or it becomes a paste.
- **Oil:** Canola keeps the flavor clean and chile-forward. Don't substitute olive oil — it'll compete.
- **Source:** Inspired by La Villana (Mexico City). Prep: 10 min · Cook: 15 min.`;

const SALSA_MACHA_INGREDIENTS = [
  { amount: '1 cup',    name: 'canola oil' },
  { amount: '40',       name: 'dried chiles de árbol, stemmed (seeds left in)' },
  { amount: '6 cloves', name: 'garlic, peeled' },
  { amount: '3 tbsp',   name: 'sesame seeds' },
  { amount: '1 tsp',    name: 'fine salt' },
];

// ── Camping event ──────────────────────────────────────────────────────────────
// Weekend of May 23–25, 2026
const CAMPING_PACKING_MD = `## 🏕️ Camping Gear

- [ ] Tent + stakes + footprint
- [ ] Sleeping bags (2 adults, 2 teens)
- [ ] Sleeping pads / air mattresses
- [ ] Pillows
- [ ] Headlamps + extra batteries
- [ ] Camp chairs (4)
- [ ] Folding table
- [ ] Lantern + fuel
- [ ] Camp stove + fuel canisters
- [ ] Lighter / matches (waterproof)
- [ ] Firewood or fire starters
- [ ] Hatchet / knife
- [ ] Tarp (extra)
- [ ] Rope / paracord
- [ ] Mallet for stakes

## 🍳 Kitchen & Cooking

- [ ] Cast iron skillet or camp pan
- [ ] Pot (for boiling)
- [ ] Camp cooking utensils (spatula, tongs, ladle)
- [ ] Plates, bowls, cups (4 sets)
- [ ] Silverware (4 sets)
- [ ] Cutting board
- [ ] Sharp knife
- [ ] Can opener
- [ ] Dish soap + sponge
- [ ] Wash basin or collapsible tub
- [ ] Paper towels
- [ ] Aluminum foil
- [ ] Zip-lock bags (various sizes)
- [ ] Trash bags
- [ ] Cooler + ice
- [ ] Water jugs (1–2 gal)

## 🩹 Safety & First Aid

- [ ] First aid kit
- [ ] Sunscreen (SPF 50+)
- [ ] Bug spray / DEET
- [ ] Hand sanitizer
- [ ] Toilet paper + trowel
- [ ] Wet wipes

## 🎒 Personal

- [ ] Clothing layers (it gets cold at night)
- [ ] Rain jacket (everyone)
- [ ] Sturdy shoes / hiking boots
- [ ] Sandals for camp
- [ ] Towels (quick-dry)
- [ ] Swimwear (if there's water nearby)
- [ ] Sunglasses + hats
- [ ] Phone charger / power bank

## 📱 Activities & Extras

- [ ] Trail maps / park info downloaded offline
- [ ] Cards / games
- [ ] S'mores supplies (graham crackers, chocolate, marshmallows)
- [ ] Camera or charged phones
`;

const CAMPING_NOTES = `Camping weekend May 23–25, 2026. Menu TBD — generate a simple camp-friendly meal plan.

**Camp cooking notes:**
- Keep it simple — one-pot meals, foil packets, grill over fire
- No meals requiring oven
- Pack non-perishables for Day 3 breakfast/lunch (drive home day)
- Snacks are key — trail mix, fruit, cheese & crackers
`;

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Ensure pantry_recipes table exists (safe — server will also do this)
    await client.query(`
      CREATE TABLE IF NOT EXISTS pantry_recipes (
        id          SERIAL      PRIMARY KEY,
        name        TEXT        NOT NULL,
        category    TEXT,
        yield_desc  TEXT,
        keeps_desc  TEXT,
        recipe_md   TEXT,
        ingredients JSONB       DEFAULT '[]',
        notes       TEXT,
        last_made   TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. Insert salsa macha (upsert by name)
    const existingRecipe = await client.query(
      `SELECT id FROM pantry_recipes WHERE name = 'Salsa Macha (Chile de Árbol)'`,
    );
    if (existingRecipe.rows.length) {
      console.log('⏭  Salsa Macha already exists in pantry_recipes — skipping insert');
    } else {
      await client.query(
        `INSERT INTO pantry_recipes (name, category, yield_desc, keeps_desc, recipe_md, ingredients, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          'Salsa Macha (Chile de Árbol)',
          'Condiment',
          '~1 cup (~8 servings)',
          '6 weeks, refrigerated',
          SALSA_MACHA_MD,
          JSON.stringify(SALSA_MACHA_INGREDIENTS),
          SALSA_MACHA_NOTES,
        ],
      );
      console.log('✓ Salsa Macha inserted into pantry_recipes');
    }

    // 3. Ensure packing_list_md column exists on special_events
    await client.query(`
      ALTER TABLE special_events ADD COLUMN IF NOT EXISTS packing_list_md TEXT;
    `);

    // 4. Create camping event (skip if slug already exists)
    const campingSlug = '2026-05-23-camping-trip';
    const existingEvent = await client.query(
      `SELECT id FROM special_events WHERE slug = $1`, [campingSlug],
    );
    if (existingEvent.rows.length) {
      console.log('⏭  Camping event already exists — skipping insert');
    } else {
      await client.query(
        `INSERT INTO special_events (name, date, slug, week, budget, packing_list_md, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          'Camping Trip',
          '2026-05-23',
          campingSlug,
          '2026-05-18',   // associated week (this week)
          150.00,
          CAMPING_PACKING_MD,
          CAMPING_NOTES,
        ],
      );
      console.log('✓ Camping Trip event created');
    }

    await client.query('COMMIT');
    console.log('\n✅ All done.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed, rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
