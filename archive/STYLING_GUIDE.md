# Shopping List App Styling Guide

## Overview
This app uses **custom CSS** with CSS variables and semantic class names, NOT Tailwind CSS. All styling is handled through `main.css` and `globals.css`.

## Key Principles

### 1. Use Custom CSS Classes
- Follow existing patterns in `main.css`
- Use semantic class names like `.sidebar`, `.list-container`, `.modal-content`
- Avoid inline styles except for dynamic values

### 2. CSS Variables
```css
:root {
  --text-subdued: #666;
  --border-subdued: #ccc;
  --background-alt: #f0f0f0;
}
```

### 3. Component Structure Pattern
```tsx
// ✅ GOOD - Follow existing app pattern
export default function MyComponent() {
  return (
    <div className="my-component">
      <div className="component-header">
        <h2>Title</h2>
      </div>
      <div className="component-content">
        {/* content */}
      </div>
    </div>
  );
}
```

## Common CSS Classes Available

### Layout
- `.list-container` - Main container with padding
- `.sidebar` - Sidebar navigation
- `.app-layout` - Main app layout

### Buttons
- `.generate-shopping-list-button` - Green primary button
- `.go-to-shopping-list-button` - Blue secondary button
- `.bulk-categorize-btn` - Orange action button
- `.add-new-item` - Green add button

### Forms and Inputs
- `form` - Form container with flex layout
- `li` - List items with alternating backgrounds
- `input[type="checkbox"]` - Styled checkboxes

### Modals and Overlays
- `.bulk-recategorize-modal` - Full-screen overlay
- `.modal-content` - Modal container

### Typography
- Use semantic HTML (`h2`, `p`, etc.)
- Color variables: `var(--text-subdued)` for secondary text

## Layout Structure
The app uses a flex-based layout:
```tsx
<div className="app-layout">
  <Sidebar />
  <div className="list-container">
    {/* Main content */}
  </div>
</div>
```

## Adding New Components

### 1. Create CSS Classes in main.css
```css
.my-new-component {
  padding: 20px;
  background: white;
}

.my-new-component .header {
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border-subdued);
}
```

### 2. Use in Component
```tsx
export default function MyNewComponent() {
  return (
    <div className="my-new-component">
      <div className="header">
        <h2>Component Title</h2>
      </div>
      {/* content */}
    </div>
  );
}
```

## Anti-Patterns to Avoid

### ❌ DON'T Use Tailwind Classes
```tsx
// ❌ WRONG - Tailwind not configured
<div className="max-w-4xl mx-auto p-4 bg-white rounded-lg">
```

### ❌ DON'T Use Extensive Inline Styles
```tsx
// ❌ WRONG - Makes maintenance difficult
<div style={{maxWidth: '56rem', margin: '0 auto', padding: '1rem'}}>
```

### ✅ DO Use Custom CSS Classes
```tsx
// ✅ CORRECT - Follow app patterns
<div className="main-content-container">
```

## Integration with Existing Components

When adding new pages/components:

1. **Check existing components** for similar patterns
2. **Reuse existing CSS classes** where possible  
3. **Add new classes to main.css** following naming conventions
4. **Use CSS variables** for colors and spacing
5. **Test with the app's layout structure**

## Examples from Existing Components

### HomePage Pattern
```tsx
<div className="app-layout">
  <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />
  <div className="list-container">
    {renderContent()}
  </div>
</div>
```

### Button Patterns
```tsx
<button className="generate-shopping-list-button">
  Generate List
</button>

<button className="go-to-shopping-list-button">  
  View List
</button>
```

### Form Patterns
```tsx
<form className={isCollapsed ? "collapsed" : ""}>
  <input type="text" />
  <button type="submit">Submit</button>
</form>
```

This ensures consistency with the existing app design and maintainability.