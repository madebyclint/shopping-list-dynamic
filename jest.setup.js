// jest.setup.js
// Jest setup file for functionality test configuration

// Required for pg library in Node.js environment
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.POSTGRES_URL = 'test://test';

// Global test timeout
jest.setTimeout(10000);

// Mock fetch globally for API functionality tests
global.fetch = jest.fn();