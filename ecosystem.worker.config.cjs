module.exports = {
  apps: [
    {
      name: "autozap-worker",
      cwd: "/var/www/autozap",
      script: "scripts/with-env.sh",
      args: "node --import tsx scripts/background-worker.ts",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        WORKER_GRACEFUL_SHUTDOWN_MS: "10000"
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      kill_timeout: 15000,
      restart_delay: 5000,
      time: true,
      out_file: "/var/www/autozap/logs/pm2/worker-out.log",
      error_file: "/var/www/autozap/logs/pm2/worker-error.log",
      merge_logs: true
    }
  ]
};
