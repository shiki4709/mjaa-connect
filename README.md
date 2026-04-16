# MJAA Connect

AI-powered matchmaker for the MJAA/MJW professional community. Built for the MJAA Mentorship Program Pitch Competition.

## What It Does

MJAA Connect is a WhatsApp bot that helps community members find the right people in the MJAA/MJW network. Instead of cold outreach or scrolling through directories, members chat with an AI that:

1. Learns about you (via conversation or LinkedIn profile import)
2. Understands what you're looking for
3. Suggests 2-3 best matches from the member directory
4. Writes personalized intro messages where both sides see the value

## How It Works

- **WhatsApp interface** via Twilio Sandbox -- no app to download
- **LinkedIn integration** via Apify -- paste your LinkedIn URL and skip onboarding
- **AI matching** via Claude (Anthropic) -- reads the full member directory and finds the best connections
- **Conversational onboarding** -- the bot asks about your background, strengths, and what you can offer before matching

## Tech Stack

- Next.js (App Router) on Vercel
- Anthropic Claude (Haiku 4.5) for AI conversations
- Twilio WhatsApp Sandbox for messaging
- Apify for LinkedIn profile scraping
- Vercel for hosting

## Setup

1. Clone this repo
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env.local` with:
   ```
   ANTHROPIC_API_KEY=your-key
   APIFY_API_TOKEN=your-token
   ```
4. Run locally:
   ```bash
   npm run dev
   ```
5. Deploy to Vercel:
   ```bash
   vercel --prod
   ```
6. Set the Twilio WhatsApp Sandbox webhook to `https://your-url.vercel.app/api/whatsapp` (POST)

## Project Structure

```
src/
  app/
    api/
      chat/          # Web chat API (unused, legacy)
      whatsapp/      # Twilio WhatsApp webhook (main)
    page.tsx         # Landing page with QR code
    layout.tsx
  components/
    Chat.tsx         # Web chat UI (unused, legacy)
    SignUpForm.tsx   # Web sign-up form (unused, legacy)
  data/
    members.json     # MJAA/MJW member directory (20 profiles)
```

## Team

Built by the MJAA Family for the MJAA Mentorship Program Pitch Competition 2026.
