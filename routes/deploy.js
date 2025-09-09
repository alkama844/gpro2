const express = require('express');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const router = express.Router();

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.DB_NAME || 'github_editor';

// Get deploy route - render the deploy page
router.get('/', async (req, res) => {
  try {
    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(dbName);
    
    // Check if admin has locked the system
    const adminSettings = await db.collection('admin_settings').findOne({ type: 'system_lock' });
    const isLocked = adminSettings ? adminSettings.locked : false;
    
    await client.close();
    
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Deploy - GitHub File Editor</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          
          .deploy-container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            padding: 40px;
            text-align: center;
            max-width: 500px;
            width: 100%;
          }
          
          .deploy-icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            font-size: 32px;
            color: white;
          }
          
          h1 {
            color: #2d3748;
            margin-bottom: 16px;
            font-size: 28px;
            font-weight: 700;
          }
          
          .status-message {
            margin-bottom: 32px;
            padding: 16px;
            border-radius: 8px;
            font-weight: 500;
          }
          
          .status-locked {
            background: #fed7d7;
            color: #c53030;
            border: 1px solid #feb2b2;
          }
          
          .status-available {
            background: #c6f6d5;
            color: #2f855a;
            border: 1px solid #9ae6b4;
          }
          
          .deploy-button {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 16px 32px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            width: 100%;
            max-width: 200px;
          }
          
          .deploy-button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
          }
          
          .deploy-button:disabled {
            background: #a0aec0;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
          }
          
          .loading {
            display: none;
            margin-top: 20px;
            color: #667eea;
          }
          
          .result {
            margin-top: 20px;
            padding: 16px;
            border-radius: 8px;
            display: none;
          }
          
          .result.success {
            background: #c6f6d5;
            color: #2f855a;
            border: 1px solid #9ae6b4;
          }
          
          .result.error {
            background: #fed7d7;
            color: #c53030;
            border: 1px solid #feb2b2;
          }
          
          .back-link {
            display: inline-block;
            margin-top: 24px;
            color: #667eea;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.3s ease;
          }
          
          .back-link:hover {
            color: #764ba2;
          }
        </style>
      </head>
      <body>
        <div class="deploy-container">
          <div class="deploy-icon">🚀</div>
          <h1>Deploy Application</h1>
          
          ${isLocked ? `
            <div class="status-message status-locked">
              ⚠️ Deployment is currently disabled by administrator
            </div>
          ` : `
            <div class="status-message status-available">
              ✅ Deployment is available
            </div>
          `}
          
          <button 
            class="deploy-button" 
            onclick="triggerDeploy()" 
            ${isLocked ? 'disabled' : ''}
          >
            ${isLocked ? '🔒 Deploy Locked' : '🚀 Deploy Now'}
          </button>
          
          <div class="loading" id="loading">
            <div>⏳ Triggering deployment...</div>
          </div>
          
          <div class="result" id="result"></div>
          
          <a href="/" class="back-link">← Back to Home</a>
        </div>
        
        <script>
          async function triggerDeploy() {
            const button = document.querySelector('.deploy-button');
            const loading = document.getElementById('loading');
            const result = document.getElementById('result');
            
            // Reset states
            result.style.display = 'none';
            result.className = 'result';
            
            // Show loading
            button.disabled = true;
            loading.style.display = 'block';
            
            try {
              const response = await fetch('/deploy/trigger', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                }
              });
              
              const data = await response.json();
              
              if (response.ok) {
                result.className = 'result success';
                result.innerHTML = '✅ ' + data.message;
              } else {
                result.className = 'result error';
                result.innerHTML = '❌ ' + data.error;
              }
            } catch (error) {
              result.className = 'result error';
              result.innerHTML = '❌ Failed to trigger deployment: ' + error.message;
            } finally {
              // Hide loading and show result
              loading.style.display = 'none';
              result.style.display = 'block';
              button.disabled = ${isLocked ? 'true' : 'false'};
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error loading deploy page:', error);
    res.status(500).json({ error: 'Failed to load deploy page' });
  }
});

// POST route to trigger deployment
router.post('/trigger', async (req, res) => {
  try {
    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(dbName);
    
    // Check if admin has locked the system
    const adminSettings = await db.collection('admin_settings').findOne({ type: 'system_lock' });
    const isLocked = adminSettings ? adminSettings.locked : false;
    
    await client.close();
    
    if (isLocked) {
      return res.status(403).json({ error: 'Deployment is currently disabled by administrator' });
    }
    
    // Get deploy hook URL from environment
    const deployHook = process.env.DEPLOY;
    
    if (!deployHook) {
      return res.status(500).json({ error: 'Deploy hook URL not configured' });
    }
    
    // Trigger the Render deployment
    const response = await axios.post(deployHook);
    
    if (response.status === 200 || response.status === 201) {
      res.json({ 
        message: 'Deployment triggered successfully!',
        status: 'success'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to trigger deployment',
        status: response.status
      });
    }
    
  } catch (error) {
    console.error('Error triggering deployment:', error);
    res.status(500).json({ 
      error: 'Failed to trigger deployment: ' + error.message 
    });
  }
});

module.exports = router;