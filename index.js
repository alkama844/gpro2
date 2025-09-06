const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const repos = {
  repo1: {
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO,
    filePath: process.env.GITHUB_FILE_PATH,
    name: "Primary Repository"
  },
  repo2: {
    token: process.env.GITHUB_TOKEN2,
    repo: process.env.GITHUB_REPO2,
    filePath: process.env.GITHUB_FILE_PATH2,
    name: "Secondary Repository"
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
          <title>Dual Repository GitHub Editor</title>
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
            
            .header {
              text-align: center;
              margin-bottom: 3rem;
              color: white;
            }
            
            .header h1 {
              font-size: 2.5rem;
              margin-bottom: 0.5rem;
              text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            }
            
            .header p {
              font-size: 1.1rem;
              opacity: 0.9;
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
              font-size: 1.3rem;
              font-weight: bold;
              color: #333;
            }
            
            .repo-info {
              font-size: 0.9rem;
              color: #666;
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
            
            .success-message {
              position: fixed;
              top: 20px;
              right: 20px;
              background: #d4edda;
              color: #155724;
              padding: 1rem 1.5rem;
              border-radius: 8px;
              border-left: 4px solid #28a745;
              box-shadow: 0 10px 20px rgba(0,0,0,0.1);
              transform: translateX(400px);
              transition: transform 0.3s ease;
              z-index: 1000;
            }
            
            .success-message.show {
              transform: translateX(0);
            }
            
            .repo-path {
              font-family: monospace;
              background: #f8f9fa;
              padding: 0.3rem 0.6rem;
              border-radius: 4px;
              font-size: 0.85rem;
              color: #495057;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚀 Dual Repository Manager</h1>
              <p>Manage files across multiple GitHub repositories with ease</p>
            </div>
            
            <div class="repos-grid">
              ${Object.entries(repoData).map(([key, data]) => `
                <div class="repo-card">
                  <div class="repo-header">
                    <div>
                      <div class="repo-title">${data.config.name}</div>
                      <div class="repo-info">
                        <div><strong>Repository:</strong> ${data.config.repo}</div>
                        <div><strong>File:</strong> <span class="repo-path">${data.config.filePath}</span></div>
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
                      <label class="form-label">File Content:</label>
                      <textarea 
                        name="content" 
                        class="form-textarea" 
                        placeholder="Enter your content here..."
                        ${data.error ? 'disabled' : ''}
                      >${data.content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</textarea>
                    </div>
                    <button type="submit" class="btn ${key === 'repo1' ? 'btn-primary' : 'btn-secondary'}" ${data.error ? 'disabled' : ''}>
                      <span class="btn-text">💾 Save Changes</span>
                      <span class="btn-loading" style="display: none;">
                        <span class="loading"></span>Saving...
                      </span>
                    </button>
                  </form>
                </div>
              `).join('')}
            </div>
          </div>
          
          <script>
            function showLoading(form) {
              const btn = form.querySelector('button[type="submit"]');
              const btnText = btn.querySelector('.btn-text');
              const btnLoading = btn.querySelector('.btn-loading');
              
              btnText.style.display = 'none';
              btnLoading.style.display = 'inline-flex';
              btn.disabled = true;
            }
            
            function showSuccess(message) {
              const successDiv = document.createElement('div');
              successDiv.className = 'success-message';
              successDiv.innerHTML = '<strong>Success!</strong> ' + message;
              document.body.appendChild(successDiv);
              
              setTimeout(() => successDiv.classList.add('show'), 100);
              setTimeout(() => {
                successDiv.classList.remove('show');
                setTimeout(() => document.body.removeChild(successDiv), 300);
              }, 3000);
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
              showSuccess('File updated successfully!');
              // Clean URL
              window.history.replaceState({}, document.title, window.location.pathname);
            }
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
        message: `Updated ${repoConfig.filePath} via Dual Repository Editor`,
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
app.listen(port, () => {
  console.log(`🚀 Dual Repository GitHub Editor running at http://localhost:${port}`);
  console.log(`📊 Status API available at http://localhost:${port}/api/status`);
});