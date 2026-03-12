-- Migration: Add Post-Shopping Feedback Tables
-- Date: 2026-02-02
-- Description: Add comprehensive feedback system for post-shopping experience

BEGIN;

-- Add feedback completion tracking to shopping_sessions
ALTER TABLE shopping_sessions 
ADD COLUMN IF NOT EXISTS feedback_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMP WITH TIME ZONE;

-- Main feedback table
CREATE TABLE IF NOT EXISTS shopping_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES shopping_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
    improvement_suggestions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(session_id, user_id)
);

-- Over-shopping feedback (items that were bought unnecessarily)
CREATE TABLE IF NOT EXISTS over_shopping_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_id UUID REFERENCES shopping_feedback(id) ON DELETE CASCADE,
    session_item_id UUID, -- References session_items(id) for purchased items
    reason VARCHAR(100) NOT NULL, -- 'impulse', 'already_had', 'wrong_size', 'duplicate', 'other'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Meal planning feedback
CREATE TABLE IF NOT EXISTS meal_planning_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_id UUID REFERENCES shopping_feedback(id) ON DELETE CASCADE,
    planned_too_many_meals BOOLEAN DEFAULT FALSE,
    planned_too_few_meals BOOLEAN DEFAULT FALSE,
    difficulty_rating INTEGER CHECK (difficulty_rating BETWEEN 1 AND 5),
    variety_rating INTEGER CHECK (variety_rating BETWEEN 1 AND 5),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(feedback_id)
);

-- Meal-specific feedback and learning
CREATE TABLE IF NOT EXISTS meal_specific_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_id UUID REFERENCES shopping_feedback(id) ON DELETE CASCADE,
    meal_id UUID REFERENCES meals(id) ON DELETE CASCADE,
    notes TEXT,
    learned_tip TEXT, -- e.g., "always buy frozen pizza + toppings instead of from scratch"
    cost_adjustment DECIMAL(6,2), -- actual cost difference from estimated
    would_make_again BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cost and budget feedback
CREATE TABLE IF NOT EXISTS cost_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_id UUID REFERENCES shopping_feedback(id) ON DELETE CASCADE,
    expected_total DECIMAL(10,2),
    actual_total DECIMAL(10,2),
    unexpected_expenses JSONB, -- Array of {itemName, amount, reason}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(feedback_id)
);

-- Shopping efficiency metrics (for dashboard)
CREATE TABLE IF NOT EXISTS shopping_efficiency_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    period_type VARCHAR(20) NOT NULL, -- 'weekly', 'monthly'
    
    -- Efficiency metrics
    total_sessions INTEGER DEFAULT 0,
    total_planned_items INTEGER DEFAULT 0,
    total_purchased_items INTEGER DEFAULT 0,
    total_over_purchased_items INTEGER DEFAULT 0,
    total_missed_items INTEGER DEFAULT 0,
    
    -- Cost metrics
    total_planned_cost DECIMAL(10,2) DEFAULT 0,
    total_actual_cost DECIMAL(10,2) DEFAULT 0,
    avg_cost_variance DECIMAL(8,2) DEFAULT 0,
    
    -- Learning metrics
    feedback_completion_rate DECIMAL(5,2) DEFAULT 0, -- % of sessions with feedback
    meal_repeat_rate DECIMAL(5,2) DEFAULT 0, -- % of meals marked "would make again"
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(family_id, period_type, period_start)
);

-- Frequently over/under purchased items tracking
CREATE TABLE IF NOT EXISTS item_purchase_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
    
    -- Pattern metrics (last 30 days)
    times_planned INTEGER DEFAULT 0,
    times_purchased INTEGER DEFAULT 0,
    times_over_purchased INTEGER DEFAULT 0, -- bought but not needed
    times_missed INTEGER DEFAULT 0, -- planned but not bought
    
    -- Cost patterns
    avg_planned_cost DECIMAL(8,2),
    avg_actual_cost DECIMAL(8,2),
    cost_variance DECIMAL(8,2),
    
    -- Pattern insights
    purchase_efficiency DECIMAL(5,2), -- purchased/planned ratio
    cost_accuracy DECIMAL(5,2), -- 1 - abs(variance)/planned
    
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(family_id, ingredient_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_shopping_feedback_session ON shopping_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_shopping_feedback_user ON shopping_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_feedback_family ON shopping_feedback(family_id);
CREATE INDEX IF NOT EXISTS idx_over_shopping_feedback_feedback ON over_shopping_feedback(feedback_id);
CREATE INDEX IF NOT EXISTS idx_meal_specific_feedback_meal ON meal_specific_feedback(meal_id);
CREATE INDEX IF NOT EXISTS idx_shopping_efficiency_metrics_family_period ON shopping_efficiency_metrics(family_id, period_type, period_start);
CREATE INDEX IF NOT EXISTS idx_item_purchase_patterns_family_ingredient ON item_purchase_patterns(family_id, ingredient_id);

-- Create trigger to update shopping_efficiency_metrics
CREATE OR REPLACE FUNCTION update_shopping_efficiency_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- This would be implemented to recalculate metrics when feedback is added
    -- For now, we'll handle this in application code
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (commented out for now, can be implemented later)
-- CREATE TRIGGER trigger_update_efficiency_metrics
--     AFTER INSERT OR UPDATE ON shopping_feedback
--     FOR EACH ROW
--     EXECUTE FUNCTION update_shopping_efficiency_metrics();

COMMIT;