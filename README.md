# MJAA Connect

AI-powered matchmaker for the MJAA/MJW professional community. Built for the MJAA Mentorship Program Pitch Competition.

## What It Does

MJAA Connect is a WhatsApp bot that helps community members find the right people in the MJAA/MJW network. Members scan a QR code, have a quick voice call with an AI, and get matched with 2-3 people who can help them.

1. **Onboard** via WhatsApp -- share your name, LinkedIn, and email
2. **Voice call** -- 2-minute AI call to learn about you (via Vapi.ai)
3. **Get matched** -- AI suggests 2-3 members from the 500+ person directory
4. **Accept or skip** -- review each match with detailed context and LinkedIn links
5. **Intro email** -- accept a match and both parties get a personalized intro email

## Tech Stack

- **Next.js** (App Router) on Vercel
- **Claude Haiku 4.5** (Anthropic) for AI conversations and matching
- **Twilio** WhatsApp Sandbox for messaging
- **Vapi.ai** for voice onboarding calls (ElevenLabs voice)
- **Upstash Redis** for persistent conversation state
- **Gmail SMTP** (via Nodemailer) for intro emails
- **Vercel** for hosting

## Environment Variables

```
# Required
ANTHROPIC_API_KEY=your-anthropic-key

# Twilio (WhatsApp)
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_WHATSAPP_NUMBER=+14155238886

# Vapi (Voice calls)
VAPI_API_KEY=your-vapi-key
VAPI_PHONE_NUMBER_ID=your-phone-number-id

# Upstash Redis (Conversation storage)
UPSTASH_REDIS_REST_URL=your-url
UPSTASH_REDIS_REST_TOKEN=your-token

# Gmail (Intro emails)
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password
```

## Setup

1. Clone and install:
   ```bash
   git clone https://github.com/shiki4709/mjaa-connect.git
   cd mjaa-connect
   npm install
   ```

2. Create `.env.local` with the variables above

3. Run locally:
   ```bash
   npm run dev
   ```

4. Deploy to Vercel:
   ```bash
   vercel --prod
   ```

5. Configure webhooks:
   - **Twilio Sandbox**: Set "When a message comes in" to `https://your-url.vercel.app/api/whatsapp` (POST)
   - **Vapi**: Set Server URL to `https://your-url.vercel.app/api/vapi/webhook`

## Project Structure

```
src/
  app/
    api/
      whatsapp/        # Twilio WhatsApp webhook (main bot logic)
      whatsapp/status/  # Twilio status callbacks
      vapi/webhook/    # Vapi voice call end-of-call handler
      reset/           # Conversation reset endpoint (testing)
      test-email/      # Email test endpoint (testing)
    page.tsx           # Landing page with QR code
    layout.tsx
  lib/
    store.ts           # Redis conversation state (Upstash)
    twilio.ts          # Twilio REST API helper
  data/
    members.json       # MJAA/MJW member directory (20 profiles)
```

## How Matching Works

1. User profile is built from WhatsApp onboarding + voice call
2. Claude analyzes the profile against all 20 members
3. Top 2-3 matches are presented as individual cards with:
   - Specific bullet points on why they're a match
   - Honest drawback/caveat
   - LinkedIn profile link
4. User replies "accept" or "skip" for each match
5. Accepted matches trigger a mutual intro email to both parties

## Team

Built by the MJAA Family for the MJAA Mentorship Program Pitch Competition 2026.
