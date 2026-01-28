import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, initializeAIMenuTables } from '@/lib/database';

export async function POST(req: NextRequest) {
  try {
    console.log('Setting up database...');
    
    // Initialize core tables
    await initializeDatabase();
    console.log('✅ Core database tables initialized');
    
    // Initialize AI menu tables
    await initializeAIMenuTables();
    console.log('✅ AI menu tables initialized');
    
    return NextResponse.json({
      success: true,
      message: 'Database setup complete!'
    });
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Database setup failed',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    message: 'Database Setup API',
    usage: 'POST to this endpoint to initialize database tables'
  });
}