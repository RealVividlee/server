# Production Hardening (Nginx + Node)

## Critical fix for your current issue (`/data/orders.db` exposed)
If `https://your-domain/data/orders.db` returns `200`, Nginx is serving files directly from a web root that contains your app `data/` directory.

Apply **both** protections:
1. Move runtime data outside web root by setting `DATA_DIR=/var/lib/leelayer`.
2. Explicitly block `/data` in Nginx.

## Nginx baseline (reverse proxy + block data paths)
Use Nginx as TLS terminator/reverse proxy and only expose 80/443 publicly.

```nginx
server {
  listen 80;
  server_name your-domain.com www.your-domain.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name your-domain.com www.your-domain.com;

  ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

  client_max_body_size 12m;

  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options DENY always;
  add_header Referrer-Policy no-referrer always;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

  # Block accidental file exposure under /data and dotfiles.
  location ^~ /data/ { return 404; }
  location ~ /\. { deny all; }

  location / {
    proxy_pass http://127.0.0.1:4173;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

## Required environment variables
Set these before starting Node in production:

- `NODE_ENV=production`
- `DATA_DIR=/var/lib/leelayer`
- `REVIEW_KEY=<long-random-secret>`
- `ORDER_TOKEN_SECRET=<long-random-secret>`
- `ADMIN_USERNAME=<admin-user>`
- `ADMIN_PASSWORD=<strong-password>`

## One-time VPS cleanup
If the file was publicly reachable, assume compromise and rotate secrets:

1. Rotate `ADMIN_PASSWORD`
2. Rotate `REVIEW_KEY`
3. Rotate `ORDER_TOKEN_SECRET`
4. Rotate `OPENAI_API_KEY` (if configured)

Then move old data and lock permissions:

```bash
sudo mkdir -p /var/lib/leelayer/uploads
sudo rsync -a /path/to/app/data/ /var/lib/leelayer/
sudo chown -R www-data:www-data /var/lib/leelayer
sudo chmod -R o-rwx /var/lib/leelayer
```

## Notes
- Public order lookups require both `orderId` and per-order token.
- Admin/review endpoints allow either valid review key or valid Basic admin credentials.
- App-level static serving also blocks `/data`, but Nginx must block it too.
