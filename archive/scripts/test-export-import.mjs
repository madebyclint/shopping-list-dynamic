#!/usr/bin/env node

/**
 * Test script for data export/import functionality
 * 
 * This script tests the export and import API endpoints to ensure they work correctly.
 * Run this script after starting the development server.
 */

// Import fetch for Node.js
import fetch from 'node-fetch';

const baseUrl = 'http://localhost:3000';

async function testExportEndpoint() {
  console.log('🧪 Testing export endpoint...');
  
  try {
    // Test export metadata
    const metadataResponse = await fetch(`${baseUrl}/api/data/export`, { method: 'POST' });
    const metadataResult = await metadataResponse.json();
    
    if (metadataResult.success) {
      console.log('✅ Export metadata endpoint working');
      console.log(`   - Total plans: ${metadataResult.metadata.totalPlans}`);
      console.log(`   - Total lists: ${metadataResult.metadata.totalLists}`);
      console.log(`   - Total items: ${metadataResult.metadata.totalItems}`);
      if (metadataResult.metadata.planDateRange) {
        console.log(`   - Date range: ${metadataResult.metadata.planDateRange.earliest} to ${metadataResult.metadata.planDateRange.latest}`);
      }
    } else {
      console.log('❌ Export metadata failed:', metadataResult.error);
      return false;
    }
    
    // Test actual export
    const exportResponse = await fetch(`${baseUrl}/api/data/export`);
    if (exportResponse.ok) {
      const exportData = await exportResponse.json();
      console.log('✅ Export endpoint working');
      console.log(`   - Export version: ${exportData.version}`);
      console.log(`   - Export date: ${exportData.exportedAt}`);
      console.log(`   - Data keys: ${Object.keys(exportData.data).join(', ')}`);
      return exportData;
    } else {
      console.log('❌ Export failed:', await exportResponse.text());
      return false;
    }
    
  } catch (error) {
    console.log('❌ Export test failed:', error.message);
    return false;
  }
}

async function testImportEndpoint(sampleData) {
  console.log('🧪 Testing import endpoint...');
  
  try {
    // Test import preview
    const encodedData = encodeURIComponent(JSON.stringify(sampleData));
    const previewResponse = await fetch(`${baseUrl}/api/data/import?data=${encodedData}`);
    const previewResult = await previewResponse.json();
    
    if (previewResult.success) {
      console.log('✅ Import preview endpoint working');
      console.log(`   - Compatible: ${previewResult.preview.compatible}`);
      console.log(`   - Version: ${previewResult.preview.version}`);
      console.log(`   - Total items to import: ${Object.values(previewResult.preview.summary).reduce((a, b) => a + b, 0)}`);
      if (previewResult.preview.warnings.length > 0) {
        console.log(`   - Warnings: ${previewResult.preview.warnings.length}`);
      }
    } else {
      console.log('❌ Import preview failed:', previewResult.error);
      return false;
    }
    
    // Note: We won't actually test the import POST to avoid modifying data
    console.log('✅ Import preview successful (actual import not tested to preserve data)');
    
    return true;
    
  } catch (error) {
    console.log('❌ Import test failed:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting data export/import tests...\n');
  
  const exportData = await testExportEndpoint();
  if (!exportData) {
    console.log('\n❌ Export tests failed, skipping import tests');
    return;
  }
  
  console.log('\n');
  
  const importSuccess = await testImportEndpoint(exportData);
  
  console.log('\n📋 Test Summary:');
  console.log(`   Export: ${exportData ? '✅' : '❌'}`);
  console.log(`   Import Preview: ${importSuccess ? '✅' : '❌'}`);
  
  if (exportData && importSuccess) {
    console.log('\n🎉 All tests passed! The export/import system is working correctly.');
    console.log('\n🔗 Try it out:');
    console.log(`   - Visit ${baseUrl}/data-management`);
    console.log('   - Or use the Utilities section in the main app');
  } else {
    console.log('\n🚨 Some tests failed. Please check the implementation.');
  }
}

runTests().catch(console.error);