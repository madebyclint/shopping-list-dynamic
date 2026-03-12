-- Migration: Add Post-Shopping Feedback Tables for Existing Schema
-- Date: 2026-02-02
-- Description: Add feedback system tables compatible with existing grocery app schema

BEGIN;

-- Main feedback table (tied to grocery_lists instead of shopping_sessions)
CREATE TABLE IF NOT EXISTS shopping_feedback (
    id SERIAL PRIMARY KEY,
    grocery_list_id INTEGER REFERENCES grocery_lists(id) ON DELETE CASCADE,
    receipt_id INTEGER REFERENCES receipts(id) ON DELETE SET NULL,
    overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
    improvement_suggestions TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Over-shopping feedback (items that were bought unnecessarily)
CREATE TABLE IF NOT EXISTS over_shopping_feedback (
    id SERIAL PRIMARY KEY,
    feedback_id INTEGER REFERENCES shopping_feedback(id) ON DELETE CASCADE,
    item_name VARCHAR(200) NOT NULL, -- Store item name from receipt or manual entry
    item_price NUMERIC(8,2),
    reason VARCHAR(100) NOT NULL, -- 'impulse', 'already_had', 'wrong_size', 'duplicate', 'other'
    notes TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Meal planning feedback
CREATE TABLE IF NOT EXISTS meal_planning_feedback (
    id SERIAL PRIMARY KEY,
    feedback_id INTEGER REFERENCES shopping_feedback(id) ON DELETE CASCADE,
    meal_plan_id INTEGER REFERENCES weekly_meal_plans(id) ON DELETE SET NULL,
    planned_too_many_meals BOOLEAN DEFAULT FALSE,
    planned_too_few_meals BOOLEAN DEFAULT FALSE,
    difficulty_rating INTEGER CHECK (difficulty_rating BETWEEN 1 AND 5),
    variety_rating INTEGER CHECK (variety_rating BETWEEN 1 AND 5),
    notes TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Meal-specific feedback and learning
CREATE TABLE IF NOT EXISTS meal_specific_feedback (
    id SERIAL PRIMARY KEY,
    feedback_id INTEGER REFERENCES shopping_feedback(id) ON DELETE CASCADE,
    meal_id INTEGER REFERENCES meals(id) ON DELETE CASCADE,
    notes TEXT,
    learned_tip TEXT, -- e.g., "always buy frozen pizza + toppings instead of from scratch"
    cost_adjustment NUMERIC(6,2), -- actual cost difference from estimated
    would_make_again BOOLEAN,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Cost and budget feedback
CREATE TABLE IF NOT EXISTS cost_feedback (
    id SERIAL PRIMARY KEY,
    feedback_id INTEGER REFERENCES shopping_feedback(id) ON DELETE CASCADE,
    expected_total NUMERIC(10,2),
    actual_total NUMERIC(10,2),
    unexpected_expenses JSONB, -- Array of {itemName, amount, reason}
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Shopping efficiency metrics (for dashboard) - simplified for existing schema
CREATE TABLE IF NOT EXISTS shopping_efficiency_metrics (
    id SERIAL PRIMARY KEY,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    period_type VARCHAR(20) NOT NULL, -- 'weekly', 'monthly'
    
    -- Efficiency metrics
    total_trips INTEGER DEFAULT 0,
    total_planned_items INTEGER DEFAULT 0,
    total_purchased_items INTEGER DEFAULT 0,
    total_over_purchased_items INTEGER DEFAULT 0,
    total_missed_items INTEGER DEFAULT 0,
    
    -- Cost metrics
    total_planned_cost NUMERIC(10,2) DEFAULT 0,
    total_actual_cost NUMERIC(10,2) DEFAULT 0,
    avg_cost_variance NUMERIC(8,2) DEFAULT 0,
    
    -- Learning metrics
    feedback_completion_rate NUMERIC(5,2) DEFAULT 0, -- % of trips with feedback
    meal_repeat_rate NUMERIC(5,2) DEFAULT 0, -- % of meals marked "would make again"
    
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(period_type, period_start)
);

-- Add feedback completion tracking to grocery_lists
ALTER TABLE grocery_lists 
ADD COLUMN IF NOT EXISTS feedback_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMP WITHOUT TIME ZONE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_shopping_feedback_grocery_list ON shopping_feedback(grocery_list_id);
CREATE INDEX IF NOT EXISTS idx_shopping_feedback_receipt ON shopping_feedback(receipt_id);
CREATE INDEX IF NOT EXISTS idx_over_shopping_feedback_feedback ON over_shopping_feedback(feedback_id);
CREATE INDEX IF NOT EXISTS idx_meal_specific_feedback_meal ON meal_specific_feedback(meal_id);
CREATE INDEX IF NOT EXISTS idx_shopping_efficiency_metrics_period ON shopping_efficiency_metrics(period_type, period_start);

COMMIT;