// pm2 process file — run Narayan on a PC/VPS with Node (no Docker).
//   npm run build && pm2 start deploy/ecosystem.config.js
//   pm2 logs narayan      # watch activity + the WhatsApp pairing QR
//   pm2 save && pm2 startup   # survive reboots
module.exports = {
  apps: [
    {
      name: 'narayan',
      script: 'dist/index.js',
      cwd: __dirname + '/..',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      // Keep stdout (so the QR is visible in `pm2 logs`).
      out_file: 'logs/narayan.out.log',
      error_file: 'logs/narayan.err.log',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
