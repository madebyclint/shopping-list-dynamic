import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, initializeAIMenuTables } from '@/lib/database';
import { Pool } from 'pg';

export async function POST(req: NextRequest) {
  try {
    console.log('Migrating database to add ingredients and descriptions...');
    
    // Create a direct pool connection for the migration
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    
    try {
      // Add missing columns if they don't exist
      await pool.query(`
        ALTER TABLE meals 
        ADD COLUMN IF NOT EXISTS brief_description TEXT,
        ADD COLUMN IF NOT EXISTS main_ingredients TEXT
      `);
      console.log('✅ Added missing columns to meals table');
    } catch (error) {
      // Columns might already exist, that's okay
      console.log('Note: Columns may already exist:', error instanceof Error ? error.message : String(error));
    }
    
    // Initialize core tables (this will update the schema)
    await initializeDatabase();
    console.log('✅ Core database tables updated');
    
    // Initialize AI menu tables
    await initializeAIMenuTables();
    console.log('✅ AI menu tables updated');
    
    // Close the migration pool
    await pool.end();
    
    return NextResponse.json({
      success: true,
      message: 'Database migration complete! New meal plans will include ingredients and descriptions.'
    });
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Database migration failed',
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    message: 'Database Migration API',
    usage: 'POST to this endpoint to migrate database schema for ingredients support'
  });
}