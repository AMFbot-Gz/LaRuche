export default {
  apps: [
    {
      name: "laruche-queen",
      script: "src/queen.js",
      watch: false,
      restart_delay: 3000,
      max_memory_restart: "500M",
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      log_file: ".laruche/logs/queen.log",
      error_file: ".laruche/logs/queen-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "laruche-hud",
      script: "hud/main.js",
      interpreter: "electron",
      max_memory_restart: "150M",
      log_file: ".laruche/logs/hud.log",
      error_file: ".laruche/logs/hud-error.log",
    },
    {
      name: "laruche-watcher",
      script: "src/watcher.js",
      max_memory_restart: "50M",
      log_file: ".laruche/logs/watcher.log",
      error_file: ".laruche/logs/watcher-error.log",
    },
    {
      name: "laruche-dashboard",
      script: "dashboard/server.js",
      max_memory_restart: "200M",
      log_file: ".laruche/logs/dashboard.log",
      error_file: ".laruche/logs/dashboard-error.log",
    },
  ],
};
