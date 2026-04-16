# Google OAuth Quick Setup

## 🚀 Get Your Client ID (3 minutes)

### 1️⃣ Create Google Cloud Project
- Go to: https://console.cloud.google.com/
- Sign in with your Google account
- Click **"Select a Project"** → **"New Project"**
- Name: `ResumePro`
- Click **Create** (wait ~10 seconds)

### 2️⃣ Enable Google+ API
- Use search bar: Search `Google+ API`
- Click on result and press **Enable**

### 3️⃣ Create OAuth Credentials
- Go to **APIs & Services → Credentials** (left sidebar)
- Click **+ CREATE CREDENTIALS**
- Select **OAuth client ID**

**If prompted for Consent Screen:**
- Select **External** user type
- Click **Create**
- Fill in: App name = `ResumePro`, Support email = your email
- Click **Save and Continue** (skip scopes)
- Back to credentials screen

**Create OAuth Client ID:**
- Choose: **Web application**
- Name: `ResumePro Web`
- Authorized JavaScript origins: Add these 3:
  ```
  http://localhost:8000
  http://localhost:3000
  http://127.0.0.1:8000
  ```
- Click **Create**

### 4️⃣ Copy Your Client ID
A dialog will show your credentials:
```
Client ID: 123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
```
✅ Copy this entire string

### 5️⃣ Add to ResumePro
Open `frontend/webapp/config.js`

Set your client ID:
```javascript
window.RESUMEPRO_CONFIG = {
  googleClientId: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
  backendBaseUrl: "http://127.0.0.1:8001"
};
```

Replace with your actual ID (paste exactly what you copied):
```javascript
window.RESUMEPRO_CONFIG = {
  googleClientId: "123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com",
  backendBaseUrl: "http://127.0.0.1:8001"
};
```

### 6️⃣ Reload Your App
- Refresh the login page in your browser
- The Google "Sign in with Google" button should now appear! ✨

## ⚠️ Troubleshooting

**Button still not showing?**
- Check browser console (F12 → Console tab)
- Verify Client ID format (should end with `.apps.googleusercontent.com`)
- Verify `http://localhost:8000` is in Authorized JavaScript origins

**Login fails?**
- Add `http://127.0.0.1:8000/callback` to Authorized Redirect URIs in Google Cloud

**Error 400: origin_mismatch?**
- The URL in your browser must exactly match an Authorized JavaScript origin.
- If you run from Live Server on port 5500/5501, add these origins too:
  ```
  http://127.0.0.1:5500
  http://127.0.0.1:5501
  http://localhost:5500
  http://localhost:5501
  ```
- Or use the already-approved app URL: `http://127.0.0.1:8000/index.html`

**Still stuck?**
- Check `GOOGLE_OAUTH_SETUP.md` for detailed guide
- See browser console for error messages
