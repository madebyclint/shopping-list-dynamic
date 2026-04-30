// Analytics database functions for purchase tracking, reporting, and pantry suggestions
import { pool } from './index';

export interface PurchaseAnalytics {
  id?: number;
  grocery_list_id: number;
  receipt_id?: number;
  grocery_item_id?: number;
  item_name: string;
  planned_quantity?: string;
  purchased_quantity?: string;
  unit_price?: number;
  total_price?: number;
  food_group_id?: number;
  store_section_id?: number;
  was_planned: boolean;
  was_extra_purchase: boolean;
  was_substitute: boolean;
  purchase_date: string;
  store_name?: string;
}

export interface ReceiptData {
  id?: number;
  grocery_list_id?: number;
  store_name?: string;
  store_address?: string;
  receipt_date?: string;
  receipt_time?: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  payment_method?: string;
  image_url?: string;
  raw_text?: string;
  processed: boolean;
}

export interface SkippedItemAnalytics {
  id?: number;
  grocery_list_id: number;
  grocery_item_id?: number;
  item_name: string;
  planned_quantity?: string;
  estimated_price?: number;
  category?: string;
  meal?: string;
  skip_reason?: string;
  skip_frequency: number;
  planned_date?: string;
  skipped_date?: string;
}

export interface FoodGroup {
  id: number;
  name: string;
  description?: string;
  color?: string;
}

export interface StoreSection {
  id: number;
  name: string;
  description?: string;
  sort_order: number;
}

export interface PantryRecommendation {
  id?: number;
  item_name: string;
  category?: string;
  food_group_id?: number;
  times_purchased: number;
  times_skipped: number;
  avg_quantity?: string;
  avg_price?: number;
  last_purchased?: string;
  last_skipped?: string;
  suggestion_score: number;
  frequency_pattern: string;
  suggested_quantity?: string;
  is_active: boolean;
  added_to_pantry: boolean;
}

// Food Groups Functions
export async function getFoodGroups(): Promise<FoodGroup[]> {
  const result = await pool.query('SELECT * FROM food_groups ORDER BY name');
  return result.rows;
}

export async function getFoodGroupByName(name: string): Promise<FoodGroup | null> {
  const result = await pool.query('SELECT * FROM food_groups WHERE name = $1', [name]);
  return result.rows[0] || null;
}

// Store Sections Functions
export async function getStoreSections(): Promise<StoreSection[]> {
  const result = await pool.query('SELECT * FROM store_sections ORDER BY sort_order, name');
  return result.rows;
}

export async function getStoreSectionByName(name: string): Promise<StoreSection | null> {
  const result = await pool.query('SELECT * FROM store_sections WHERE name = $1', [name]);
  return result.rows[0] || null;
}

// Purchase Analytics Functions
export async function recordPurchase(purchase: PurchaseAnalytics): Promise<number> {
  const result = await pool.query(`
    INSERT INTO purchase_analytics (
      grocery_list_id, receipt_id, grocery_item_id, item_name, 
      planned_quantity, purchased_quantity, unit_price, total_price,
      food_group_id, store_section_id, was_planned, was_extra_purchase, 
      was_substitute, purchase_date, store_name
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING id
  `, [
    purchase.grocery_list_id, purchase.receipt_id, purchase.grocery_item_id,
    purchase.item_name, purchase.planned_quantity, purchase.purchased_quantity,
    purchase.unit_price, purchase.total_price, purchase.food_group_id,
    purchase.store_section_id, purchase.was_planned, purchase.was_extra_purchase,
    purchase.was_substitute, purchase.purchase_date, purchase.store_name
  ]);
  return result.rows[0].id;
}

// Receipt Functions
export async function createReceipt(receipt: ReceiptData): Promise<number> {
  const result = await pool.query(`
    INSERT INTO receipts (
      grocery_list_id, store_name, store_address, receipt_date, receipt_time,
      subtotal, tax, total, payment_method, image_url, raw_text, processed
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id
  `, [
    receipt.grocery_list_id, receipt.store_name, receipt.store_address,
    receipt.receipt_date, receipt.receipt_time, receipt.subtotal, receipt.tax,
    receipt.total, receipt.payment_method, receipt.image_url, receipt.raw_text,
    receipt.processed
  ]);
  return result.rows[0].id;
}

export async function updateReceipt(receiptId: number, updates: Partial<ReceiptData>): Promise<void> {
  const fields = Object.keys(updates).filter(key => updates[key as keyof ReceiptData] !== undefined);
  const values = fields.map(key => updates[key as keyof ReceiptData]);
  const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
  
  if (fields.length > 0) {
    await pool.query(`
      UPDATE receipts SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $${fields.length + 1}
    `, [...values, receiptId]);
  }
}

// Skipped Items Functions
export async function recordSkippedItem(skipped: SkippedItemAnalytics): Promise<number> {
  // First, check if this item has been skipped before
  const existingResult = await pool.query(`
    SELECT id, skip_frequency FROM skipped_items_analytics 
    WHERE item_name = $1 AND grocery_list_id = $2
  `, [skipped.item_name, skipped.grocery_list_id]);

  if (existingResult.rows.length > 0) {
    // Update existing record
    const existingId = existingResult.rows[0].id;
    const newFrequency = existingResult.rows[0].skip_frequency + 1;
    
    await pool.query(`
      UPDATE skipped_items_analytics 
      SET skip_frequency = $1, skipped_date = CURRENT_DATE 
      WHERE id = $2
    `, [newFrequency, existingId]);
    
    return existingId;
  } else {
    // Create new record
    const result = await pool.query(`
      INSERT INTO skipped_items_analytics (
        grocery_list_id, grocery_item_id, item_name, planned_quantity,
        estimated_price, category, meal, skip_reason, skip_frequency,
        planned_date, skipped_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, [
      skipped.grocery_list_id, skipped.grocery_item_id, skipped.item_name,
      skipped.planned_quantity, skipped.estimated_price, skipped.category,
      skipped.meal, skipped.skip_reason, skipped.skip_frequency,
      skipped.planned_date, skipped.skipped_date
    ]);
    
    return result.rows[0].id;
  }
}

// Shopping Trip Summary Functions
export async function createShoppingTripSummary(summary: {
  grocery_list_id: number;
  receipt_id?: number;
  planned_total: number;
  actual_total: number;
  planned_items_count: number;
  purchased_items_count: number;
  extra_items_count: number;
  skipped_items_count: number;
  store_name?: string;
  shopping_date: string;
}): Promise<number> {
  const budgetVariance = summary.actual_total - summary.planned_total;
  const budgetVariancePercent = summary.planned_total > 0 
    ? (budgetVariance / summary.planned_total) * 100 
    : 0;

  const result = await pool.query(`
    INSERT INTO shopping_trip_summary (
      grocery_list_id, receipt_id, planned_total, actual_total, 
      budget_variance, budget_variance_percent, planned_items_count,
      purchased_items_count, extra_items_count, skipped_items_count,
      store_name, shopping_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id
  `, [
    summary.grocery_list_id, summary.receipt_id, summary.planned_total,
    summary.actual_total, budgetVariance, budgetVariancePercent,
    summary.planned_items_count, summary.purchased_items_count,
    summary.extra_items_count, summary.skipped_items_count,
    summary.store_name, summary.shopping_date
  ]);
  
  return result.rows[0].id;
}

// Analytics Reporting Functions
export async function getPurchasesByFoodGroup(
  startDate?: string, 
  endDate?: string
): Promise<Array<{food_group: string; total_amount: number; item_count: number; color?: string}>> {
  let query = `
    SELECT 
      fg.name as food_group,
      fg.color,
      SUM(pa.total_price) as total_amount,
      COUNT(pa.id) as item_count
    FROM purchase_analytics pa
    LEFT JOIN food_groups fg ON pa.food_group_id = fg.id
    WHERE 1=1
  `;
  
  const params: any[] = [];
  
  if (startDate) {
    query += ` AND pa.purchase_date >= $${params.length + 1}`;
    params.push(startDate);
  }
  
  if (endDate) {
    query += ` AND pa.purchase_date <= $${params.length + 1}`;
    params.push(endDate);
  }
  
  query += `
    GROUP BY fg.id, fg.name, fg.color
    ORDER BY total_amount DESC
  `;
  
  const result = await pool.query(query, params);
  return result.rows;
}

export async function getPurchasesByStoreSection(
  startDate?: string, 
  endDate?: string
): Promise<Array<{store_section: string; total_amount: number; item_count: number; sort_order: number}>> {
  let query = `
    SELECT 
      ss.name as store_section,
      ss.sort_order,
      SUM(pa.total_price) as total_amount,
      COUNT(pa.id) as item_count
    FROM purchase_analytics pa
    LEFT JOIN store_sections ss ON pa.store_section_id = ss.id
    WHERE 1=1
  `;
  
  const params: any[] = [];
  
  if (startDate) {
    query += ` AND pa.purchase_date >= $${params.length + 1}`;
    params.push(startDate);
  }
  
  if (endDate) {
    query += ` AND pa.purchase_date <= $${params.length + 1}`;
    params.push(endDate);
  }
  
  query += `
    GROUP BY ss.id, ss.name, ss.sort_order
    ORDER BY ss.sort_order, total_amount DESC
  `;
  
  const result = await pool.query(query, params);
  return result.rows;
}

export async function getExtraPurchasesReport(
  startDate?: string, 
  endDate?: string
): Promise<Array<{
  item_name: string; 
  total_amount: number; 
  quantity_purchased: string;
  times_bought_extra: number;
  avg_extra_cost: number;
}>> {
  let query = `
    SELECT 
      pa.item_name,
      SUM(pa.total_price) as total_amount,
      STRING_AGG(pa.purchased_quantity, ', ') as quantity_purchased,
      COUNT(pa.id) as times_bought_extra,
      AVG(pa.total_price) as avg_extra_cost
    FROM purchase_analytics pa
    WHERE pa.was_extra_purchase = true
  `;
  
  const params: any[] = [];
  
  if (startDate) {
    query += ` AND pa.purchase_date >= $${params.length + 1}`;
    params.push(startDate);
  }
  
  if (endDate) {
    query += ` AND pa.purchase_date <= $${params.length + 1}`;
    params.push(endDate);
  }
  
  query += `
    GROUP BY pa.item_name
    ORDER BY total_amount DESC
  `;
  
  const result = await pool.query(query, params);
  return result.rows;
}

export async function getSkippedItemsReport(
  startDate?: string, 
  endDate?: string
): Promise<Array<{
  item_name: string; 
  category: string;
  times_skipped: number;
  total_missed_value: number;
  most_common_reason: string;
  last_skipped: string;
}>> {
  let query = `
    SELECT 
      sia.item_name,
      sia.category,
      SUM(sia.skip_frequency) as times_skipped,
      SUM(sia.estimated_price * sia.skip_frequency) as total_missed_value,
      MODE() WITHIN GROUP (ORDER BY sia.skip_reason) as most_common_reason,
      MAX(sia.skipped_date) as last_skipped
    FROM skipped_items_analytics sia
    WHERE 1=1
  `;
  
  const params: any[] = [];
  
  if (startDate) {
    query += ` AND sia.skipped_date >= $${params.length + 1}`;
    params.push(startDate);
  }
  
  if (endDate) {
    query += ` AND sia.skipped_date <= $${params.length + 1}`;
    params.push(endDate);
  }
  
  query += `
    GROUP BY sia.item_name, sia.category
    ORDER BY times_skipped DESC, total_missed_value DESC
  `;
  
  const result = await pool.query(query, params);
  return result.rows;
}

export async function getBudgetVarianceReport(
  startDate?: string, 
  endDate?: string
): Promise<Array<{
  shopping_date: string;
  store_name: string;
  planned_total: number;
  actual_total: number;
  budget_variance: number;
  budget_variance_percent: number;
  extra_items_count: number;
  skipped_items_count: number;
}>> {
  let query = `
    SELECT 
      sts.shopping_date,
      sts.store_name,
      sts.planned_total,
      sts.actual_total,
      sts.budget_variance,
      sts.budget_variance_percent,
      sts.extra_items_count,
      sts.skipped_items_count
    FROM shopping_trip_summary sts
    WHERE 1=1
  `;
  
  const params: any[] = [];
  
  if (startDate) {
    query += ` AND sts.shopping_date >= $${params.length + 1}`;
    params.push(startDate);
  }
  
  if (endDate) {
    query += ` AND sts.shopping_date <= $${params.length + 1}`;
    params.push(endDate);
  }
  
  query += ` ORDER BY sts.shopping_date DESC`;
  
  const result = await pool.query(query, params);
  return result.rows;
}

// Pantry Suggestion Functions
export async function updatePantrySuggestions(): Promise<void> {
  // Analyze purchase and skip patterns to generate suggestions
  const analyzeQuery = `
    WITH item_analysis AS (
      SELECT 
        LOWER(TRIM(item_name)) as normalized_name,
        COUNT(CASE WHEN was_planned = true THEN 1 END) as times_purchased,
        COUNT(CASE WHEN was_extra_purchase = true THEN 1 END) as times_bought_extra,
        AVG(total_price) as avg_price,
        MODE() WITHIN GROUP (ORDER BY purchased_quantity) as typical_quantity,
        MAX(purchase_date) as last_purchased,
        food_group_id
      FROM purchase_analytics 
      WHERE purchase_date >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY LOWER(TRIM(item_name)), food_group_id
    ),
    skip_analysis AS (
      SELECT 
        LOWER(TRIM(item_name)) as normalized_name,
        SUM(skip_frequency) as times_skipped,
        MAX(skipped_date) as last_skipped
      FROM skipped_items_analytics
      WHERE skipped_date >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY LOWER(TRIM(item_name))
    )
    SELECT 
      ia.normalized_name,
      COALESCE(ia.times_purchased, 0) as times_purchased,
      COALESCE(sa.times_skipped, 0) as times_skipped,
      ia.typical_quantity,
      ia.avg_price,
      ia.last_purchased,
      sa.last_skipped,
      ia.food_group_id,
      -- Calculate suggestion score (0-100)
      CASE 
        WHEN ia.times_purchased >= 3 AND COALESCE(sa.times_skipped, 0) <= 1 THEN 90
        WHEN ia.times_purchased >= 2 AND COALESCE(sa.times_skipped, 0) <= 2 THEN 75
        WHEN ia.times_purchased >= 1 AND COALESCE(sa.times_skipped, 0) = 0 THEN 60
        ELSE 30
      END as suggestion_score,
      -- Determine frequency pattern
      CASE 
        WHEN ia.times_purchased >= 8 THEN 'weekly'
        WHEN ia.times_purchased >= 4 THEN 'biweekly'
        WHEN ia.times_purchased >= 2 THEN 'monthly'
        ELSE 'irregular'
      END as frequency_pattern
    FROM item_analysis ia
    FULL OUTER JOIN skip_analysis sa ON ia.normalized_name = sa.normalized_name
    WHERE COALESCE(ia.times_purchased, 0) > 0
  `;
  
  const result = await pool.query(analyzeQuery);
  
  // Clear existing suggestions and insert new ones
  await pool.query('DELETE FROM pantry_suggestions WHERE is_active = true');
  
  for (const row of result.rows) {
    await pool.query(`
      INSERT INTO pantry_suggestions (
        item_name, food_group_id, times_purchased, times_skipped,
        avg_quantity, avg_price, last_purchased, last_skipped,
        suggestion_score, frequency_pattern, suggested_quantity, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      row.normalized_name, row.food_group_id, row.times_purchased,
      row.times_skipped, row.typical_quantity, row.avg_price,
      row.last_purchased, row.last_skipped, row.suggestion_score,
      row.frequency_pattern, row.typical_quantity, true
    ]);
  }
}

export async function getPantrySuggestions(
  minScore = 50,
  limit = 20
): Promise<PantryRecommendation[]> {
  const result = await pool.query(`
    SELECT ps.*, fg.name as food_group_name
    FROM pantry_suggestions ps
    LEFT JOIN food_groups fg ON ps.food_group_id = fg.id
    WHERE ps.is_active = true 
      AND ps.suggestion_score >= $1
      AND ps.added_to_pantry = false
    ORDER BY ps.suggestion_score DESC, ps.times_purchased DESC
    LIMIT $2
  `, [minScore, limit]);
  
  return result.rows;
}

export async function markSuggestionAsAdded(suggestionId: number): Promise<void> {
  await pool.query(`
    UPDATE pantry_suggestions 
    SET added_to_pantry = true, updated_at = CURRENT_TIMESTAMP 
    WHERE id = $1
  `, [suggestionId]);
}

// Helper function to auto-categorize items into food groups
export async function categorizePurchaseItem(itemName: string, category?: string): Promise<number | null> {
  const name = itemName.toLowerCase();
  
  // Simple categorization logic based on keywords
  const categories = [
    { id: 1, keywords: ['apple', 'banana', 'orange', 'lettuce', 'carrot', 'broccoli', 'spinach', 'tomato', 'onion', 'pepper'] },
    { id: 2, keywords: ['bread', 'pasta', 'rice', 'cereal', 'oat', 'flour', 'quinoa'] },
    { id: 3, keywords: ['chicken', 'beef', 'pork', 'fish', 'turkey', 'bean', 'lentil', 'tofu', 'egg'] },
    { id: 4, keywords: ['milk', 'cheese', 'yogurt', 'butter'] },
    { id: 5, keywords: ['oil', 'olive oil', 'coconut oil', 'nuts', 'avocado'] },
    { id: 6, keywords: ['juice', 'soda', 'water', 'coffee', 'tea', 'beer', 'wine'] },
    { id: 7, keywords: ['chips', 'candy', 'cookie', 'cake', 'ice cream'] },
    { id: 8, keywords: ['sauce', 'spice', 'herb', 'vinegar', 'salt', 'pepper', 'garlic'] }
  ];
  
  for (const cat of categories) {
    if (cat.keywords.some(keyword => name.includes(keyword))) {
      return cat.id;
    }
  }
  
  return 9; // Default to "Other"
}