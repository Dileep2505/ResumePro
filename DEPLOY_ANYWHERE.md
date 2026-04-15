# ResumePro Global Deployment (Any Device)

This setup gives public access from any device:

- Frontend: GitHub Pages on `https://resumepro2.me`
- Backend API: Render on `https://api.resumepro2.me`

## 1) GitHub Pages Source

In GitHub repository settings:

1. Open **Settings > Pages**.
2. In **Build and deployment**, set **Source = GitHub Actions** (not "Deploy from a branch").
3. The workflow in `.github/workflows/deploy-pages.yml` will deploy `frontend/webapp`.

## 2) Render Backend Deployment

1. Go to Render dashboard, create **New + > Blueprint**.
2. Connect this GitHub repo.
3. Render will detect `render.yaml`.
4. Deploy service `resumepro-api`.
5. After first deploy, copy service URL, for example:
   - `https://resumepro-api.onrender.com`

## 3) DNS Records (Namecheap)

Configure for the frontend custom domain:

1. `A` record: host `@` -> `185.199.108.153`
2. `A` record: host `@` -> `185.199.109.153`
3. `A` record: host `@` -> `185.199.110.153`
4. `A` record: host `@` -> `185.199.111.153`
5. `CNAME` record: host `www` -> `dileep2505.github.io`

Configure backend subdomain:

1. `CNAME` record: host `api` -> `resumepro-api.onrender.com`

Remove conflicting parking/redirect records for `@`, `www`, and `api`.

## 4) Backend URL in Frontend

`frontend/webapp/config.js` is set to use:

- Local: `http://127.0.0.1:8001`
- Public: `https://api.resumepro2.me`

So once DNS is ready for `api.resumepro2.me`, frontend starts calling your public backend automatically.

## 5) GitHub Pages Domain

In **Settings > Pages**:

1. Set custom domain: `resumepro2.me`
2. Enable **Enforce HTTPS** after DNS resolves.

## 6) Verify

Run:

```powershell
nslookup resumepro2.me 8.8.8.8
nslookup api.resumepro2.me 8.8.8.8
```

Both must resolve before all devices can access globally.
