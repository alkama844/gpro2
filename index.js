const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { MongoClient } = require("mongodb");

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const {
  GITHUB_TOKEN,
  GITHUB_REPO,
  GITHUB_FILE_PATH,
  GITHUB_TOKEN2,
  GITHUB_REPO2,
  GITHUB_FILE_PATH2,
  MONGODB_URI,
  ADMIN_PASSWORD = "nafijpro"
} = process.env;

let systemLocked = false;
const client = new MongoClient(MONGODB_URI);
let logsCollection;

// MongoDB connection and logging
async function logAction(type, data = {}) {
  if (!logsCollection) return;
  await logsCollection.insertOne({ 
    type, 
    data, 
    timestamp: new Date(),
    ip: data.ip || 'unknown'
  });
}

async function loadLockState() {
  if (!logsCollection) return;
  const last = await logsCollection
    .find({ type: "lock-state" })
    .sort({ timestamp: -1 })
    .limit(1)
    .toArray();
  if (last.length) {
    systemLocked = last[0].data.locked;
    console.log(`🔒 Lock state restored: ${systemLocked ? "LOCKED" : "UNLOCKED"}`);
  }
}

async function saveLockState(locked, ip = 'unknown') {
  systemLocked = locked;
  await logsCollection.insertOne({ 
    type: "lock-state", 
    data: { locked, ip }, 
    timestamp: new Date() 
  });
}

// Initialize MongoDB connection
client.connect()
  .then(async () => {
    const db = client.db("secure_edit");
    logsCollection = db.collection("edit_logs");
    console.log("🟢 Connected to MongoDB");
    await loadLockState();
  })
  .catch(err => {
    console.error("❌ MongoDB connection failed:", err);
  });

const repos = {
  repo1: {
    token: GITHUB_TOKEN,
    repo: GITHUB_REPO,
    filePath: GITHUB_FILE_PATH,
    name: "BOT COOKIE"
  },
  repo2: {
    token: GITHUB_TOKEN2,
    repo: GITHUB_REPO2,
    filePath: GITHUB_FILE_PATH2,
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
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
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

    // Log page access
    await logAction("page_access", { page: "dashboard", ip: clientIP });

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Cookie Manager Dashboard ${systemLocked ? '🔐' : ''}</title>
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
              0%, 100% { 
                transform: scale(1);
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
              }
              50% { 
                transform: scale(1.02);
                box-shadow: 0 25px 50px rgba(102, 126, 234, 0.2);
              }
            }
            
            .repo-card:hover {
              background: linear-gradient(135deg, #2a2a3a 0%, #3a3a4a 100%);
              border-color: #4a9eff;
              transition: all 0.3s ease;
            }
            
            @keyframes glow {
              0%, 100% { box-shadow: 0 0 20px rgba(102, 126, 234, 0.3); }
              50% { box-shadow: 0 0 30px rgba(102, 126, 234, 0.6); }
            }
            
            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              25% { transform: translateX(-5px); }
              75% { transform: translateX(5px); }
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
            
            .system-status {
              position: fixed;
              top: 20px;
              left: 20px;
              background: ${systemLocked ? 'rgba(220, 53, 69, 0.9)' : 'rgba(40, 167, 69, 0.9)'};
              color: white;
              padding: 0.5rem 1rem;
              border-radius: 20px;
              font-size: 0.9rem;
              font-weight: bold;
              z-index: 1000;
              animation: ${systemLocked ? 'shake 1.5s infinite' : 'slideInRight 0.5s ease-out'};
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
            
            .admin-controls {
              position: fixed;
              bottom: 20px;
              right: 20px;
              z-index: 1000;
            }
            
            .admin-btn {
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
              border: none;
              padding: 0.8rem 1.5rem;
              border-radius: 25px;
              font-size: 0.9rem;
              font-weight: bold;
              cursor: pointer;
              transition: all 0.3s ease;
              text-decoration: none;
              display: inline-block;
              box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            }
            
            .admin-btn:hover {
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(0,0,0,0.3);
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
              ${systemLocked ? 'opacity: 0.6; pointer-events: none;' : ''}
            }
            .repo-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(59, 130, 246, 0.3);
                border-color: #3b82f6;
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
            
            .status-locked {
              background: #f8d7da;
              color: #721c24;
              animation: pulseStatus 2s infinite;
            }
            
            @keyframes pulseStatus {
              0%, 100% { 
                transform: scale(1);
                opacity: 1;
              }
              50% { 
                transform: scale(1.05);
                opacity: 0.8;
              }
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
            
            .btn:disabled {
              opacity: 0.5;
              cursor: not-allowed;
              transform: none !important;
            }
            
            .error-message {
              background: #f8d7da;
              color: #721c24;
              padding: 1rem;
              border-radius: 8px;
              margin-bottom: 1rem;
              border-left: 4px solid #dc3545;
            }
            
            .locked-message {
              background: #f8d7da;
              color: #721c24;
              padding: 1rem;
              border-radius: 8px;
              margin-bottom: 1rem;
              border-left: 4px solid #dc3545;
              text-align: center;
              font-weight: bold;
              animation: pulseStatus 2s infinite;
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
              position: relative;
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
          <div class="system-status">
            ${systemLocked ? '🔐 SYSTEM LOCKED' : '🟢 SYSTEM ACTIVE'}
          </div>
          
          <div class="connection-status" id="connectionStatus">
            🔌 Connecting...
          </div>
          
          <div class="admin-controls">
            <a href="/admin" class="admin-btn">🔧 Admin Panel</a>
          </div>
          
          <div class="container">
            <div class="header">
              <h1>🍪 Cookie Manager Dashboard</h1>
              <p>Real-time cookie management with version control & MongoDB logging</p>
            </div>
            
            ${systemLocked ? `
              <div class="locked-message">
                🔐 SYSTEM IS CURRENTLY LOCKED - EDITING DISABLED
                <br><small>Contact administrator to unlock the system</small>
              </div>
            ` : ''}
            
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
                    <div class="status-badge ${systemLocked ? 'status-locked' : (data.error ? 'status-error' : 'status-success')}">
                      ${systemLocked ? 'Locked' : (data.error ? 'Error' : 'Connected')}
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
                        ${data.error || systemLocked ? 'disabled' : ''}
                      >${data.content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</textarea>
                    </div>
                    <button type="submit" class="btn ${key === 'repo1' ? 'btn-primary' : 'btn-secondary'}" ${data.error || systemLocked ? 'disabled' : ''}>
                      <span class="btn-text">💾 Save Changes</span>
                      <span class="btn-loading" style="display: none;">
                        <span class="loading"></span>Saving...
                      </span>
                    </button>
                    <button type="button" class="btn btn-history" onclick="showHistory('${key}')" ${data.error || systemLocked ? 'disabled' : ''}>
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
            
            socket.on('systemLocked', () => {
              showNotification('🔐 System has been locked by administrator!', 'error');
              setTimeout(() => location.reload(), 2000);
            });
            
            socket.on('systemUnlocked', () => {
              showNotification('🔓 System has been unlocked by administrator!', 'success');
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
                      <button class="btn btn-restore" onclick="restoreVersion('\${repoKey}', '\${commit.sha}')" ${systemLocked ? 'disabled' : ''}>
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
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    if (systemLocked) {
      await logAction("blocked_edit", { repoKey: req.params.repoKey, ip: clientIP });
      return res.status(403).send(`
        <html>
          <body style="font-family: monospace; padding: 2rem; background: #f8d7da; color: #721c24;">
            <h2>🔐 System Locked</h2>
            <p>Editing is currently disabled by administrator.</p>
            <a href="/" style="color: #721c24;">← Go Back</a>
          </body>
        </html>
      `);
    }
    
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

    // Log the update
    await logAction("file_update", { 
      repoKey, 
      repoName: repoConfig.name,
      ip: clientIP,
      contentLength: req.body.content.length
    });

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

// Admin Panel
app.get("/admin", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Admin Panel</title>
        <style>
          body { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff; 
            font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace; 
            padding: 2rem;
            min-height: 100vh;
            margin: 0;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: rgba(255,255,255,0.1);
            padding: 2rem;
            border-radius: 16px;
            backdrop-filter: blur(10px);
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
          }
          input, button {
            padding: 12px 20px;
            font-size: 16px;
            margin: 8px;
            background: rgba(255,255,255,0.9);
            color: #333;
            border: 2px solid transparent;
            border-radius: 8px;
            font-family: inherit;
            transition: all 0.3s ease;
          }
          input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.3);
          }
          button {
            cursor: pointer;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            min-width: 150px;
          }
          .btn-lock {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
          }
          .btn-unlock {
            background: linear-gradient(135deg, #51cf66 0%, #40c057 100%);
            color: white;
          }
          .btn-clear {
            background: linear-gradient(135deg, #ff8cc8 0%, #ff6b9d 100%);
            color: white;
          }
          .btn-logs {
            background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%);
            color: white;
          }
          button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.3);
          }
          .status {
            text-align: center;
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 2rem;
            font-weight: bold;
            font-size: 1.2rem;
          }
          .status.locked {
            background: rgba(220, 53, 69, 0.2);
            border: 2px solid #dc3545;
            animation: pulseStatus 2s infinite;
          }
          .status.unlocked {
            background: rgba(40, 167, 69, 0.2);
            border: 2px solid #28a745;
          }
          .back-link {
            color: #fff;
            text-decoration: none;
            font-size: 1.1rem;
            display: inline-block;
            margin-top: 2rem;
            padding: 0.5rem 1rem;
            background: rgba(255,255,255,0.1);
            border-radius: 8px;
            transition: all 0.3s ease;
          }
          .back-link:hover {
            background: rgba(255,255,255,0.2);
            transform: translateX(-5px);
          }
          h2 {
            text-align: center;
            margin-bottom: 2rem;
            font-size: 2rem;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>🔧 Admin Control Panel</h2>
          
          <div class="status ${systemLocked ? 'locked' : 'unlocked'}">
            ${systemLocked ? '🔐 SYSTEM IS LOCKED' : '🟢 SYSTEM IS ACTIVE'}
          </div>
          
          <form method="POST" action="/admin">
            <div style="text-align: center; margin-bottom: 2rem;">
              <input type="password" name="password" placeholder="Enter admin password" required style="width: 250px;" />
            </div>
            
            <div style="text-align: center;">
              <button name="action" value="lock" class="btn-lock">🔐 Lock System</button>
              <button name="action" value="unlock" class="btn-unlock">🔓 Unlock System</button>
              <br>
              <button name="action" value="clear" class="btn-clear">🧹 Clear All Files</button>
              <button name="action" value="logs" class="btn-logs">📊 View Logs</button>
            </div>
          </form>
          
          <div style="text-align: center;">
            <a href="/" class="back-link">⬅️ Back to Dashboard</a>
          </div>
        </div>
      </body>
    </html>
  `);
});

app.post("/admin", async (req, res) => {
  const { password, action } = req.body;
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  
  if (password !== ADMIN_PASSWORD) {
    await logAction("admin_failed_login", { ip: clientIP });
    return res.status(401).send(`
      <html>
        <body style="font-family: monospace; padding: 2rem; background: #f8d7da; color: #721c24;">
          <h2>❌ Access Denied</h2>
          <p>Wrong password!</p>
          <a href="/admin" style="color: #721c24;">← Try Again</a>
        </body>
      </html>
    `);
  }

  if (action === "lock") {
    await saveLockState(true, clientIP);
    await logAction("admin_action", { action: "lock", ip: clientIP });
    io.emit('systemLocked');
    return res.send(`
      <html>
        <body style="font-family: monospace; padding: 2rem; background: #d4edda; color: #155724;">
          <h2>✅ System Locked</h2>
          <p>All editing has been disabled.</p>
          <a href="/admin" style="color: #155724;">← Back to Admin</a>
        </body>
      </html>
    `);
  }

  if (action === "unlock") {
    await saveLockState(false, clientIP);
    await logAction("admin_action", { action: "unlock", ip: clientIP });
    io.emit('systemUnlocked');
    return res.send(`
      <html>
        <body style="font-family: monospace; padding: 2rem; background: #d4edda; color: #155724;">
          <h2>✅ System Unlocked</h2>
          <p>Editing has been re-enabled.</p>
          <a href="/admin" style="color: #155724;">← Back to Admin</a>
        </body>
      </html>
    `);
  }

  if (action === "clear") {
    try {
      for (const [key, config] of Object.entries(repos)) {
        const file = await getFileInfo(config);
        await axios.put(
          `https://api.github.com/repos/${config.repo}/contents/${config.filePath}`,
          {
            message: `File cleared by admin via Cookie Manager Dashboard`,
            content: Buffer.from("").toString("base64"),
            sha: file.sha
          },
          {
            headers: {
              Authorization: `Bearer ${config.token}`,
              Accept: "application/vnd.github+json"
            }
          }
        );
      }
      await logAction("admin_action", { action: "clear_all", ip: clientIP });
      return res.send(`
        <html>
          <body style="font-family: monospace; padding: 2rem; background: #d4edda; color: #155724;">
            <h2>✅ All Files Cleared</h2>
            <p>Both repository files have been cleared.</p>
            <a href="/admin" style="color: #155724;">← Back to Admin</a>
          </body>
        </html>
      `);
    } catch (err) {
      return res.status(500).send(`
        <html>
          <body style="font-family: monospace; padding: 2rem; background: #f8d7da; color: #721c24;">
            <h2>❌ Clear Failed</h2>
            <p><strong>Error:</strong> ${err.message}</p>
            <a href="/admin" style="color: #721c24;">← Back to Admin</a>
          </body>
        </html>
      `);
    }
  }

  if (action === "logs") {
    try {
      const logs = await logsCollection
        .find({})
        .sort({ timestamp: -1 })
        .limit(50)
        .toArray();
      
      const logsHtml = logs.map(log => `
        <div style="border: 1px solid #ddd; padding: 1rem; margin: 0.5rem 0; border-radius: 8px; background: rgba(255,255,255,0.1);">
          <strong>${log.type.toUpperCase()}</strong> - ${new Date(log.timestamp).toLocaleString()}
          <br><small>IP: ${log.data.ip || 'unknown'}</small>
          <br><pre style="margin-top: 0.5rem; font-size: 0.9rem;">${JSON.stringify(log.data, null, 2)}</pre>
        </div>
      `).join('');
      
      return res.send(`
        <html>
          <head>
            <title>System Logs</title>
            <style>
              body { 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #fff; 
                font-family: monospace; 
                padding: 2rem;
                min-height: 100vh;
                margin: 0;
              }
              .container {
                max-width: 1000px;
                margin: 0 auto;
                background: rgba(255,255,255,0.1);
                padding: 2rem;
                border-radius: 16px;
                backdrop-filter: blur(10px);
                box-shadow: 0 20px 40px rgba(0,0,0,0.2);
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h2>📊 System Logs (Last 50 entries)</h2>
              ${logsHtml}
              <a href="/admin" style="color: #fff; text-decoration: none; display: inline-block; margin-top: 2rem; padding: 0.5rem 1rem; background: rgba(255,255,255,0.1); border-radius: 8px;">← Back to Admin</a>
            </div>
          </body>
        </html>
      `);
    } catch (err) {
      return res.status(500).send("Failed to load logs: " + err.message);
    }
  }

  res.send("❌ Unknown action. <a href='/admin'>Back</a>");
});

// API endpoint to get file history
app.get("/api/history/:repoKey", async (req, res) => {
  try {
    const repoKey = req.params.repoKey;
    const repoConfig = repos[repoKey];
    
    if (!repoConfig) {
      return res.status(400).json({ error: "Invalid repository key" });
    }
    
    if (systemLocked) {
      return res.status(403).json({ error: "System is locked" });
    }
    
    const history = await getFileHistory(repoConfig, 1, 20);
    res.json(history);
  } catch (err) {
    console.error(`History API error for ${repoKey}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// API endpoint to restore a specific version
app.post("/api/restore/:repoKey/:sha", async (req, res) => {
  try {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    if (systemLocked) {
      await logAction("blocked_restore", { repoKey: req.params.repoKey, sha: req.params.sha, ip: clientIP });
      return res.status(403).json({ error: "System is locked" });
    }
    
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
    
    // Log the restore
    await logAction("file_restore", { 
      repoKey, 
      repoName: repoConfig.name,
      sha: sha.substring(0, 7),
      ip: clientIP
    });
    
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
  
  status.systemLocked = systemLocked;
  res.json(status);
});

// Handle 404 errors
app.use((req, res) => {
  res.status(404).send(`
    <html>
      <head>
        <title>404 - Page Not Found</title>
        <style>
          body {
            font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            color: white;
          }
          .error-container {
            text-align: center;
            background: rgba(255,255,255,0.1);
            padding: 3rem;
            border-radius: 16px;
            backdrop-filter: blur(10px);
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
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
          h1 {
            font-size: 4rem;
            margin-bottom: 1rem;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
          }
          p {
            font-size: 1.2rem;
            margin-bottom: 2rem;
            opacity: 0.9;
          }
          .back-btn {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
            text-decoration: none;
            padding: 1rem 2rem;
            border-radius: 25px;
            font-weight: bold;
            transition: all 0.3s ease;
            display: inline-block;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
          }
          .back-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.3);
          }
        </style>
      </head>
      <body>
        <div class="error-container">
          <h1>404</h1>
          <p>🔍 Page not found</p>
          <p>The page you're looking for doesn't exist or has been moved.</p>
          <a href="/" class="back-btn">🏠 Go Home</a>
        </div>
      </body>
    </html>
  `);
});

// Handle server errors
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send(`
    <html>
      <head>
        <title>500 - Server Error</title>
        <style>
          body {
            font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            color: white;
          }
          .error-container {
            text-align: center;
            background: rgba(255,255,255,0.1);
            padding: 3rem;
            border-radius: 16px;
            backdrop-filter: blur(10px);
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
          }
          h1 {
            font-size: 4rem;
            margin-bottom: 1rem;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            color: #ff6b6b;
          }
          .back-btn {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
            text-decoration: none;
            padding: 1rem 2rem;
            border-radius: 25px;
            font-weight: bold;
            transition: all 0.3s ease;
            display: inline-block;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
          }
          .back-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.3);
          }
        </style>
      </head>
      <body>
        <div class="error-container">
          <h1>500</h1>
          <p>⚠️ Internal Server Error</p>
          <p>Something went wrong on our end. Please try again later.</p>
          <a href="/" class="back-btn">🏠 Go Home</a>
        </div>
      </body>
    </html>
  `);
});

// 🤥 Fake console codes (keeping your original style)
let chars = "アァイィウヴカガキギクグケコゴサシスセソタチツテトナニヌネノハバヒビフヘホマミムメモヤユヨラリルレロワン0123456789";
let iCounter = 0;
const interval = setInterval(() => {
  if (iCounter++ > 30) return clearInterval(interval);
  console.log(`%c${Array.from({ length: 50 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")}`, "color: #0f0; font-family: monospace;");
}, 100);

console.log("%c⚠ WARNING ⚠", "color: red; font-size: 30px; font-weight: bold; text-shadow: 2px 2px black;");
console.log("%cThis is a secure zone.\nAny inspection attempt will be logged.\nPowered by: NAFIJ PRO Security Systems™", "color: orange; font-size: 14px; font-family: monospace;");

const style = "color: #0f0; font-family: monospace;";
console.clear();
console.log("%c🛸 INITIATING PROTOCOL: NAFIJ PRO SYSTEM OVERRIDE", style);

setTimeout(() => console.log("%cConnecting to secure terminal...", style), 500);
setTimeout(() => console.log("%cAuthorizing credentials: ****** ✔", style), 1000);
setTimeout(() => console.log("%cFetching app data.json 🔍", style), 1500);
setTimeout(() => console.log("%cBypassing firewall... [%c■■■■■■■■■░░░░░░░░░░%c] 45%%", style, "color: lime", style), 2000);
setTimeout(() => console.log("%cPayload injection successful. Deploying scripts ⚙", style), 2500);
setTimeout(() => console.log("%cActivating root shell... 🔓", style), 3000);
setTimeout(() => console.log("%c[ACCESS GRANTED] Welcome, commander NAFIJ PRO 👨‍💻", "color: #00ff00; font-weight: bold; font-size: 16px;"), 3500);

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`🚀 Cookie Manager Dashboard running at http://localhost:${port}`);
  console.log(`📊 Status API available at http://localhost:${port}/api/status`);
  console.log(`🔌 Socket.io enabled for real-time updates`);
  console.log(`🗄️ MongoDB logging system active`);
  console.log(`🔐 Admin panel available at http://localhost:${port}/admin`);
});