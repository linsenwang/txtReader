module.exports = {
  apps: [{
    name: 'txt',
    script: './server.js',
    cwd: '/Users/yangqian/Downloads/txtReader',
    env: {
      NODE_ENV: 'production',
      PRO_DIR: '/Users/yangqian/Library/CloudStorage/OneDrive-Personal/001_kimi_chat',
      PORT: 3000,
      HOST: '127.0.0.1',
      HASHES_FILE: '/Users/yangqian/Library/CloudStorage/OneDrive-Personal/001_kimi_chat/.txtreader_progress.json'
    },
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
