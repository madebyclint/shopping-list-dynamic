# Shopping List Dynamic

A Next.js grocery list parser with PostgreSQL database storage, designed for deployment on Railway.

## Features

- Parse grocery lists from structured text format
- Categorized shopping lists with cost tracking
- Database persistence with PostgreSQL
- Mark items as purchased with running totals
- Save and manage multiple lists

## Text Format

Items should be formatted as:
```
Item Name:Quantity::Price:::Category::::Meal

Example:
Tomatoes:2 pieces::$1:::Produce::::Turkey Flautas
Tortillas:1 package::$5:::Aisles::::Turkey Flautas
```

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up your database:
   - Copy `.env.example` to `.env.local`
   - Update with your PostgreSQL connection details

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000)

## Railway Deployment

1. **Create a Railway Project:**
   - Go to [Railway](https://railway.app)
   - Create a new project from this GitHub repository

2. **Add PostgreSQL:**
   - In your Railway project, click "New Service"
   - Select "PostgreSQL"
   - Railway will automatically provide the database environment variables

3. **Configure Environment Variables:**
   - Railway automatically sets the PostgreSQL connection variables
   - No manual configuration needed for database connection

4. **Deploy:**
   - Push your code to GitHub
   - Railway will automatically build and deploy your app

## Environment Variables

Railway automatically provides these when you add PostgreSQL:
- `POSTGRES_URL` - Full connection string
- `POSTGRES_HOST` - Database host
- `POSTGRES_USER` - Database user
- `POSTGRES_PASSWORD` - Database password
- `POSTGRES_DATABASE` - Database name

## Database Schema

The app automatically creates these tables:

### grocery_lists
- `id` (SERIAL PRIMARY KEY)
- `name` (VARCHAR)
- `raw_text` (TEXT)
- `created_at` (TIMESTAMP)

### grocery_items
- `id` (SERIAL PRIMARY KEY)
- `name` (VARCHAR)
- `qty` (VARCHAR)
- `price` (VARCHAR)
- `category` (VARCHAR)
- `meal` (VARCHAR)
- `is_purchased` (BOOLEAN)
- `list_id` (INTEGER, Foreign Key)
- `created_at` (TIMESTAMP)

## API Endpoints

- `GET /api/lists` - Get all grocery lists
- `POST /api/lists` - Create a new grocery list
- `GET /api/lists/[id]` - Get a specific grocery list with items
- `PATCH /api/items` - Update item purchase status

## Technology Stack

- **Frontend:** Next.js 14 with TypeScript
- **Database:** PostgreSQL (via @vercel/postgres)
- **Hosting:** Railway
- **Styling:** CSS with CSS Variables