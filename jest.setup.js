// jest.setup.js
// Jest setup file for global test configuration

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.POSTGRES_URL = 'test://test';

// Global test timeout
jest.setTimeout(10000);