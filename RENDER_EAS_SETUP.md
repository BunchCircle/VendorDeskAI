# VendorDesk Setup Guide

This file explains exactly how to run this project with:

- **Backend hosted on Render**
- **Frontend installed on an Android phone as an EAS development build**

This setup is recommended because plain Expo Go over local Wi‑Fi was unreliable on this laptop.

---

## Overview

This app has two parts:

1. **Backend**
   - Folder: [artifacts/api-server](C:\Users\ll\Downloads\VendorDeskAI\LatestVendorDesk\artifacts\api-server)
   - Purpose: AI routes and authenticated server-side logic
   - Hosting target: Render free web service

2. **Frontend**
   - Folder: [artifacts/mobile](C:\Users\ll\Downloads\VendorDeskAI\LatestVendorDesk\artifacts\mobile)
   - Purpose: Expo React Native app used on your Android phone
   - Delivery target: EAS Android development build

---

## Important Notes Before Starting

1. Yes, for the easiest Render setup, **push this project to GitHub first**.
2. Render will deploy the backend from your GitHub repository.
3. EAS will build the Android app in the cloud and give you an installable APK.
4. You do **not** need an Android emulator for this process.
5. You do **not** need Expo Go once the development build is installed.

---

## Part 1: Push the Project to GitHub

### Step 1. Create a GitHub repository

1. Log in to GitHub.
2. Create a new repository.
3. Give it any name you want, for example:

```text
vendordesk-ai
```

4. Create the repository as either public or private.

### Step 2. Push your local code to GitHub

From the project root:

```powershell
git init
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git add .
git commit -m "Initial VendorDesk setup"
git branch -M main
git push -u origin main
```

If the repo is already initialized, use only the missing commands.

### Step 3. Confirm GitHub contains the full project

Make sure GitHub shows these paths:

- `artifacts/api-server`
- `artifacts/mobile`
- `render.yaml`
- `package.json`
- `pnpm-lock.yaml`

---

## Part 2: Deploy the Backend to Render

### Step 1. Log in to Render

Since you already have a Render account:

1. Open Render dashboard.
2. Log in.

### Step 2. Connect GitHub to Render

1. In Render, connect your GitHub account if not already connected.
2. Grant Render access to the repository you just pushed.

### Step 3. Deploy using the Blueprint file

This repo already includes:

- [render.yaml](C:\Users\ll\Downloads\VendorDeskAI\LatestVendorDesk\render.yaml)

In Render:

1. Click **New**.
2. Choose **Blueprint**.
3. Select the GitHub repository you pushed.
4. Render should detect `render.yaml`.
5. Continue with the setup.

### Step 4. Confirm Render service settings

Render should create a web service with these main settings:

- Name: `vendordesk-api`
- Runtime: `node`
- Plan: `free`
- Region: `singapore`
- Health check path: `/api/healthz`

### Step 5. Add environment variables in Render

In the Render service dashboard, add these environment variables:

```text
GOOGLE_API_KEY=your_google_api_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Optional:

```text
ALLOWED_ORIGINS=
```

You can leave `ALLOWED_ORIGINS` empty for the mobile app.

Do **not** put the Supabase anon key here. The backend needs the **service role key**.

### Step 6. Let Render build and deploy

Render will run the commands already configured in the repo:

- Build command:

```text
pnpm run render:build
```

- Start command:

```text
pnpm run render:start
```

### Step 7. Copy your public Render backend URL

After deployment, Render will give you a public URL such as:

```text
https://vendordesk-api.onrender.com
```

Save this URL. You will use it in the mobile `.env`.

### Step 8. Test the backend health endpoint

Open in browser:

```text
https://YOUR_RENDER_URL/api/healthz
```

Expected result:

```json
{"status":"ok"}
```

If you do not get this response, do not move to the next step yet.

---

## Part 3: Configure the Mobile App

### Step 1. Open the mobile env file

Edit:

- [artifacts/mobile/.env](C:\Users\ll\Downloads\VendorDeskAI\LatestVendorDesk\artifacts\mobile\.env)

Put these values:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_API_URL=https://YOUR_RENDER_URL.onrender.com
```

Important:

- `EXPO_PUBLIC_SUPABASE_URL` = your Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon/public key
- `EXPO_PUBLIC_API_URL` = your Render backend URL

### Step 2. Save the env file

After saving, the frontend will call the hosted backend instead of trying to call your laptop.

---

## Part 4: Prepare EAS for the Android Build

### Step 1. Go into the mobile folder

```powershell
cd artifacts/mobile
```

### Step 2. Install dependencies

```powershell
pnpm install
```

### Step 3. Log in to Expo / EAS

If not already logged in:

```powershell
npx eas login
```

Enter your Expo account details.

### Step 4. Confirm EAS config exists

This repo already includes:

- [artifacts/mobile/eas.json](C:\Users\ll\Downloads\VendorDeskAI\LatestVendorDesk\artifacts\mobile\eas.json)

It defines:

- `development` build
- `preview` build
- Android APK output for internal installation

---

## Part 5: Build the Android Development APK

### Step 1. Start the cloud build

Inside `artifacts/mobile` run:

```powershell
pnpm run build:android:development
```

This runs:

```powershell
npx eas build --platform android --profile development
```

### Step 2. Follow Expo prompts

Expo may ask for:

1. project linking
2. Android credentials handling
3. confirmation to create cloud build setup

For a development build, accept the recommended defaults unless you already manage credentials yourself.

### Step 3. Wait for the build to finish

EAS will provide:

- a web link to track the build
- a downloadable APK after success

---

## Part 6: Install the APK on Your Android Phone

### Step 1. Open the EAS build link on your phone

You can:

1. open the link directly on your phone
2. email it to yourself
3. send it through WhatsApp to yourself

### Step 2. Download the APK

Download the generated Android APK.

### Step 3. Allow installation if Android asks

If Android blocks installation:

1. open the permission prompt
2. allow install from browser/files source
3. install again

### Step 4. Install the app

Finish installation on the phone.

After this, you no longer need to rely on plain Expo Go for this app.

---

## Part 7: Start the Frontend Dev Server Locally

### Step 1. Start the Metro bundler for the dev client

From `artifacts/mobile`:

```powershell
pnpm run start:dev-client
```

This runs:

```powershell
expo start --dev-client
```

### Step 2. Keep the terminal running

Do not close this terminal while testing.

### Step 3. Open the installed app on the phone

Launch the installed development build.

### Step 4. Connect to the development server

The development build should open the project through the dev client flow.

If it asks how to connect, choose the local dev server.

---

## Part 8: Test the App End to End

After opening the app on the phone, test:

1. splash screen
2. email OTP login
3. onboarding
4. dashboard/leads tab
5. catalogue tab
6. profile tab
7. lead creation
8. quotation flow
9. invoice flow
10. AI-related features

Backend-connected features should now hit Render, not your laptop.

---

## Part 9: If You Want a Simpler Internal APK Later

If you want an installable APK for testing without the dev-client workflow:

```powershell
cd artifacts/mobile
pnpm run build:android:preview
```

That creates a preview/internal build.

---

## Common Problems and Fixes

### Problem 1. Render deploy fails

Check:

1. GitHub repo was pushed fully
2. Render has access to the repo
3. environment variables are set
4. build logs show no missing workspace files

### Problem 2. Health check URL does not work

Check:

1. Render deployment actually completed
2. service is not still building
3. correct URL is being used

### Problem 3. App opens but AI features fail

Check:

1. `EXPO_PUBLIC_API_URL` points to Render
2. Render env vars are correct
3. `GOOGLE_API_KEY` is valid
4. `SUPABASE_SERVICE_ROLE_KEY` is correct

### Problem 4. OTP auth fails

Check:

1. `EXPO_PUBLIC_SUPABASE_URL` is correct
2. `EXPO_PUBLIC_SUPABASE_ANON_KEY` is correct
3. Supabase auth email OTP is enabled

### Problem 5. First API call is slow

This is normal on Render free tier because the service can sleep when idle.

---

## Quick Command Summary

### Push to GitHub

```powershell
git add .
git commit -m "Initial VendorDesk setup"
git push origin main
```

### Install mobile dependencies

```powershell
cd artifacts/mobile
pnpm install
```

### Login to EAS

```powershell
npx eas login
```

### Build Android development APK

```powershell
pnpm run build:android:development
```

### Start dev client locally

```powershell
pnpm run start:dev-client
```

### Build preview APK

```powershell
pnpm run build:android:preview
```

---

## Final Recommendation

Use this workflow:

1. Push project to GitHub
2. Deploy backend from GitHub to Render
3. Put Render URL into mobile `.env`
4. Build Android development APK with EAS
5. Install APK on your phone
6. Run Metro locally with `start:dev-client`
7. Test on your actual device

This is the most practical replacement for trying to run the app through plain Expo Go over unreliable local networking.
