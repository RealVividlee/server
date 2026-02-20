# Production Hardening (Nginx + Node)

## Nginx baseline
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
- `REVIEW_KEY=<long-random-secret>`
- `ORDER_TOKEN_SECRET=<long-random-secret>`
- `ADMIN_USERNAME=<admin-user>`
- `ADMIN_PASSWORD=<strong-password>`

## Notes
- Public order lookups now require both `orderId` and a per-order token.
- Admin/review endpoints allow either valid review key or valid Basic admin credentials.
- Files under `/data` are intentionally blocked from static serving.
