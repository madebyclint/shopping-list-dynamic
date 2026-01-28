# Database Schema Design - Meal Planning & Shopping App

## Overview
This document defines the comprehensive database schema for a family meal planning and shopping application that supports AI-generated menus, cost tracking, receipt OCR processing, and budget analytics.

## Core Requirements Summary
- **Family Management**: Support multiple family members with shared meal plans
- **Meal Management**: Store recipes with costs, ratings, and usage tracking
- **Menu Planning**: Weekly meal plans with AI generation and approval workflow
- **Shopping Integration**: Generate categorized shopping lists from menus
- **Receipt Processing**: OCR integration for automatic price updates
- **Cost Tracking**: Historical spending analysis and budget accuracy
- **AI Integration**: Support for historical data analysis and menu suggestions

---

## Database Schema

### 1. User & Family Management

#### `families`
```sql
CREATE TABLE families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    location VARCHAR(100), -- e.g., "Brooklyn, NY"
    family_size INTEGER NOT NULL DEFAULT 4,
    weekly_budget DECIMAL(10,2),
    dietary_preferences TEXT[], -- e.g., ['vegetarian', 'gluten-free']
    dietary_restrictions TEXT[], -- e.g., ['nuts', 'shellfish']
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `users`
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'member', -- 'admin', 'member', 'child'
    dietary_preferences TEXT[],
    dietary_restrictions TEXT[],
    favorite_cuisines TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2. Meal & Recipe Management

#### `categories`
```sql
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL, -- 'meal_type', 'cuisine', 'shopping'
    color VARCHAR(7), -- hex color for UI
    sort_order INTEGER DEFAULT 0
);
```

#### `meals`
```sql
CREATE TABLE meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    cuisine_type VARCHAR(50),
    meal_type VARCHAR(20), -- 'breakfast', 'lunch', 'dinner', 'snack'
    prep_time_minutes INTEGER,
    cook_time_minutes INTEGER,
    servings INTEGER DEFAULT 4,
    instructions TEXT,
    estimated_cost DECIMAL(8,2),
    actual_cost DECIMAL(8,2),
    difficulty_level INTEGER CHECK (difficulty_level BETWEEN 1 AND 5),
    source_url VARCHAR(500),
    image_url VARCHAR(500),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- AI Integration Fields
    ai_generated BOOLEAN DEFAULT FALSE,
    ai_prompt_context TEXT, -- Original prompt used for generation
    
    -- Analytics Fields
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    avg_rating DECIMAL(3,2) DEFAULT 0,
    rating_count INTEGER DEFAULT 0
);
```

#### `ingredients`
```sql
CREATE TABLE ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    category_id UUID REFERENCES categories(id),
    unit VARCHAR(20), -- 'lbs', 'oz', 'cups', 'pieces', etc.
    avg_price_per_unit DECIMAL(8,2),
    perishable BOOLEAN DEFAULT TRUE,
    shelf_life_days INTEGER,
    nutritional_info JSONB, -- calories, protein, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `meal_ingredients` (Junction Table)
```sql
CREATE TABLE meal_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_id UUID REFERENCES meals(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL(8,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    notes VARCHAR(200), -- e.g., "chopped", "optional"
    estimated_cost DECIMAL(6,2),
    UNIQUE(meal_id, ingredient_id)
);
```

### 3. Menu Planning

#### `weekly_menus`
```sql
CREATE TABLE weekly_menus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    name VARCHAR(100),
    week_start_date DATE NOT NULL,
    week_end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'draft', -- 'draft', 'pending_approval', 'approved', 'active', 'completed'
    total_estimated_cost DECIMAL(10,2),
    total_actual_cost DECIMAL(10,2),
    created_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- AI Integration Fields
    ai_generated BOOLEAN DEFAULT FALSE,
    ai_prompt TEXT, -- User's request for AI generation
    ai_context JSONB, -- Previous weeks' data, preferences, etc.
    
    UNIQUE(family_id, week_start_date)
);
```

#### `menu_meals` (Junction Table)
```sql
CREATE TABLE menu_meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id UUID REFERENCES weekly_menus(id) ON DELETE CASCADE,
    meal_id UUID REFERENCES meals(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    meal_type VARCHAR(20) NOT NULL, -- 'breakfast', 'lunch', 'dinner'
    planned_servings INTEGER DEFAULT 4,
    actual_servings INTEGER,
    notes VARCHAR(200),
    UNIQUE(menu_id, scheduled_date, meal_type)
);
```

### 4. Shopping Lists & Sessions

#### `shopping_lists`
```sql
CREATE TABLE shopping_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    menu_id UUID REFERENCES weekly_menus(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'cancelled'
    estimated_total DECIMAL(10,2),
    actual_total DECIMAL(10,2),
    created_by UUID REFERENCES users(id),
    completed_by UUID REFERENCES users(id),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `shopping_list_items`
```sql
CREATE TABLE shopping_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shopping_list_id UUID REFERENCES shopping_lists(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id),
    custom_name VARCHAR(100), -- For items not in ingredients table
    category_id UUID REFERENCES categories(id),
    quantity DECIMAL(8,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    estimated_price DECIMAL(6,2),
    actual_price DECIMAL(6,2),
    checked BOOLEAN DEFAULT FALSE,
    checked_at TIMESTAMP WITH TIME ZONE,
    notes VARCHAR(200),
    
    -- Meal Attribution (which meals need this ingredient)
    meal_ids UUID[],
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `stores`
```sql
CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    chain VARCHAR(50), -- e.g., "Whole Foods", "Target"
    address TEXT,
    city VARCHAR(50),
    state VARCHAR(20),
    zip_code VARCHAR(10),
    phone VARCHAR(20),
    store_type VARCHAR(30), -- 'grocery', 'pharmacy', 'wholesale', etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `shopping_sessions`
```sql
CREATE TABLE shopping_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    shopping_list_id UUID REFERENCES shopping_lists(id) ON DELETE SET NULL,
    store_id UUID REFERENCES stores(id),
    shopper_id UUID REFERENCES users(id),
    session_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_amount DECIMAL(10,2),
    tax_amount DECIMAL(8,2),
    discount_amount DECIMAL(8,2),
    payment_method VARCHAR(30), -- 'card', 'cash', 'mobile'
    
    -- Budget tracking
    budgeted_amount DECIMAL(10,2),
    variance DECIMAL(10,2), -- actual - budgeted
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `session_items`
```sql
CREATE TABLE session_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES shopping_sessions(id) ON DELETE CASCADE,
    shopping_list_item_id UUID REFERENCES shopping_list_items(id) ON DELETE SET NULL,
    ingredient_id UUID REFERENCES ingredients(id),
    product_name VARCHAR(200) NOT NULL,
    brand VARCHAR(100),
    quantity DECIMAL(8,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    unit_price DECIMAL(8,2),
    total_price DECIMAL(8,2) NOT NULL,
    category_id UUID REFERENCES categories(id),
    
    -- Receipt matching
    receipt_item_id UUID, -- References receipt_items(id)
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 5. Receipt Processing & OCR

#### `receipts`
```sql
CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES shopping_sessions(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id),
    receipt_image_url VARCHAR(500),
    ocr_text TEXT,
    ocr_confidence DECIMAL(5,2), -- 0-100 confidence score
    receipt_date TIMESTAMP WITH TIME ZONE,
    receipt_number VARCHAR(100),
    total_amount DECIMAL(10,2),
    tax_amount DECIMAL(8,2),
    
    -- Processing status
    processing_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'error'
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    
    -- Raw OCR data for debugging/reprocessing
    raw_ocr_data JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `receipt_items`
```sql
CREATE TABLE receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID REFERENCES receipts(id) ON DELETE CASCADE,
    line_number INTEGER,
    product_name VARCHAR(200) NOT NULL,
    quantity DECIMAL(8,2),
    unit_price DECIMAL(8,2),
    total_price DECIMAL(8,2) NOT NULL,
    
    -- Matching to known ingredients
    matched_ingredient_id UUID REFERENCES ingredients(id),
    match_confidence DECIMAL(5,2), -- AI confidence in ingredient matching
    
    -- OCR extraction metadata
    ocr_bbox JSONB, -- Bounding box coordinates
    ocr_confidence DECIMAL(5,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 6. Ratings & Feedback

#### `meal_ratings`
```sql
CREATE TABLE meal_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_id UUID REFERENCES meals(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    menu_meal_id UUID REFERENCES menu_meals(id) ON DELETE SET NULL, -- Context of when meal was eaten
    rating INTEGER CHECK (rating BETWEEN 1 AND 5) NOT NULL,
    review TEXT,
    would_repeat BOOLEAN,
    difficulty_rating INTEGER CHECK (difficulty_rating BETWEEN 1 AND 5),
    cost_rating INTEGER CHECK (cost_rating BETWEEN 1 AND 5), -- 1=expensive, 5=great value
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(meal_id, user_id, menu_meal_id)
);
```

#### `menu_feedback`
```sql
CREATE TABLE menu_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id UUID REFERENCES weekly_menus(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
    variety_rating INTEGER CHECK (variety_rating BETWEEN 1 AND 5),
    cost_rating INTEGER CHECK (cost_rating BETWEEN 1 AND 5),
    feedback TEXT,
    suggestions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(menu_id, user_id)
);
```

### 7. Budget Analytics & Tracking

#### `budget_analytics`
```sql
CREATE TABLE budget_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    period_type VARCHAR(20) NOT NULL, -- 'weekly', 'monthly', 'quarterly'
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Budget vs Actual
    budgeted_amount DECIMAL(10,2) NOT NULL,
    actual_amount DECIMAL(10,2) NOT NULL,
    variance DECIMAL(10,2) NOT NULL, -- actual - budgeted
    variance_percentage DECIMAL(5,2) NOT NULL,
    
    -- Category breakdowns
    category_spending JSONB, -- {category_id: amount} mapping
    
    -- Meal cost analysis
    avg_cost_per_meal DECIMAL(8,2),
    cost_per_person DECIMAL(8,2),
    most_expensive_meal_id UUID REFERENCES meals(id),
    most_economical_meal_id UUID REFERENCES meals(id),
    
    -- Shopping efficiency
    shopping_sessions_count INTEGER DEFAULT 0,
    avg_session_amount DECIMAL(8,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(family_id, period_type, period_start)
);
```

#### `price_history`
```sql
CREATE TABLE price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id),
    price DECIMAL(8,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    brand VARCHAR(100),
    package_size VARCHAR(50), -- e.g., "1 lb", "32 oz"
    sale_price BOOLEAN DEFAULT FALSE,
    recorded_date DATE NOT NULL,
    session_item_id UUID REFERENCES session_items(id), -- Source of price data
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_ingredient_store_date (ingredient_id, store_id, recorded_date)
);
```

### 8. AI Integration & Meal Banking

#### `meal_suggestions`
```sql
CREATE TABLE meal_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    suggested_meal_id UUID REFERENCES meals(id),
    suggestion_context JSONB, -- What triggered the suggestion
    suggestion_reason TEXT, -- AI explanation
    confidence_score DECIMAL(5,2), -- 0-100
    user_response VARCHAR(20), -- 'accepted', 'rejected', 'saved_for_later'
    responded_by UUID REFERENCES users(id),
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `meal_bank`
```sql
CREATE TABLE meal_bank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    meal_id UUID REFERENCES meals(id) ON DELETE CASCADE,
    saved_by UUID REFERENCES users(id),
    saved_from VARCHAR(50), -- 'suggestion', 'menu_planning', 'manual'
    priority INTEGER DEFAULT 1, -- 1=low, 5=high priority to try
    notes TEXT,
    target_season VARCHAR(20), -- 'spring', 'summer', 'fall', 'winter'
    target_occasions TEXT[], -- ['weekend', 'quick_weeknight', 'special']
    saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(family_id, meal_id)
);
```

---

## Key Indexes for Performance

```sql
-- User and Family lookups
CREATE INDEX idx_users_family_id ON users(family_id);
CREATE INDEX idx_users_email ON users(email);

-- Meal searches and analytics
CREATE INDEX idx_meals_family_id ON meals(family_id);
CREATE INDEX idx_meals_usage_count ON meals(usage_count DESC);
CREATE INDEX idx_meals_avg_rating ON meals(avg_rating DESC);
CREATE INDEX idx_meals_meal_type ON meals(meal_type);
CREATE INDEX idx_meals_cuisine_type ON meals(cuisine_type);

-- Menu planning
CREATE INDEX idx_weekly_menus_family_date ON weekly_menus(family_id, week_start_date);
CREATE INDEX idx_menu_meals_menu_id ON menu_meals(menu_id);
CREATE INDEX idx_menu_meals_date ON menu_meals(scheduled_date);

-- Shopping
CREATE INDEX idx_shopping_lists_family_id ON shopping_lists(family_id);
CREATE INDEX idx_shopping_list_items_list_id ON shopping_list_items(shopping_list_id);
CREATE INDEX idx_shopping_sessions_family_id ON shopping_sessions(family_id);
CREATE INDEX idx_shopping_sessions_date ON shopping_sessions(session_date);

-- Ingredients and pricing
CREATE INDEX idx_ingredients_name ON ingredients(name);
CREATE INDEX idx_ingredients_category ON ingredients(category_id);
CREATE INDEX idx_price_history_lookup ON price_history(ingredient_id, store_id, recorded_date DESC);

-- Receipt processing
CREATE INDEX idx_receipts_session_id ON receipts(session_id);
CREATE INDEX idx_receipts_processing_status ON receipts(processing_status);
CREATE INDEX idx_receipt_items_receipt_id ON receipt_items(receipt_id);

-- Analytics
CREATE INDEX idx_budget_analytics_family_period ON budget_analytics(family_id, period_type, period_start);
CREATE INDEX idx_meal_ratings_meal_id ON meal_ratings(meal_id);

-- AI Integration
CREATE INDEX idx_meal_suggestions_family_id ON meal_suggestions(family_id);
CREATE INDEX idx_meal_bank_family_id ON meal_bank(family_id);
```

---

## Relationship Mappings

### One-to-Many Relationships
- **families** → **users** (1:N)
- **families** → **meals** (1:N)
- **families** → **weekly_menus** (1:N)
- **families** → **shopping_lists** (1:N)
- **families** → **shopping_sessions** (1:N)
- **weekly_menus** → **shopping_lists** (1:N)
- **shopping_lists** → **shopping_list_items** (1:N)
- **shopping_sessions** → **session_items** (1:N)
- **shopping_sessions** → **receipts** (1:N)
- **receipts** → **receipt_items** (1:N)
- **meals** → **meal_ratings** (1:N)

### Many-to-Many Relationships
- **meals** ↔ **ingredients** (via meal_ingredients)
- **weekly_menus** ↔ **meals** (via menu_meals)
- **families** ↔ **meals** (via meal_bank)

### One-to-One Relationships
- **shopping_sessions** → **receipts** (1:1, optional)
- **session_items** → **receipt_items** (1:1, optional)

---

## Sample Data Structure Examples

### Family Setup
```json
{
  "family": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "name": "Smith Family",
    "location": "Brooklyn, NY",
    "family_size": 4,
    "weekly_budget": 150.00,
    "dietary_preferences": ["organic", "local"],
    "dietary_restrictions": ["nuts"]
  },
  "users": [
    {
      "id": "u47ac10b-58cc-4372-a567-0e02b2c3d479",
      "family_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "email": "john@smith.com",
      "name": "John Smith",
      "role": "admin",
      "favorite_cuisines": ["italian", "mexican"]
    }
  ]
}
```

### Meal with Ingredients
```json
{
  "meal": {
    "id": "m47ac10b-58cc-4372-a567-0e02b2c3d479",
    "name": "Spaghetti Carbonara",
    "cuisine_type": "italian",
    "meal_type": "dinner",
    "prep_time_minutes": 15,
    "cook_time_minutes": 20,
    "servings": 4,
    "estimated_cost": 12.50,
    "usage_count": 8,
    "avg_rating": 4.5
  },
  "ingredients": [
    {
      "ingredient_id": "i47ac10b-58cc-4372-a567-0e02b2c3d479",
      "name": "Spaghetti pasta",
      "quantity": 1.0,
      "unit": "lb",
      "estimated_cost": 2.50
    },
    {
      "ingredient_id": "i47ac10b-58cc-4372-a567-0e02b2c3d480",
      "name": "Bacon",
      "quantity": 0.5,
      "unit": "lb",
      "estimated_cost": 4.00
    }
  ]
}
```

### Weekly Menu
```json
{
  "weekly_menu": {
    "id": "w47ac10b-58cc-4372-a567-0e02b2c3d479",
    "name": "Week of Jan 28, 2026",
    "week_start_date": "2026-01-28",
    "week_end_date": "2026-02-03",
    "status": "approved",
    "total_estimated_cost": 75.00,
    "ai_generated": true
  },
  "meals": [
    {
      "meal_id": "m47ac10b-58cc-4372-a567-0e02b2c3d479",
      "scheduled_date": "2026-01-28",
      "meal_type": "dinner",
      "planned_servings": 4
    },
    {
      "meal_id": "m47ac10b-58cc-4372-a567-0e02b2c3d480",
      "scheduled_date": "2026-02-02",
      "meal_type": "breakfast",
      "planned_servings": 4
    }
  ]
}
```

### Shopping List Generation
```json
{
  "shopping_list": {
    "id": "s47ac10b-58cc-4372-a567-0e02b2c3d479",
    "name": "Week of Jan 28 Shopping",
    "menu_id": "w47ac10b-58cc-4372-a567-0e02b2c3d479",
    "estimated_total": 82.50
  },
  "items": [
    {
      "ingredient_id": "i47ac10b-58cc-4372-a567-0e02b2c3d479",
      "custom_name": "Spaghetti pasta",
      "quantity": 1.0,
      "unit": "lb",
      "estimated_price": 2.50,
      "meal_ids": ["m47ac10b-58cc-4372-a567-0e02b2c3d479"],
      "category": "Pasta & Grains"
    }
  ]
}
```

---

## Data Types and Constraints

### PostgreSQL-Specific Types Used
- **UUID**: Primary keys and foreign keys
- **DECIMAL(p,s)**: All monetary values (prevents floating-point errors)
- **TIMESTAMP WITH TIME ZONE**: All datetime fields
- **TEXT[]**: Arrays for dietary preferences, restrictions, etc.
- **JSONB**: Structured data like nutritional info, OCR data, analytics breakdowns

### Key Constraints
- **CHECK constraints**: Rating values (1-5), difficulty levels
- **UNIQUE constraints**: Prevent duplicate ratings, menu conflicts
- **CASCADE DELETE**: Maintain referential integrity
- **NOT NULL**: Required fields for data consistency

### Business Logic Constraints
- Weekly menus cannot overlap dates for same family
- Shopping list items must have either ingredient_id or custom_name
- Meal ratings are unique per user per meal per menu occurrence
- Budget analytics periods cannot overlap for same family

---

## AI Integration Points

### 1. Menu Generation Context
The `weekly_menus` table stores AI prompts and context data:
```sql
-- AI context for menu generation
ai_prompt TEXT, -- "Create a budget-friendly Italian week with vegetarian options"
ai_context JSONB -- {
  -- "previous_weeks": [...],
  -- "family_preferences": {...},
  -- "budget_constraints": {...},
  -- "pantry_items": [...]
-- }
```

### 2. Historical Analysis Queries
Support AI analysis of family patterns:
```sql
-- Family's most loved meals (for suggestions)
SELECT m.*, AVG(mr.rating) as avg_rating, COUNT(*) as usage_count
FROM meals m
JOIN meal_ratings mr ON m.id = mr.meal_id
WHERE m.family_id = ? AND mr.rating >= 4
GROUP BY m.id
ORDER BY avg_rating DESC, usage_count DESC;

-- Budget performance patterns
SELECT 
    ba.period_start,
    ba.variance_percentage,
    ba.category_spending
FROM budget_analytics ba
WHERE ba.family_id = ? AND ba.period_type = 'weekly'
ORDER BY ba.period_start DESC
LIMIT 12; -- Last 12 weeks
```

### 3. Price Learning Integration
The `price_history` table enables AI to:
- Predict seasonal price variations
- Suggest optimal shopping timing
- Recommend store preferences
- Learn from receipt OCR data automatically

### 4. Meal Suggestion Engine
The `meal_suggestions` table tracks AI recommendations:
- Context that triggered suggestion
- Confidence scoring
- User feedback loop
- Success rate analytics

---

## Performance Considerations

### Query Optimization
- **Composite indexes** on common query patterns (family_id + date ranges)
- **Partial indexes** on status fields (e.g., active shopping lists only)
- **JSONB indexes** for AI context and analytics queries

### Scaling Considerations
- **Partitioning** by family_id for large datasets
- **Archive strategy** for old receipts and analytics
- **Read replicas** for AI analysis queries
- **Connection pooling** for concurrent shopping sessions

### Data Retention
- Receipt images: 1 year retention policy
- Budget analytics: Indefinite (aggregated data)
- Shopping sessions: 2 years for trend analysis
- OCR raw data: 6 months (debugging/reprocessing)

---

## Implementation Notes

### Database Setup
```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enum types for better performance
CREATE TYPE meal_type_enum AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');
CREATE TYPE menu_status_enum AS ENUM ('draft', 'pending_approval', 'approved', 'active', 'completed');
CREATE TYPE shopping_list_status_enum AS ENUM ('active', 'completed', 'cancelled');
```

### Migration Strategy
1. Create core tables (families, users, meals, ingredients)
2. Add menu planning tables
3. Implement shopping functionality
4. Add receipt processing and analytics
5. Implement AI integration points

### Backup and Recovery
- **Point-in-time recovery** for transactional data
- **Daily backups** of complete database
- **Real-time replication** for disaster recovery
- **Separate backup** of receipt images and OCR data

This schema provides a robust foundation for a comprehensive meal planning and shopping application with full AI integration capabilities, cost tracking, and family management features.