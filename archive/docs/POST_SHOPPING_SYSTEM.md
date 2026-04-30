# Post-Shopping Experience & Receipt Analysis System

## Overview

This system provides a comprehensive post-shopping experience that allows users to upload receipts, analyze their shopping efficiency, and provide feedback to improve future meal planning. The system creates a complete feedback loop where shopping analysis improves meal planning accuracy.

## Features

### 📸 Receipt Upload & OCR Processing
- **Mobile-friendly receipt capture** with camera or file upload
- **OCR processing** to extract items and prices from receipts
- **Automatic matching** of receipt items to planned shopping list items
- **Progress tracking** during upload and processing

### 📊 Intelligent Analysis
- **Shopping efficiency** calculation (planned vs purchased items)
- **Cost variance** analysis (planned vs actual spending)
- **Extra items** identification (unplanned purchases)
- **Missing items** detection (planned but not purchased)
- **Smart insights** and recommendations

### 📝 Structured Feedback Collection
- **Over-shopping identification** with categorized reasons (impulse, already had, wrong size, etc.)
- **Meal planning feedback** (too many/few meals, difficulty, variety ratings)
- **Meal-specific learning** notes and tips for future planning
- **Cost feedback** with unexpected expense tracking
- **Overall experience** rating and improvement suggestions

### 📈 Learning Dashboard
- **Shopping efficiency trends** over time
- **Cost accuracy** tracking and improvement
- **Frequently over/under-purchased items** analysis
- **Learning insights** from accumulated feedback
- **Actionable recommendations** for better planning

## System Architecture

### Database Schema (Compatible with Existing App)

The system adds feedback tables to the existing grocery app schema:

- `shopping_feedback` - Main feedback records linked to grocery_lists
- `over_shopping_feedback` - Track unnecessary purchases
- `meal_planning_feedback` - Meal planning effectiveness feedback
- `meal_specific_feedback` - Individual meal notes and learning
- `cost_feedback` - Budget and cost variance feedback
- `shopping_efficiency_metrics` - Aggregated analytics data

### API Endpoints

#### Receipt Processing
- `POST /api/receipts/upload` - Upload receipt images
- `POST /api/receipts/process` - Trigger OCR processing
- `GET /api/receipts/[id]` - Get receipt details
- `POST /api/receipts/analyze` - Compare receipt to shopping list

#### Feedback Collection
- `POST /api/feedback/shopping-session` - Submit comprehensive feedback
- `GET /api/feedback/shopping-session` - Retrieve existing feedback

#### Analytics
- `GET /api/analytics/shopping-efficiency` - Efficiency trends
- `GET /api/analytics/item-patterns` - Frequently over/under-purchased items
- `GET /api/analytics/learning-insights` - Learning tips and insights

#### Shopping Sessions
- `GET /api/shopping-sessions/[id]` - Get session details
- `GET /api/shopping-sessions/[id]/receipt` - Get session receipt

### React Components

#### Core Components
- `ReceiptUpload` - Mobile-friendly receipt capture
- `PostShoppingFeedbackForm` - Multi-step feedback collection
- `FeedbackDashboard` - Analytics and insights display
- `PostShoppingPage` - Main orchestrating component

#### Component Features
- **Progressive workflow** with step-by-step guidance
- **Real-time validation** and feedback
- **Mobile-optimized** interface
- **Accessibility support** with proper ARIA labels

## Usage Guide

### 1. Accessing the Post-Shopping Experience

Users can access the post-shopping experience in several ways:

- **From completed shopping list** - "Analyze Trip" button
- **Direct URL** - `/post-shopping?sessionId=123&userId=456`
- **Shopping history** - Link from recent trips

### 2. Receipt Upload Process

1. **Upload receipt** via camera or file selection
2. **OCR processing** extracts items and prices (30-60 seconds)
3. **Automatic analysis** compares receipt to planned list
4. **Review results** before proceeding to feedback

### 3. Feedback Collection Workflow

The feedback form has 5 steps:

1. **Over-Shopping Review** - Mark unnecessary purchases
2. **Meal Planning Feedback** - Rate planning effectiveness  
3. **Meal-Specific Notes** - Add learning tips per meal
4. **Cost Analysis** - Review unexpected expenses
5. **Overall Feedback** - Rate experience and suggest improvements

### 4. Analytics Dashboard

View insights and trends:

- **Summary cards** showing key metrics
- **Efficiency trends** over time periods
- **Problem items** that are frequently over/under-purchased
- **Learning insights** extracted from feedback

## Implementation Examples

### Adding Post-Shopping Link to Shopping Lists

```typescript
// In your shopping list component
const handleCompleteTrip = (listId: number) => {
  // Mark list as completed, then navigate to post-shopping
  window.location.href = `/post-shopping?sessionId=${listId}&userId=${currentUserId}`;
};
```

### Integrating with Existing Meal Planning

```typescript
// The system automatically pulls planned meals from:
// - weekly_meal_plans table
// - meals table  
// - Links through meal_plan_id in grocery_lists
```

### OCR Integration

The current implementation uses a mock OCR service. To integrate real OCR:

1. **Google Vision API** integration:
```typescript
const ocrResult = await googleVision.textDetection(imageBuffer);
```

2. **Microsoft Cognitive Services**:
```typescript
const ocrResult = await cognitiveServices.readText(imageUrl);
```

3. **Amazon Textract**:
```typescript
const ocrResult = await textract.detectText(imageBytes);
```

## Development Setup

### 1. Database Migration

```bash
# Run the feedback tables migration
node scripts/run-feedback-migration.mjs
```

### 2. Environment Variables

Ensure `.env.local` contains:
```
POSTGRES_URL=postgresql://username:password@host:port/database
```

### 3. Testing the System

1. **Create a grocery list** with planned items
2. **Navigate to post-shopping** page with list ID
3. **Upload a test receipt** (sample provided in `/uploads`)
4. **Complete feedback** workflow
5. **View analytics** dashboard

## Key Benefits

### For Users
- **Improved meal planning** through learning from past trips
- **Better budget control** with cost variance tracking  
- **Reduced food waste** by identifying over-purchasing patterns
- **Time savings** through optimized planning

### For Meal Planning AI
- **Rich feedback data** to improve future meal suggestions
- **Cost accuracy** data for better budget estimates
- **User preferences** learned from meal-specific feedback
- **Shopping patterns** for smarter grocery list generation

## Future Enhancements

### Planned Features
- **Store-specific insights** (price comparisons, layout optimization)
- **Seasonal analysis** (price trends, availability patterns)
- **Family member preferences** (individual feedback tracking)
- **Automated insights** (ML-powered recommendations)
- **Integration with meal planning AI** (feedback loop closure)

### Technical Improvements
- **Real OCR service** integration (Google Vision, Azure, AWS)
- **Image optimization** for better OCR accuracy
- **Offline capability** for receipt storage
- **Push notifications** for feedback reminders
- **Advanced analytics** with predictive insights

## API Documentation

### Receipt Analysis Response
```typescript
interface AnalysisResult {
  receiptItems: ReceiptItem[];
  plannedItems: PlannedItem[];
  analysis: {
    totalPlannedCost: number;
    totalActualCost: number;
    costVariance: number;
    costVariancePercentage: number;
    extraItems: number;
    missedItems: number;
    shoppingEfficiency: number;
  };
  insights: Insight[];
}
```

### Feedback Submission
```typescript
interface FeedbackData {
  overShoppingItems: OverShoppingItem[];
  mealPlanningFeedback: MealPlanningFeedback;
  mealSpecificFeedback: MealSpecificFeedback[];
  costFeedback: CostFeedback;
  overallRating: number;
  improvementSuggestions: string;
}
```

## Troubleshooting

### Common Issues
1. **Receipt processing fails** - Check image quality, ensure text is readable
2. **Items not matching** - Manual matching available in feedback form
3. **Database errors** - Verify migration ran successfully
4. **OCR timeout** - Current mock has 2-minute timeout, real services may vary

### Support
- Check console logs for detailed error messages
- Verify database connection and table structure
- Ensure all required environment variables are set
- Test with provided sample receipt first

---

This system provides a complete post-shopping experience that learns from user behavior and continuously improves meal planning accuracy and shopping efficiency.