module.exports = {
  apps: [{
    name: 'sistema-rh-pro',
    script: 'server/basic-server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    // Restart delay
    restart_delay: 4000,
    // Watch options for development
    ignore_watch: [
      'node_modules',
      'logs',
      'client/dist',
      '.git'
    ],
    // Health check
    health_check_grace_period: 3000,
    // Environment variables
    env_file: '.env'
  }]
};