SHI Web Applications - Technical Deployment Guide

This guide provides the technical steps required to set up, test, and deploy the web portals (Landing, Resident, Agent, and Dashboard) for the Smart Health Index system.

1. Local Environment Setup
Clone Repository

git clone https://github.com/rlee-upou/shi_resident
cd rlee-upou/shi_resident


Install Dependencies

npm install

Configure Local Environment
Create a .env.local file in the root directory and populate it with your project keys:

VITE_SUPABASE_URL=[https://your-project-id.supabase.co](https://your-project-id.supabase.co)
VITE_SUPABASE_ANON_KEY=your-anon-public-key


Test Locally
Start the development server to verify the build and connection:

npm run dev

Access the portals via the local addresses provided (typically http://localhost:5173).

2. Supabase Backend Initialization
Before deployment, ensure the PostgreSQL backend is prepared:
- Schema: Run the schema.sql migration script in the Supabase SQL Editor.
- Roles: Ensure the user_roles table contains the necessary entries for authenticated portals (Agent/Researcher).

3. Production Deployment (Vercel)
Project Creation
- Log in to the Vercel Dashboard.
- Click "New Project" and import your Git repository.

Build Configuration
Vercel should automatically detect the framework. Ensure the following settings:

- Framework Preset: Vite
- Build Command: npm run build
- Output Directory: dist
- Environment Variables (CRITICAL)

Add the following keys in Project Settings > Environment Variables to enable cloud connectivity:

- Variable Name > VITE_SUPABASE_URL
- Value > Your Supabase Project URL

- Variable Name > VITE_SUPABASE_ANON_KEY
- Value > > Your Supabase Anonymous API Key

Finalize
- Click "Deploy".

Once the build finishes, Vercel will provide a production URL secured with SSL/TLS.
