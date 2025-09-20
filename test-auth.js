/**
 * Test script to check the service account configuration
 */
const { GoogleAuth } = require('google-auth-library');
const path = require('path');

async function testAuth() {
  try {
    // Path to the service account key file
    const keyFile = path.join(process.cwd(), 'secrets', 'gcp-vision-key.json');
    console.log('Key file path:', keyFile);
    
    // Create auth client with specific scopes for Vision API
    const auth = new GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    
    // Get the client
    console.log('Attempting to get client...');
    const client = await auth.getClient();
    console.log('Got client successfully');
    
    // Get the project ID
    const projectId = await auth.getProjectId();
    console.log('Project ID:', projectId);
    
    // Try to get an auth token
    console.log('Attempting to get access token...');
    const token = await client.getAccessToken();
    console.log('Got access token successfully:', token.token.substring(0, 10) + '...');
    
    console.log('\nAuthentication test PASSED! Your service account is correctly configured.');
  } catch (error) {
    console.error('Authentication test FAILED!');
    console.error('Error:', error.message);
    console.error('\nThis indicates an issue with your service account configuration or credentials.');
    console.error('Check that:');
    console.error('1. Your service account has proper permissions');
    console.error('2. The Vision API is enabled in your Google Cloud project');
    console.error('3. Your Google Cloud project has billing enabled');
  }
}

testAuth();