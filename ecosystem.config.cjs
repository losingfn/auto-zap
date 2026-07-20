module.exports = {
  apps: [
    {
      name: "autozap",
      cwd: "/var/www/autozap",
      script: ".next/standalone/server.js",
      env: {
        NODE_ENV: "production",
        HOSTNAME: "127.0.0.1",
        PORT: "3000"
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "900M",
      restart_delay: 5000,
      time: true,
      out_file: "/var/www/autozap/logs/pm2/out.log",
      error_file: "/var/www/autozap/logs/pm2/error.log",
      merge_logs: true
    }
  ]
};
