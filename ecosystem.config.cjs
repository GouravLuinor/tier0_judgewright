/**
 * PM2 process definition — the documented production truth (context.md §5).
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup   # once per VPS
 *
 * nginx + certbot terminate TLS for judge.norai.tech and proxy to 127.0.0.1:3005.
 */
module.exports = {
  apps: [
    {
      name: "judge-norai",
      cwd: "/var/www/judge",
      script: "npm",
      args: "start -- -p 3005",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        PORT: 3005,
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
};
