# ChatFlow V3 — cPanel Deployment Guide

## Prerequisites
- cPanel with **Node.js App** support (Turbo Cloud plan from hostmyidea.in ✅)
- PostgreSQL database access via cPanel
- Domain with SSL certificate (usually included with cPanel)
- File Manager or SSH access

---

## Step 1: Create PostgreSQL Database

1. Login to cPanel → **PostgreSQL Databases**
2. Create a new database (e.g., `chatflow`)
3. Create a database user with a strong password
4. Add the user to the database with **ALL PRIVILEGES**
5. Note down: `database_name`, `username`, `password`

Your DATABASE_URL will be:
```
postgresql://username:password@localhost:5432/database_name?schema=public
```

---

## Step 2: Upload Files

### Option A: File Manager (Recommended)
1. Create a directory outside `public_html` for the backend (e.g., `/home/username/chatflow-backend/`)
2. Upload the entire `backend/` contents to this directory
3. Upload the `app/dist/` contents to `public_html/` or a subdomain directory

### Option B: SSH + Git
```bash
cd ~
git clone <your-repo-url> chatflow
cd chatflow/backend
npm install --production
npx prisma generate
npx prisma migrate deploy
```

---

## Step 3: Configure Backend

### 3.1 Install Dependencies
Via SSH or cPanel Terminal:
```bash
cd ~/chatflow-backend
npm install --production
npx prisma generate
```

### 3.2 Create .env File
Create `~/chatflow-backend/.env` with production values:
```env
PORT=3000
FRONTEND_URL=https://yourdomain.com
NODE_ENV=production

DATABASE_URL="postgresql://username:password@localhost:5432/chatflow?schema=public"

JWT_SECRET=<generate-with: openssl rand -hex 32>
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_EXPIRES_IN=30d

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
OAUTH_CALLBACK_URL=https://yourdomain.com/api/auth

RP_ID=yourdomain.com
ORIGIN=https://yourdomain.com

SMTP_HOST=mail.yourdomain.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-email-password
SMTP_FROM=noreply@yourdomain.com
APP_NAME=ChatFlow

UPLOADS_DIR=/home/username/chatflow-backend/uploads
```

### 3.3 Run Database Migrations
```bash
cd ~/chatflow-backend
npx prisma migrate deploy
```

### 3.4 Build Backend
```bash
npm run build
```

---

## Step 4: Setup Node.js App in cPanel

1. Go to cPanel → **Setup Node.js App**
2. Click **CREATE APPLICATION**
3. Configure:
   - **Node.js version**: 18.x or 20.x (whatever is available)
   - **Application mode**: Production
   - **Application root**: `chatflow-backend`
   - **Application URL**: Choose your domain or subdomain for the API (e.g., `api.yourdomain.com`)
   - **Application startup file**: `dist/server.js`
4. Click **CREATE**
5. The app will start automatically

> **Note**: cPanel assigns a port automatically via the `PORT` environment variable. Your backend code already reads `process.env.PORT`, so it will work.

---

## Step 5: Deploy Frontend

### 5.1 Build Frontend Locally
```bash
cd app/
# Create/update .env.production with correct URLs
echo "VITE_API_URL=https://api.yourdomain.com/api" > .env.production
echo "VITE_SOCKET_URL=https://api.yourdomain.com" >> .env.production

npm run build
```

### 5.2 Upload to cPanel
1. Upload the contents of `app/dist/` to `public_html/` (or your subdomain directory)
2. Create a `.htaccess` file in the same directory for SPA routing:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

---

## Step 6: Setup Email

1. Go to cPanel → **Email Accounts**
2. Create email: `noreply@yourdomain.com`
3. Set a strong password
4. Update the `SMTP_*` values in your backend `.env` file
5. SMTP Host is typically `mail.yourdomain.com`
6. Port 465 for SSL, or 587 for TLS

---

## Step 7: Setup SSL (if not already)

1. Go to cPanel → **SSL/TLS** or **Let's Encrypt SSL**
2. Install SSL certificate for your domain
3. Enable **Force HTTPS** in cPanel → **Domains**

---

## Step 8: Verify Deployment

1. Visit `https://yourdomain.com` — should show ChatFlow login page
2. Visit `https://api.yourdomain.com/health` — should return `{"status":"ok"}`
3. Try registering a new account
4. Check WebSocket connection in browser DevTools → Network → WS tab

---

## Troubleshooting

### WebSocket Issues
If WebSocket connections fail, Socket.IO will automatically fall back to HTTP long-polling. The app will still work, just slightly slower for real-time events.

### CORS Errors
Ensure `FRONTEND_URL` in backend `.env` matches your exact frontend URL (including `https://`). You can specify multiple origins:
```env
FRONTEND_URL=https://yourdomain.com,https://www.yourdomain.com
```

### Node.js App Won't Start
- Check the logs in cPanel → Setup Node.js App → your app → **LOGS**
- Ensure `dist/server.js` exists (run `npm run build` first)
- Verify all environment variables are set correctly

### Database Connection Failed
- Ensure PostgreSQL is running
- Verify the DATABASE_URL credentials match your cPanel database
- Check that the database user has proper permissions

### File Upload Issues
- Ensure the `uploads/` directory exists and has write permissions
- Check that `UPLOADS_DIR` is set to an absolute path
