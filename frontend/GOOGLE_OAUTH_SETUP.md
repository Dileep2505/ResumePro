# Google OAuth Setup Guide for ResumePro

## Overview
This guide walks you through setting up Google Sign-In authentication for ResumePro, allowing users to login and register using their Google accounts.

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top
3. Click **NEW PROJECT**
4. Enter project name: `ResumePro`
5. Click **CREATE**
6. Wait for the project to be created

## Step 2: Enable Google+ API

1. In the Cloud Console, go to **APIs & Services** > **Library**
2. Search for "Google+ API"
3. Click on it and press **ENABLE**

## Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **+ CREATE CREDENTIALS** button
3. Select **OAuth client ID**
4. You'll be prompted to create a consent screen first:
   - Click **CONFIGURE CONSENT SCREEN**
   - Select **External** (unless you have a Google Workspace account)
   - Click **CREATE**

## Step 4: Configure OAuth Consent Screen

1. **App information:**
   - App name: `ResumePro`
   - User support email: Your email
   - Developer contact: Your email

2. Click **SAVE AND CONTINUE**

3. **Scopes:**
   - Leave default scopes
   - Click **SAVE AND CONTINUE**

4. **Test users:**
   - Add your Google account email for testing
   - Click **SAVE AND CONTINUE**

5. Review and click **BACK TO DASHBOARD**

## Step 5: Create OAuth 2.0 ID for Web Application

1. Go to **APIs & Services** > **Credentials** again
2. Click **+ CREATE CREDENTIALS** > **OAuth client ID**
3. Select **Web application**
4. Name it: `ResumePro Web Client`

5. **Authorized JavaScript origins:**
   ```
   http://localhost:8000
   http://localhost:3000
   http://127.0.0.1:8000
   http://127.0.0.1:3000
   https://yourdomain.com (add your deployed domain later)
   ```

6. **Authorized redirect URIs:**
   ```
   http://localhost:8000/callback
   http://localhost:3000/callback
   http://127.0.0.1:8000/callback
   http://127.0.0.1:3000/callback
   https://yourdomain.com/callback (add your deployed domain later)
   ```

7. Click **CREATE**

8. A dialog will appear with your credentials
   - Copy the **Client ID**
   - You can close the dialog (you can always retrieve it later)

## Step 6: Add Client ID to ResumePro

1. Open `frontend/webapp/config.js`
2. Set the `googleClientId` value:
   ```javascript
   window.RESUMEPRO_CONFIG = {
     googleClientId: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
     backendBaseUrl: "http://127.0.0.1:8001"
   };
   ```

3. Replace `YOUR_GOOGLE_CLIENT_ID` with your actual Client ID from Step 5

## Step 7: Test Your Setup

1. Start your ResumePro frontend (e.g., `python app.py`)
2. Go to the login page
3. You should see "Sign in with Google" button below the email/password form
4. Click it and test the Google login flow

## Features Implemented

✅ **Google Sign-In** - Users can login with Google account
✅ **Auto-Registration** - New Google users auto-register
✅ **Account Linking** - Detects if email already exists  
✅ **JWT Decoding** - Extracts user info from Google token
✅ **Secure Logout** - Properly closes Google session
✅ **Responsive Design** - Buttons styled to match ResumePro theme

## Security Notes

⚠️ **Frontend JWT Decoding**: The current implementation decodes JWT tokens on the frontend for demonstration. 

For **production**, you should:
1. Verify the JWT signature on your backend
2. Use the token to fetch user profile from a secure endpoint
3. Never trust frontend-only JWT decoding

### Backend Verification Example (Python):

```python
from google.auth.transport import requests
from google.oauth2 import id_token

try:
    idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
    userid = idinfo['sub']
    email = idinfo['email']
    name = idinfo.get('name')
except ValueError:
    # Invalid token
    pass
```

## Troubleshooting

### Issue: "Google Sign-In SDK not loading"
- **Solution**: Check browser console for CORS or network errors
- Add your domain to authorized JavaScript origins

### Issue: "Client ID not recognized"
- **Solution**: Ensure you copied the full Client ID including the `.apps.googleusercontent.com` part

### Issue: Google button not showing
- **Solution**: Wait a few seconds for SDK to load, or refresh the page
- Check browser console for errors

### Issue: Login succeeds but user not authenticated
- **Solution**: Clear localStorage and try again
- Check that you're using the correct Google account

## Disabling Google OAuth (Optional)

If you want to disable Google Sign-In:

1. Comment out the Google SDK script in `index.html`:
   ```html
   <!-- <script src="https://accounts.google.com/gsi/client" async defer></script> -->
   ```

2. Remove the call to `initializeGoogleSignIn()` in the load event

3. Delete Google buttons from login/register forms in `index.html`

## Need Help?

- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Sign-In JavaScript SDK Docs](https://developers.google.com/identity/gsi/web)
- Check browser console for detailed error messages
