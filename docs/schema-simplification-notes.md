# Schema Simplification Notes

## Current Simplifications Applied

### ✅ Completed Simplifications
1. **Removed Multi-User Complexity**
   - Single family manager instead of role-based users
   - Simplified authentication (exploring PIN + last name)
   - No family member permissions/roles initially

2. **Merged Meal Banking**
   - Banking status added to meals table instead of separate entity
   - Simplified meal management with single table approach
   - Reduced database complexity

3. **AI Cost Tracking Integration**
   - Added AI usage cost tracking to existing analytics
   - Cache-first strategy emphasized
   - Dev mode cost monitoring planned

### 🔄 Active Monitoring Areas
- **Database table count**: Currently monitoring for table bloat
- **Relationship complexity**: Simplifying many-to-many where possible
- **Data duplication**: Looking for normalized vs denormalized tradeoffs
- **Query complexity**: Ensuring simple, fast queries

### 📋 Simplification Candidates for Review

1. **Shopping List Categories**
   - Could categories be simplified to just a string field instead of separate table?
   - Do we need complex category management or just basic grouping?

2. **Ingredient Management**
   - Is ingredient normalization necessary or can we use simpler text-based approach?
   - Consider store-specific pricing vs generic ingredient pricing

3. **Recipe Instructions**
   - Simple text field vs structured cooking steps
   - Balance between AI parsing capability and simplicity

4. **Analytics Tables**
   - Could some analytics be computed on-the-fly vs pre-computed tables?
   - Consider real-time vs batch processing implications

### ⚠️ Complexity Justifications
These areas might seem complex but provide significant value:

1. **Receipt Processing Tables**: Necessary for OCR learning and price updates
2. **Menu History**: Essential for AI context and preference learning
3. **Cost Tracking**: Critical for budget accuracy improvements

### 🎯 Ongoing Philosophy
- **Start Simple**: Begin with minimal viable schema
- **Add When Needed**: Only add complexity when clear value is demonstrated
- **Measure Impact**: Track query performance and user experience
- **Regular Reviews**: Monthly schema review sessions

### 📝 Decision Log
- **2026-01-28**: Removed user roles, merged meal banking, added AI cost tracking
- **Future**: Will document each schema change with rationale