/**
 * test-publish-to-page.js
 * 
 * This script simulates publishing lottery results to the main page.
 * It sends test data to the API endpoint that will be displayed on the frontend.
 */

const fetch = require('node-fetch');

// Function to generate random digits of specified length
function randomDigits(length) {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
}

// Generate random values for today's drawing
const testData = {
  P2: randomDigits(2),
  P3: randomDigits(3),
  P4: randomDigits(4),
  P5: randomDigits(5),
  source: 'test-script'
};

console.log('Publishing test data to the main page:');
console.log(testData);

// Publish the results to the API endpoint
fetch('http://127.0.0.1:3001/api/results/ingest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(testData)
})
.then(res => res.json())
.then(data => {
  if (data.ok) {
    console.log('✅ Successfully published results:');
    console.log(data);
    console.log('\nThe results should now be visible on the main page.');
    console.log('Open http://localhost:3001 in your browser to see them.');
  } else {
    console.error('❌ Failed to publish results:', data);
  }
})
.catch(err => {
  console.error('❌ Error occurred:', err);
});