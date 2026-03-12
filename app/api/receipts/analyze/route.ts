import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/database';

interface AnalysisRequest {
  receiptId: string;
  groceryListId: string;
}

interface AnalysisResult {
  receiptItems: ReceiptItemWithMatch[];
  plannedItems: PlannedItemWithMatch[];
  analysis: {
    totalPlannedCost: number;
    totalActualCost: number;
    costVariance: number;
    costVariancePercentage: number;
    extraItems: number;
    missedItems: number;
    matchedItems: number;
    shoppingEfficiency: number;
  };
  insights: {
    type: 'success' | 'warning' | 'info';
    message: string;
  }[];
}

interface ReceiptItemWithMatch {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  matchedToPlanned: boolean;
  plannedItemId?: string;
  matchConfidence?: number;
  category?: string;
}

interface PlannedItemWithMatch {
  id: string;
  name: string;
  quantity: number;
  estimatedPrice: number;
  checked: boolean;
  purchased: boolean;
  actualPrice?: number;
  variance?: number;
}

export async function POST(request: NextRequest) {
  try {
    const { receiptId, groceryListId }: AnalysisRequest = await request.json();

    if (!receiptId || !groceryListId) {
      return NextResponse.json(
        { error: 'Receipt ID and Grocery List ID are required' },
        { status: 400 }
      );
    }

    // Get receipt items from raw_text (parse the OCR result)
    const receiptQuery = `
      SELECT 
        r.id,
        r.raw_text,
        r.total,
        r.subtotal,
        r.tax,
        r.store_name
      FROM receipts r
      WHERE r.id = $1
    `;

    const receiptResult = await pool.query(receiptQuery, [receiptId]);
    
    if (receiptResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Receipt not found' },
        { status: 404 }
      );
    }

    const receipt = receiptResult.rows[0];
    const receiptItems = parseReceiptItems(receipt.raw_text || '');

    // Get planned grocery items
    const plannedItemsQuery = `
      SELECT 
        gi.id,
        gi.name,
        gi.qty as quantity,
        gi.price as estimated_price,
        gi.is_purchased as checked,
        gi.actual_price,
        gi.category,
        gi.meal
      FROM grocery_items gi
      WHERE gi.list_id = $1
      ORDER BY gi.created_at
    `;

    const plannedItemsResult = await pool.query(plannedItemsQuery, [groceryListId]);

    // Perform intelligent matching with error handling
    let matchedReceiptItems, matchedPlannedItems;
    try {
      const matchingResult = await performItemMatching(
        receiptItems,
        plannedItemsResult.rows
      );
      matchedReceiptItems = matchingResult.matchedReceiptItems;
      matchedPlannedItems = matchingResult.matchedPlannedItems;
    } catch (matchingError) {
      console.error('Item matching error:', matchingError);
      // Fallback to basic matching
      matchedReceiptItems = receiptItems.map(item => ({ ...item, matchedToPlanned: false }));
      matchedPlannedItems = plannedItemsResult.rows.map((item: any) => ({
        id: item.id.toString(),
        name: item.name,
        quantity: parseInt(item.qty) || 1,
        estimatedPrice: parseFloat(item.price) || 0,
        checked: item.is_purchased || false,
        purchased: item.is_purchased || false
      }));
    }

    // Calculate analysis metrics with error handling
    let analysis;
    try {
      analysis = calculateAnalysisMetrics(matchedReceiptItems, matchedPlannedItems);
    } catch (analysisError) {
      console.error('Analysis calculation error:', analysisError);
      // Fallback to basic analysis
      analysis = {
        totalPlannedCost: matchedPlannedItems.reduce((sum: number, item: any) => sum + (item.estimatedPrice || 0), 0),
        totalActualCost: matchedReceiptItems.reduce((sum, item) => sum + item.totalPrice, 0),
        costVariance: 0,
        costVariancePercentage: 0,
        extraItems: receiptItems.length,
        missedItems: plannedItemsResult.rows.length,
        matchedItems: 0,
        shoppingEfficiency: 0
      };
    }

    // Generate insights with error handling
    let insights;
    try {
      insights = generateInsights(matchedReceiptItems, matchedPlannedItems, analysis);
    } catch (insightError) {
      console.error('Insight generation error:', insightError);
      insights = [{
        type: 'info' as const,
        message: 'Basic analysis completed. Some advanced insights may be unavailable.'
      }];
    }

    const result: AnalysisResult = {
      receiptItems: matchedReceiptItems,
      plannedItems: matchedPlannedItems,
      analysis,
      insights
    };

    return NextResponse.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Receipt analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze receipt' },
      { status: 500 }
    );
  }
}

async function performItemMatching(receiptItems: any[], plannedItems: any[]) {
  const matchedReceiptItems: ReceiptItemWithMatch[] = [];
  const matchedPlannedItems: PlannedItemWithMatch[] = [];
  const usedPlannedItems = new Set<string>();

  // Convert grocery_items to expected format and perform name matching
  for (const receiptItem of receiptItems) {
    let matched = false;
    
    // Find best name match
    const bestMatch = findBestNameMatch(receiptItem.productName, plannedItems, usedPlannedItems);
    
    if (bestMatch && bestMatch.confidence > 60) {
      matchedReceiptItems.push({
        id: receiptItem.id,
        productName: receiptItem.productName,
        quantity: receiptItem.quantity,
        unitPrice: receiptItem.unitPrice,
        totalPrice: receiptItem.totalPrice,
        matchedToPlanned: true,
        plannedItemId: bestMatch.item.id,
        matchConfidence: bestMatch.confidence,
        category: bestMatch.item.category
      });

      // Convert price string to number for calculation
      const estimatedPrice = parseFloat(bestMatch.item.estimated_price.replace(/[\$,]/g, '')) || 0;

      matchedPlannedItems.push({
        id: bestMatch.item.id,
        name: bestMatch.item.name,
        quantity: bestMatch.item.quantity,
        estimatedPrice: estimatedPrice,
        checked: bestMatch.item.checked,
        purchased: true,
        actualPrice: receiptItem.totalPrice,
        variance: receiptItem.totalPrice - estimatedPrice
      });

      usedPlannedItems.add(bestMatch.item.id);
      matched = true;
    }

    if (!matched) {
      // No match found - this is an extra item
      matchedReceiptItems.push({
        id: receiptItem.id,
        productName: receiptItem.productName,
        quantity: receiptItem.quantity,
        unitPrice: receiptItem.unitPrice,
        totalPrice: receiptItem.totalPrice,
        matchedToPlanned: false,
        category: receiptItem.category
      });
    }
  }

  // Add remaining planned items as not purchased
  for (const plannedItem of plannedItems) {
    if (!usedPlannedItems.has(plannedItem.id.toString())) {
      const estimatedPrice = parseFloat(plannedItem.estimated_price.replace(/[\$,]/g, '')) || 0;
      
      matchedPlannedItems.push({
        id: plannedItem.id,
        name: plannedItem.name,
        quantity: plannedItem.quantity,
        estimatedPrice: estimatedPrice,
        checked: plannedItem.checked,
        purchased: false
      });
    }
  }

  return { matchedReceiptItems, matchedPlannedItems };
}

function findBestNameMatch(productName: string, plannedItems: any[], usedItems: Set<string>) {
  let bestMatch = null;
  let bestScore = 0;

  const normalizedProductName = normalizeProductName(productName);

  for (const plannedItem of plannedItems) {
    if (usedItems.has(plannedItem.id.toString())) continue;

    const normalizedPlannedName = normalizeProductName(plannedItem.name);
    const similarity = calculateStringSimilarity(normalizedProductName, normalizedPlannedName);
    
    if (similarity > bestScore && similarity > 0.4) {
      bestScore = similarity;
      bestMatch = {
        item: plannedItem,
        confidence: Math.round(similarity * 100)
      };
    }
  }

  return bestMatch;
}

function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(organic|fresh|frozen|canned|dried|whole|ground|sliced|chopped)\b/g, '')
    .replace(/\b\d+(\.\d+)?\s*(oz|lb|lbs|g|kg|ml|l)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateStringSimilarity(str1: string, str2: string): number {
  // Simple Jaccard similarity for word sets
  const words1 = new Set(str1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(str2.split(' ').filter(w => w.length > 2));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

function calculateAnalysisMetrics(receiptItems: ReceiptItemWithMatch[], plannedItems: PlannedItemWithMatch[]) {
  const totalPlannedCost = plannedItems.reduce((sum, item) => sum + item.estimatedPrice, 0);
  const totalActualCost = receiptItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const costVariance = totalActualCost - totalPlannedCost;
  const costVariancePercentage = totalPlannedCost > 0 ? (costVariance / totalPlannedCost) * 100 : 0;
  
  const extraItems = receiptItems.filter(item => !item.matchedToPlanned).length;
  const missedItems = plannedItems.filter(item => !item.purchased).length;
  const matchedItems = receiptItems.filter(item => item.matchedToPlanned).length;
  
  const totalPlannedItems = plannedItems.length;
  const shoppingEfficiency = totalPlannedItems > 0 ? (matchedItems / totalPlannedItems) * 100 : 0;

  return {
    totalPlannedCost,
    totalActualCost,
    costVariance,
    costVariancePercentage,
    extraItems,
    missedItems,
    matchedItems,
    shoppingEfficiency
  };
}

function generateInsights(receiptItems: ReceiptItemWithMatch[], plannedItems: PlannedItemWithMatch[], analysis: any) {
  const insights = [];

  // Cost variance insights
  if (analysis.costVariancePercentage > 20) {
    insights.push({
      type: 'warning' as const,
      message: `You spent ${analysis.costVariancePercentage.toFixed(1)}% more than planned ($${analysis.costVariance.toFixed(2)} over budget)`
    });
  } else if (analysis.costVariancePercentage < -10) {
    insights.push({
      type: 'success' as const,
      message: `Great job! You saved ${Math.abs(analysis.costVariancePercentage).toFixed(1)}% from your planned budget`
    });
  }

  // Shopping efficiency insights
  if (analysis.shoppingEfficiency > 90) {
    insights.push({
      type: 'success' as const,
      message: 'Excellent planning! You got almost everything on your list'
    });
  } else if (analysis.shoppingEfficiency < 70) {
    insights.push({
      type: 'warning' as const,
      message: `You missed ${analysis.missedItems} planned items. Consider double-checking your list before shopping`
    });
  }

  // Extra items insights
  if (analysis.extraItems > 3) {
    insights.push({
      type: 'warning' as const,
      message: `You bought ${analysis.extraItems} unplanned items. Review these for future meal planning`
    });
  } else if (analysis.extraItems === 0) {
    insights.push({
      type: 'success' as const,
      message: 'Perfect discipline! You stuck exactly to your shopping list'
    });
  }

  // Category-specific insights
  const extraItemsByCategory = receiptItems
    .filter(item => !item.matchedToPlanned)
    .reduce((acc, item) => {
      const category = item.category || 'Other';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const topExtraCategory = Object.entries(extraItemsByCategory)
    .sort(([,a], [,b]) => b - a)[0];

  if (topExtraCategory && topExtraCategory[1] > 1) {
    insights.push({
      type: 'info' as const,
      message: `Most extra purchases were in ${topExtraCategory[0]} (${topExtraCategory[1]} items)`
    });
  }

  return insights;
}

export async function GET() {
  return NextResponse.json(
    { message: 'POST to this endpoint to analyze receipts' },
    { status: 405 }
  );
}

// Parse receipt items from OCR text
function parseReceiptItems(ocrText: string) {
  const lines = ocrText.split('\n');
  const items = [];
  let lineNumber = 1;

  for (const line of lines) {
    // Look for lines with product name and price pattern
    const priceMatch = line.match(/(.+?)\s+\$(\d+\.\d{2})$/);
    if (priceMatch) {
      const [, productName, price] = priceMatch;
      const cleanProductName = productName.trim();
      
      if (!['Subtotal:', 'Tax:', 'Total:'].includes(cleanProductName)) {
        items.push({
          id: `receipt-item-${lineNumber}`,
          productName: cleanProductName,
          quantity: 1, // Default quantity
          unitPrice: parseFloat(price),
          totalPrice: parseFloat(price),
          matchedToPlanned: false,
          category: 'Unknown'
        });
      }
    }
    lineNumber++;
  }

  return items;
}