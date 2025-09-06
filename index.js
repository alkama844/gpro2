const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const { createServer } = require("http");
const { Server } = require("socket.io");

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const repos = {
  repo1: {
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO,
    filePath: process.env.GITHUB_FILE_PATH,
    name: "BOT COOKIE"
  },
  repo2: {
    token: process.env.GITHUB_TOKEN2,
    repo: process.env.GITHUB_REPO2,
    filePath: process.env.GITHUB_FILE_PATH2,
    name: "FACEBOOK COOKIE"
  }
};

async function getFileInfo(repoConfig) {
  const res = await axios.get(
    `https://api.github.com/repos/${repoConfig.repo}/contents/${repoConfig.filePath}`,
    {
      headers: {
        Authorization: `Bearer ${repoConfig.token}`,
        Accept: "application/vnd.github+json"
      }
    }
  );
  return res.data;
}

async function getFileHistory(repoConfig, page = 1, perPage = 10) {
  const res = await axios.get(
    `https://api.github.com/repos/${repoConfig.repo}/commits?path=${repoConfig.filePath}&page=${page}&per_page=${perPage}`,
    {
      headers: {
        Authorization: `Bearer ${repoConfig.token}`,
        Accept: "application/vnd.github+json"
      }
    }
  );
  return res.data;
}

async function getFileContentAtCommit(repoConfig, sha) {
  const res = await axios.get(
    `https://api.github.com/repos/${repoConfig.repo}/contents/${repoConfig.filePath}?ref=${sha}`,
    {
      headers: {
        Authorization: `Bearer ${repoConfig.token}`,
        Accept: "application/vnd.github+json"
      }
    }
  );
  return Buffer.from(res.data.content, "base64").toString("utf-8");
}

async function getLastCommitTime(repoConfig) {
  const res = await axios.get(
    `https://api.github.com/repos/${repoConfig.repo}/commits?path=${repoConfig.filePath}&page=1&per_page=1`,
    {
      headers: {
        Authorization: `Bearer ${repoConfig.token}`,
        Accept: "application/vnd.github+json"
      }
    }
  );
  return new Date(res.data[0].commit.committer.date);
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date) / 1000);
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Admin connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Admin disconnected:', socket.id);
  });
});

app.get("/", async (req, res) => {
  try {
    const repoData = {};
    
    for (const [key, config] of Object.entries(repos)) {
      try {
        const file = await getFileInfo(config);
        const content = Buffer.from(file.content, "base64").toString("utf-8");
        const lastCommitDate = await getLastCommitTime(config);
        const updatedAgo = timeAgo(lastCommitDate);
        
        repoData[key] = {
          content,
          updatedAgo,
          config,
          error: null
        };
      } catch (err) {
        repoData[key] = {
          content: "",
          updatedAgo: "Unknown",
          config,
          error: err.message
        };
      }
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Cookie Manager Dashboard</title>
          <script src="/socket.io/socket.io.js"></script>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              padding: 2rem;
              color: #333;
            }
            
            .container {
              max-width: 1400px;
              margin: 0 auto;
              animation: fadeInUp 0.8s ease-out;
            }
            
            @keyframes fadeInUp {
              from {
                opacity: 0;
                transform: translateY(30px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            
            @keyframes slideInRight {
              from {
                opacity: 0;
                transform: translateX(100px);
              }
              to {
                opacity: 1;
                transform: translateX(0);
              }
            }
            
            @keyframes pulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.05); }
            }
            
            @keyframes glow {
              0%, 100% { box-shadow: 0 0 20px rgba(102, 126, 234, 0.3); }
              50% { box-shadow: 0 0 30px rgba(102, 126, 234, 0.6); }
            }
            
            .header {
              text-align: center;
              margin-bottom: 3rem;
              color: white;
            }
            
            .header h1 {
              font-size: 2.5rem;
              margin-bottom: 0.5rem;
              text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
              animation: glow 3s ease-in-out infinite;
            }
            
            .header p {
              font-size: 1.1rem;
              opacity: 0.9;
            }
            
            .connection-status {
              position: fixed;
              top: 20px;
              right: 20px;
              background: rgba(255,255,255,0.9);
              padding: 0.5rem 1rem;
              border-radius: 20px;
              font-size: 0.9rem;
              z-index: 1000;
              animation: slideInRight 0.5s ease-out;
            }
            
            .connection-status.connected {
              color: #28a745;
            }
            
            .connection-status.disconnected {
              color: #dc3545;
            }
            
            .repos-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 2rem;
              margin-bottom: 2rem;
            }
            
            @media (max-width: 768px) {
              .repos-grid {
                grid-template-columns: 1fr;
              }
            }
            
            .repo-card {
              background: white;
              border-radius: 16px;
              padding: 2rem;
              box-shadow: 0 20px 40px rgba(0,0,0,0.1);
              transition: all 0.3s ease;
              position: relative;
              overflow: hidden;
            }
            
            .repo-card::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              height: 4px;
              background: linear-gradient(90deg, #667eea, #764ba2);
            }
            
            .repo-card:hover {
              transform: translateY(-5px);
              box-shadow: 0 25px 50px rgba(0,0,0,0.15);
              animation: pulse 2s infinite;
            }
            
            .repo-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 1.5rem;
              padding-bottom: 1rem;
              border-bottom: 2px solid #f0f0f0;
            }
            
            .repo-title {
              font-size: 1.5rem;
              font-weight: bold;
              color: #333;
              display: flex;
              align-items: center;
              gap: 0.5rem;
            }
            
            .repo-info {
              font-size: 0.9rem;
              color: #666;
              margin-top: 0.5rem;
            }
            
            .status-badge {
              padding: 0.3rem 0.8rem;
              border-radius: 20px;
              font-size: 0.8rem;
              font-weight: bold;
              text-transform: uppercase;
            }
            
            .status-success {
              background: #d4edda;
              color: #155724;
            }
            
            .status-error {
              background: #f8d7da;
              color: #721c24;
            }
            
            .form-group {
              margin-bottom: 1.5rem;
            }
            
            .form-label {
              display: block;
              margin-bottom: 0.5rem;
              font-weight: bold;
              color: #555;
            }
            
            .form-textarea {
              width: 100%;
              height: 300px;
              padding: 1rem;
              border: 2px solid #e0e0e0;
              border-radius: 8px;
              font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
              font-size: 14px;
              line-height: 1.5;
              resize: vertical;
              transition: all 0.3s ease;
              background: #fafafa;
            }
            
            .form-textarea:focus {
              outline: none;
              border-color: #667eea;
              background: white;
              box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            
            .btn {
              padding: 0.8rem 2rem;
              border: none;
              border-radius: 8px;
              font-size: 1rem;
              font-weight: bold;
              cursor: pointer;
              transition: all 0.3s ease;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              position: relative;
              overflow: hidden;
              margin-right: 1rem;
              margin-bottom: 0.5rem;
            }
            
            .btn::before {
              content: '';
              position: absolute;
              top: 0;
              left: -100%;
              width: 100%;
              height: 100%;
              background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
              transition: left 0.5s;
            }
            
            .btn:hover::before {
              left: 100%;
            }
            
            .btn-primary {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            
            .btn-primary:hover {
              transform: translateY(-2px);
              box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
            }
            
            .btn-secondary {
              background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
              color: white;
            }
            
            .btn-secondary:hover {
              transform: translateY(-2px);
              box-shadow: 0 10px 20px rgba(245, 87, 108, 0.3);
            }
            
            .btn-history {
              background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
              color: #8b4513;
            }
            
            .btn-history:hover {
              transform: translateY(-2px);
              box-shadow: 0 10px 20px rgba(252, 182, 159, 0.3);
            }
            
            .error-message {
              background: #f8d7da;
              color: #721c24;
              padding: 1rem;
              border-radius: 8px;
              margin-bottom: 1rem;
              border-left: 4px solid #dc3545;
            }
            
            .loading {
              display: inline-block;
              width: 20px;
              height: 20px;
              border: 3px solid rgba(255,255,255,.3);
              border-radius: 50%;
              border-top-color: #fff;
              animation: spin 1s ease-in-out infinite;
              margin-right: 0.5rem;
            }
            
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            
            .notification {
              position: fixed;
              top: 20px;
              left: 50%;
              transform: translateX(-50%) translateY(-100px);
              background: #d4edda;
              color: #155724;
              padding: 1rem 2rem;
              border-radius: 8px;
              border-left: 4px solid #28a745;
              box-shadow: 0 10px 30px rgba(0,0,0,0.2);
              z-index: 1001;
              transition: all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
              font-weight: bold;
              font-size: 1.1rem;
            }
            
            .notification.show {
              transform: translateX(-50%) translateY(0);
            }
            
            .notification.error {
              background: #f8d7da;
              color: #721c24;
              border-left-color: #dc3545;
            }
            
            .history-modal {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: rgba(0,0,0,0.8);
              display: none;
              z-index: 2000;
              animation: fadeIn 0.3s ease-out;
            }
            
            .history-modal.show {
              display: flex;
              align-items: center;
              justify-content: center;
            }
            
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            
            .history-content {
              background: white;
              border-radius: 16px;
              padding: 2rem;
              max-width: 800px;
              max-height: 80vh;
              overflow-y: auto;
              animation: slideInUp 0.3s ease-out;
            }
            
            @keyframes slideInUp {
              from {
                opacity: 0;
                transform: translateY(50px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            
            .history-item {
              border: 1px solid #e0e0e0;
              border-radius: 8px;
              padding: 1rem;
              margin-bottom: 1rem;
              transition: all 0.3s ease;
            }
            
            .history-item:hover {
              border-color: #667eea;
              box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            }
            
            .history-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 0.5rem;
            }
            
            .commit-message {
              font-weight: bold;
              color: #333;
            }
            
            .commit-date {
              color: #666;
              font-size: 0.9rem;
            }
            
            .commit-author {
              color: #888;
              font-size: 0.8rem;
            }
            
            .btn-restore {
              background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);
              color: #2c5530;
              padding: 0.4rem 1rem;
              font-size: 0.9rem;
            }
            
            .btn-restore:hover {
              transform: translateY(-1px);
              box-shadow: 0 5px 15px rgba(132, 250, 176, 0.3);
            }
            
            .close-modal {
              position: absolute;
              top: 1rem;
              right: 1rem;
              background: none;
              border: none;
              font-size: 1.5rem;
              cursor: pointer;
              color: #666;
            }
            
            .close-modal:hover {
              color: #333;
            }
          </style>
        </head>
        <body>
          <div class="connection-status" id="connectionStatus">
            🔌 Connecting...
          </div>
          
          <div class="container">
            <div class="header">
              <h1>🍪 Cookie Manager Dashboard</h1>
              <p>Real-time cookie management with version control</p>
            </div>
            
            <div class="repos-grid">
              ${Object.entries(repoData).map(([key, data]) => `
                <div class="repo-card">
                  <div class="repo-header">
                    <div>
                      <div class="repo-title">
                        ${key === 'repo1' ? '🤖' : '📘'} ${data.config.name}
                      </div>
                      <div class="repo-info">
                        <div><strong>Last updated:</strong> ${data.updatedAgo}</div>
                      </div>
                    </div>
                    <div class="status-badge ${data.error ? 'status-error' : 'status-success'}">
                      ${data.error ? 'Error' : 'Connected'}
                    </div>
                  </div>
                  
                  ${data.error ? `
                    <div class="error-message">
                      <strong>Error:</strong> ${data.error}
                    </div>
                  ` : ''}
                  
                  <form method="POST" action="/update/${key}" onsubmit="showLoading(this)">
                    <div class="form-group">
                      <label class="form-label">Cookie Content:</label>
                      <textarea 
                        name="content" 
                        class="form-textarea" 
                        placeholder="Enter your cookie data here..."
                        ${data.error ? 'disabled' : ''}
                      >${data.content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</textarea>
                    </div>
                    <button type="submit" class="btn ${key === 'repo1' ? 'btn-primary' : 'btn-secondary'}" ${data.error ? 'disabled' : ''}>
                      <span class="btn-text">💾 Save Changes</span>
                      <span class="btn-loading" style="display: none;">
                        <span class="loading"></span>Saving...
                      </span>
                    </button>
                    <button type="button" class="btn btn-history" onclick="showHistory('${key}')" ${data.error ? 'disabled' : ''}>
                      📜 View History
                    </button>
                  </form>
                </div>
              `).join('')}
            </div>
          </div>
          
          <!-- History Modal -->
          <div class="history-modal" id="historyModal">
            <div class="history-content">
              <button class="close-modal" onclick="closeHistory()">&times;</button>
              <h2 id="historyTitle">File History</h2>
              <div id="historyList"></div>
            </div>
          </div>
          
          <script>
            const socket = io();
            
            socket.on('connect', () => {
              const status = document.getElementById('connectionStatus');
              status.textContent = '🟢 Connected';
              status.className = 'connection-status connected';
            });
            
            socket.on('disconnect', () => {
              const status = document.getElementById('connectionStatus');
              status.textContent = '🔴 Disconnected';
              status.className = 'connection-status disconnected';
            });
            
            socket.on('fileUpdated', (data) => {
              showNotification(\`✅ \${data.repoName} updated successfully!\`, 'success');
              setTimeout(() => location.reload(), 1500);
            });
            
            socket.on('multipleUpdates', (data) => {
              showNotification('✅ Both repositories updated successfully!', 'success');
              setTimeout(() => location.reload(), 2000);
            });
            
            function showLoading(form) {
              const btn = form.querySelector('button[type="submit"]');
              const btnText = btn.querySelector('.btn-text');
              const btnLoading = btn.querySelector('.btn-loading');
              
              btnText.style.display = 'none';
              btnLoading.style.display = 'inline-flex';
              btn.disabled = true;
            }
            
            function showNotification(message, type = 'success') {
              const notification = document.createElement('div');
              notification.className = \`notification \${type === 'error' ? 'error' : ''}\`;
              notification.innerHTML = message;
              document.body.appendChild(notification);
              
              setTimeout(() => notification.classList.add('show'), 100);
              setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => {
                  if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                  }
                }, 500);
              }, 4000);
            }
            
            async function showHistory(repoKey) {
              try {
                const response = await fetch(\`/api/history/\${repoKey}\`);
                const history = await response.json();
                
                const modal = document.getElementById('historyModal');
                const title = document.getElementById('historyTitle');
                const list = document.getElementById('historyList');
                
                const repoName = repoKey === 'repo1' ? 'BOT COOKIE' : 'FACEBOOK COOKIE';
                title.textContent = \`\${repoName} - File History\`;
                
                list.innerHTML = history.map(commit => \`
                  <div class="history-item">
                    <div class="history-header">
                      <div>
                        <div class="commit-message">\${commit.commit.message}</div>
                        <div class="commit-date">\${new Date(commit.commit.committer.date).toLocaleString()}</div>
                        <div class="commit-author">by \${commit.commit.author.name}</div>
                      </div>
                      <button class="btn btn-restore" onclick="restoreVersion('\${repoKey}', '\${commit.sha}')">
                        🔄 Restore
                      </button>
                    </div>
                  </div>
                \`).join('');
                
                modal.classList.add('show');
              } catch (error) {
                showNotification('Failed to load history: ' + error.message, 'error');
              }
            }
            
            function closeHistory() {
              document.getElementById('historyModal').classList.remove('show');
            }
            
            async function restoreVersion(repoKey, sha) {
              if (!confirm('Are you sure you want to restore this version? This will overwrite the current content.')) {
                return;
              }
              
              try {
                const response = await fetch(\`/api/restore/\${repoKey}/\${sha}\`, {
                  method: 'POST'
                });
                
                if (response.ok) {
                  showNotification('✅ Version restored successfully!', 'success');
                  closeHistory();
                  setTimeout(() => location.reload(), 1500);
                } else {
                  throw new Error('Failed to restore version');
                }
              } catch (error) {
                showNotification('Failed to restore version: ' + error.message, 'error');
              }
            }
            
            // Auto-resize textareas
            document.querySelectorAll('.form-textarea').forEach(textarea => {
              textarea.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.max(300, this.scrollHeight) + 'px';
              });
            });
            
            // Check for success parameter in URL
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('success')) {
              showNotification('✅ File updated successfully!', 'success');
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            
            // Close modal when clicking outside
            document.getElementById('historyModal').addEventListener('click', (e) => {
              if (e.target.id === 'historyModal') {
                closeHistory();
              }
            });
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`
      <html>
        <body style="font-family: monospace; padding: 2rem; background: #f8d7da; color: #721c24;">
          <h2>❌ System Error</h2>
          <p><strong>Error:</strong> ${err.message}</p>
          <a href="/" style="color: #721c24;">← Go Back</a>
        </body>
      </html>
    `);
  }
});

app.post("/update/:repoKey", async (req, res) => {
  try {
    const repoKey = req.params.repoKey;
    const repoConfig = repos[repoKey];
    
    if (!repoConfig) {
      return res.status(400).send("Invalid repository key");
    }
    
    const file = await getFileInfo(repoConfig);
    const contentEncoded = Buffer.from(req.body.content).toString("base64");

    await axios.put(
      `https://api.github.com/repos/${repoConfig.repo}/contents/${repoConfig.filePath}`,
      {
        message: `Updated ${repoConfig.name} via Cookie Manager Dashboard`,
        content: contentEncoded,
        sha: file.sha
      },
      {
        headers: {
          Authorization: `Bearer ${repoConfig.token}`,
          Accept: "application/vnd.github+json"
        }
      }
    );

    // Emit real-time notification
    io.emit('fileUpdated', {
      repoKey,
      repoName: repoConfig.name,
      timestamp: new Date().toISOString()
    });

    res.redirect("/?success=true");
  } catch (err) {
    res.status(500).send(`
      <html>
        <body style="font-family: monospace; padding: 2rem; background: #f8d7da; color: #721c24;">
          <h2>❌ Update Failed</h2>
          <p><strong>Error:</strong> ${err.message}</p>
          <a href="/" style="color: #721c24;">← Go Back</a>
        </body>
      </html>
    `);
  }
});

// API endpoint to get file history
app.get("/api/history/:repoKey", async (req, res) => {
  try {
    const repoKey = req.params.repoKey;
    const repoConfig = repos[repoKey];
    
    if (!repoConfig) {
      return res.status(400).json({ error: "Invalid repository key" });
    }
    
    const history = await getFileHistory(repoConfig, 1, 20);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API endpoint to restore a specific version
app.post("/api/restore/:repoKey/:sha", async (req, res) => {
  try {
    const { repoKey, sha } = req.params;
    const repoConfig = repos[repoKey];
    
    if (!repoConfig) {
      return res.status(400).json({ error: "Invalid repository key" });
    }
    
    // Get content from the specific commit
    const oldContent = await getFileContentAtCommit(repoConfig, sha);
    
    // Get current file info for SHA
    const currentFile = await getFileInfo(repoConfig);
    
    // Update with old content
    const contentEncoded = Buffer.from(oldContent).toString("base64");
    
    await axios.put(
      `https://api.github.com/repos/${repoConfig.repo}/contents/${repoConfig.filePath}`,
      {
        message: `Restored ${repoConfig.name} to previous version (${sha.substring(0, 7)})`,
        content: contentEncoded,
        sha: currentFile.sha
      },
      {
        headers: {
          Authorization: `Bearer ${repoConfig.token}`,
          Accept: "application/vnd.github+json"
        }
      }
    );
    
    // Emit real-time notification
    io.emit('fileUpdated', {
      repoKey,
      repoName: repoConfig.name,
      action: 'restored',
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API endpoint to get repository status
app.get("/api/status", async (req, res) => {
  const status = {};
  
  for (const [key, config] of Object.entries(repos)) {
    try {
      await getFileInfo(config);
      status[key] = { connected: true, error: null };
    } catch (err) {
      status[key] = { connected: false, error: err.message };
    }
  }
  
  res.json(status);
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`🚀 Cookie Manager Dashboard running at http://localhost:${port}`);
  console.log(`📊 Status API available at http://localhost:${port}/api/status`);
  console.log(`🔌 Socket.io enabled for real-time updates`);
});