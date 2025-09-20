/**
 * test-direct-json.js
 * 
 * This script simulates publishing lottery results by directly writing to the data/results.json file.
 * This is useful for testing when the server is not running.
 */

const fs = require('fs');
const path = require('path');

// Function to generate random digits of specified length
function randomDigits(length) {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
}

// Generate random values for today's drawing
const testResults = {
  at: new Date().toISOString(),
  P2: randomDigits(2),
  P3: randomDigits(3),
  P4: randomDigits(4),
  P5: randomDigits(5),
  source: "direct-test"
};

console.log('Writing test data to results.json:');
console.log(testResults);

// Path to the results.json file
const resultsPath = path.join(process.cwd(), 'data', 'results.json');

// Write the results directly to the file
try {
  fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2), 'utf8');
  console.log('✅ Successfully wrote results to:', resultsPath);
  console.log('\nThe results should now be visible in the data/results.json file.');
  console.log('When the server is running, these results will be displayed on the main page.');
} catch (err) {
  console.error('❌ Error writing results:', err);
}