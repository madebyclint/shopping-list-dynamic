# AI Menu Generation Engine

## Overview
The AI Menu Generation Engine uses OpenAI's GPT-4 to automatically create weekly meal plans optimized for a Brooklyn family of 4. The system includes intelligent caching, cost tracking, and fallback strategies to ensure reliable menu generation.

## Features
- **Smart Menu Generation**: Creates 6 dinners (Monday-Saturday) + 1 Sunday breakfast
- **Family Context Aware**: Optimized for Brooklyn family of 4 with budget-friendly preferences
- **Cache-First Strategy**: Avoids duplicate AI calls by caching similar menus
- **Cost Optimization**: Tracks token usage and estimated costs
- **Fallback System**: Provides backup menus if AI generation fails
- **Response Time Monitoring**: Ensures sub-30-second generation times

## Setup

### 1. Install Dependencies
```bash
npm install openai
```

### 2. Environment Configuration
Add your OpenAI API key to your `.env` file:
```
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Database Setup
Initialize the AI menu tables:
```bash
node setup-db.mjs
```

## API Usage

### Generate Menu
```javascript
POST /api/menus
{
  "weekStartDate": "2024-02-04",  // Sunday start date
  "preferences": "No seafood, more vegetarian meals", // Optional
  "name": "Custom Menu Name" // Optional
}
```

### Response Format
```javascript
{
  "success": true,
  "planId": 123,
  "meals": [
    {
      "day_of_week": 0, // Sunday = 0, Monday = 1, etc.
      "meal_type": "cooking",
      "title": "Sunday Pancakes with Berries",
      "comfort_flag": true,
      "shortcut_flag": false,
      "cultural_riff_flag": false,
      "veggie_inclusion": true
    }
    // ... 6 more meals
  ],
  "message": "Generated with AI",
  "fromCache": false,
  "generationTimeMs": 3250,
  "tokensUsed": 847,
  "usageStats": {
    "total_calls": 15,
    "total_tokens": 12450,
    "total_cost_estimate": "0.3735"
  }
}
```

### Get Usage Statistics
```javascript
GET /api/menus?action=stats
```

## Frontend Integration

### Testing Component
Visit `/ai-menu` to test the AI generation:
```javascript
import AIMenuGenerator from '@/components/AIMenuGenerator';

// The component provides a full interface for:
// - Setting week start dates
// - Adding custom preferences
// - Viewing generated meals with flags
// - Monitoring AI usage costs
```

## Technical Implementation

### Caching Strategy
The system implements a sophisticated caching mechanism:

1. **Exact Match**: Same week + same preferences hash
2. **Similar Week**: Different week but same preferences (within 7 days)
3. **Preference Hashing**: MD5 hash of preferences for consistent lookups

### Cost Optimization
- Tracks tokens used per generation
- Estimates costs based on GPT-4 pricing
- Caches results to avoid redundant API calls
- Provides usage statistics for budget monitoring

### Family Context
The AI prompt includes specific context:
- **Location**: Brooklyn, NY family of 4
- **Preferences**: Budget-friendly, colorful vegetables, complexity variety
- **Constraints**: 30-minute weeknight meals, occasional complex weekend cooking

### Error Handling
- **AI Failure**: Falls back to predefined menu
- **Network Issues**: Proper error messages and status codes
- **Invalid Responses**: Validates AI response format and meal count
- **Database Errors**: Comprehensive error logging

### Performance
- **Response Time**: Monitors and reports generation time
- **Timeout Protection**: Prevents hanging requests
- **Efficient Queries**: Optimized database lookups for caching

## Database Schema

### AI Menu Cache Table
```sql
CREATE TABLE ai_menu_cache (
  id SERIAL PRIMARY KEY,
  week_start_date DATE NOT NULL,
  plan_id INTEGER REFERENCES weekly_meal_plans(id),
  preferences_hash VARCHAR(255) NOT NULL,
  ai_cost_tokens INTEGER NOT NULL,
  generation_time_ms INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(week_start_date, preferences_hash)
);
```

### AI Usage Stats Table
```sql
CREATE TABLE ai_usage_stats (
  id SERIAL PRIMARY KEY,
  total_calls INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_cost_estimate DECIMAL(10,4) DEFAULT 0.00,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Next Steps

### Phase 2 Enhancements
1. **Recipe Details**: Add cooking instructions and ingredient lists
2. **Nutritional Analysis**: Calculate calories and macro nutrients
3. **Shopping List Integration**: Auto-generate grocery lists from meals
4. **User Preferences**: Save family dietary restrictions and preferences
5. **Seasonal Optimization**: Incorporate seasonal ingredients and local availability

### Advanced Features
1. **Image Generation**: Create meal images using DALL-E
2. **Recipe Variations**: Generate multiple versions of the same dish
3. **Leftover Integration**: Smart leftover meal planning
4. **Budget Tracking**: Integrate with grocery pricing APIs
5. **Meal Rating System**: Learn from user feedback

## Monitoring & Analytics
- Track generation success rates (target: 90%+)
- Monitor average response times (target: <30 seconds)
- Analyze cost per menu generation
- Cache hit rates for optimization opportunities

## Troubleshooting

### Common Issues
1. **OpenAI API Key**: Ensure key is set in environment variables
2. **Database Connection**: Verify PostgreSQL connection string
3. **Token Limits**: Monitor usage to avoid rate limiting
4. **Response Format**: AI responses must be valid JSON

### Debug Mode
Set `NODE_ENV=development` for detailed logging of:
- AI prompts and responses
- Cache hit/miss details
- Token usage per request
- Generation timing metrics