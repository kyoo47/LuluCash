/**
 * OCR Bypass script - uses direct HTTP calls to Vision API
 * Uses a workaround for system clock issues
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { GoogleAuth } = require('google-auth-library');

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

// Function to encode image file to base64
function encodeImage(imagePath) {
  const imageFile = fs.readFileSync(imagePath);
  return Buffer.from(imageFile).toString('base64');
}

async function ocrImage(imagePath) {
  try {
    console.log(`Processing image: ${imagePath}`);
    
    // Path to your service account key file
    const keyFile = path.join(process.cwd(), 'secrets', 'gcp-vision-key.json');
    console.log('Using key file:', keyFile);
    
    // Create a new auth client
    const auth = new GoogleAuth({
      keyFilename: keyFile,
      scopes: ['https://www.googleapis.com/auth/cloud-vision'],
    });
    
    // Get HTTP client with auth
    const client = await auth.getClient();
    const projectId = await auth.getProjectId();
    console.log('Project ID:', projectId);
    
    // Read and encode the image
    const encodedImage = encodeImage(imagePath);
    console.log('Image encoded successfully');
    
    // Build request
    const request = {
      requests: [
        {
          image: {
            content: encodedImage
          },
          features: [
            {
              type: 'TEXT_DETECTION',
              maxResults: 10
            }
          ]
        }
      ]
    };
    
    // Send request using auth client
    console.log('Sending request to Vision API...');
    const url = `${VISION_API_URL}?key=${JSON.parse(fs.readFileSync(keyFile)).private_key_id}`;
    
    // Get access token
    console.log('Getting access token...');
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;
    console.log('Got access token:', token ? token.substring(0, 10) + '...' : 'undefined');
    
    // Make the API request
    return new Promise((resolve, reject) => {
      const options = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };
      
      console.log(`Making request to: ${VISION_API_URL}`);
      
      const req = https.request(url, options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log(`API Response Status: ${res.statusCode}`);
          
          if (res.statusCode === 200) {
            try {
              const result = JSON.parse(data);
              const textAnnotations = result?.responses?.[0]?.textAnnotations;
              const fullText = textAnnotations?.[0]?.description || '';
              
              console.log('OCR completed successfully!');
              console.log('Text found (first 200 chars):');
              console.log(fullText.slice(0, 200));
              console.log(fullText.length > 200 ? '...' : '');
              
              resolve({ ok: true, text: fullText });
            } catch (error) {
              reject(new Error(`Failed to parse response: ${error.message}`));
            }
          } else {
            console.error('Full error response:', data);
            reject(new Error(`API returned status code ${res.statusCode}: ${data}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`Request error: ${error.message}`));
      });
      
      req.write(JSON.stringify(request));
      req.end();
    });
  } catch (error) {
    console.error('Error during OCR:', error.message);
    return { ok: false, error: error.message };
  }
}

// Main function to run the test
async function main() {
  const imagePath = path.join(process.cwd(), 'public', 'capture.png');
  if (!fs.existsSync(imagePath)) {
    console.error('Image file not found:', imagePath);
    return;
  }
  
  try {
    const result = await ocrImage(imagePath);
    console.log('OCR Result:', result.ok ? 'Success' : 'Failed');
  } catch (error) {
    console.error('Main error:', error.message);
  }
}

main();