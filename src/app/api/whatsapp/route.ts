import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import members from "@/data/members.json";

// In-memory conversation store (keyed by phone number)
// Note: resets on each serverless cold start — fine for a demo
const conversations = new Map<
  string,
  {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    profile: {
      name?: string;
      role?: string;
      background?: string;
      strength?: string;
      lookingFor?: string;
      canOffer?: string;
      linkedinUrl?: string;
    };
    onboardingStep: number;
    linkedinLoaded: boolean;
  }
>();

const memberContext = members
  .map(
    (m) =>
      `- ${m.name} | ${m.role} at ${m.company} | Industry: ${m.industry}\n  Expertise: ${m.expertise.join(", ")}\n  Looking for: ${m.lookingFor}\n  Can offer: ${m.canOffer}`
  )
  .join("\n\n");

// Detect LinkedIn URL in a message
function extractLinkedInUrl(text: string): string | null {
  const match = text.match(
    /https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/
  );
  return match ? match[0] : null;
}

// Scrape LinkedIn profile via Apify REST API
async function scrapeLinkedInProfile(
  url: string
): Promise<{
  name?: string;
  role?: string;
  company?: string;
  headline?: string;
  summary?: string;
  experiences?: Array<{ title: string; company: string; description?: string }>;
  skills?: string[];
} | null> {
  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) return null;

  try {
    // Start the actor run
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/dev_fusion~Linkedin-Profile-Scraper/runs?token=${apiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileUrls: [url] }),
      }
    );
    const runData = await runRes.json();
    const runId = runData?.data?.id;
    if (!runId) return null;

    // Poll for completion (max 30 seconds)
    const deadline = Date.now() + 30000;
    let status = "";
    while (Date.now() < deadline) {
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${apiToken}`
      );
      const statusData = await statusRes.json();
      status = statusData?.data?.status;
      if (status === "SUCCEEDED") break;
      if (status === "FAILED" || status === "ABORTED") return null;
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (status !== "SUCCEEDED") return null;

    // Fetch results
    const datasetId = runData?.data?.defaultDatasetId;
    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiToken}`
    );
    const items = await itemsRes.json();

    if (!Array.isArray(items) || items.length === 0) return null;

    const profile = items[0] as Record<string, unknown>;
    return {
      name: profile.fullName as string | undefined,
      role: profile.title as string | undefined,
      company: profile.company as string | undefined,
      headline: profile.headline as string | undefined,
      summary: profile.summary as string | undefined,
      experiences: (
        profile.experiences as Array<{
          title: string;
          company: string;
          description?: string;
        }>
      )?.slice(0, 5),
      skills: (profile.skills as string[])?.slice(0, 10),
    };
  } catch (error) {
    console.error("LinkedIn scrape error:", error);
    return null;
  }
}

function getSystemPrompt(profile: {
  name?: string;
  role?: string;
  background?: string;
  strength?: string;
  lookingFor?: string;
  canOffer?: string;
  linkedinUrl?: string;
}) {
  return `You are MJAA Connect, an AI matchmaker for the Monte Jade Asian Association (MJAA) and Monte Jade West (MJW) professional community. You communicate via WhatsApp, so keep messages concise and conversational. Use line breaks for readability. No markdown formatting (no ** or ## — WhatsApp doesn't render them). Use *bold* sparingly for names only.

Your personality: warm, direct, and genuinely helpful. You sound like a well-connected friend who knows everyone, not a corporate chatbot.

## Onboarding
If you don't have the user's info yet, gather it conversationally:
1. Ask their name
2. Ask them to drop their LinkedIn URL — say something like "Drop your LinkedIn link and I'll pull your info so you don't have to type everything out. Or if you'd rather not, I can ask a few quick questions instead."

If they share a LinkedIn URL and we successfully loaded their profile:
- Summarize what you found from their LinkedIn (role, background, key experiences) in a friendly way
- Ask them to confirm: "Does this look right? Anything you'd add or change?"
- Then ask: "What would you say is your biggest strength or superpower — the thing people always come to you for?"
- Then ask: "What can you offer others in the network?"
- Then go straight to: "Now that I know you — what are you looking for right now? Who do you want to meet?"

If they DON'T share a LinkedIn URL, fall back to asking these one at a time:
1. What they do now (role/company)
2. Their background — where they've been, what they've built, career highlights
3. Their biggest strength or superpower
4. What they can offer others in the network
Then transition to matching.

Be natural about it. React genuinely to what they say. Show interest in their story.

After onboarding, transition naturally into: "Now that I know you — what are you looking for right now? Who do you want to meet?" This is the moment the matching starts. Every future conversation can start here — they come back, say what they need, and you find matches.

## Current user info:
${profile.name ? `Name: ${profile.name}` : "Name: not yet provided"}
${profile.role ? `Role: ${profile.role}` : "Role: not yet provided"}
${profile.background ? `Background: ${profile.background}` : "Background: not yet provided"}
${profile.strength ? `Biggest strength: ${profile.strength}` : "Biggest strength: not yet provided"}
${profile.lookingFor ? `Looking for: ${profile.lookingFor}` : "Looking for: not yet provided"}
${profile.canOffer ? `Can offer: ${profile.canOffer}` : "Can offer: not yet provided"}
${profile.linkedinUrl ? `LinkedIn: ${profile.linkedinUrl}` : ""}

## After onboarding, your job:
1. Understand what they need right now
2. Suggest 2-3 of the BEST matches from the member directory
3. For each match, explain WHY they're great and write a warm intro message they could copy-paste
4. The intro must highlight what's in it for BOTH sides
5. Ask if they want to explore other needs or refine matches

## Rules:
- Only suggest matches from the directory below. Never invent members.
- Keep messages under 300 words (WhatsApp readability)
- Use line breaks between sections
- Be honest if no one matches well
- If someone says "hi" or "hello", greet them warmly and start onboarding

## MJAA/MJW Member Directory:
${memberContext}`;
}

function twimlResponse(message: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
  return new Response(xml, {
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function POST(req: Request) {
  try {
    // Twilio sends application/x-www-form-urlencoded
    const text = await req.text();
    const params = new URLSearchParams(text);
    const body = params.get("Body");
    const from = params.get("From");

    if (!body || !from) {
      return twimlResponse(
        "Sorry, something went wrong. Please try sending your message again."
      );
    }

    // Get or create conversation state
    if (!conversations.has(from)) {
      conversations.set(from, {
        messages: [],
        profile: {},
        onboardingStep: 0,
        linkedinLoaded: false,
      });
    }

    const convo = conversations.get(from)!;

    // Check if message contains a LinkedIn URL
    const linkedinUrl = extractLinkedInUrl(body);
    if (linkedinUrl && !convo.linkedinLoaded) {
      convo.profile.linkedinUrl = linkedinUrl;

      // Scrape LinkedIn profile
      const linkedinData = await scrapeLinkedInProfile(linkedinUrl);
      if (linkedinData) {
        convo.linkedinLoaded = true;
        if (linkedinData.name) convo.profile.name = linkedinData.name;
        if (linkedinData.headline || linkedinData.role) {
          convo.profile.role = linkedinData.headline || linkedinData.role;
        }

        // Build background from experiences
        const bgParts: string[] = [];
        if (linkedinData.summary) bgParts.push(linkedinData.summary);
        if (linkedinData.experiences) {
          const expSummary = linkedinData.experiences
            .map((e) => `${e.title} at ${e.company}`)
            .join(", ");
          bgParts.push(`Experience: ${expSummary}`);
        }
        if (linkedinData.skills) {
          bgParts.push(`Skills: ${linkedinData.skills.join(", ")}`);
        }
        if (bgParts.length > 0) {
          convo.profile.background = bgParts.join(". ");
        }

        // Inject LinkedIn data as context for the AI
        convo.messages.push({
          role: "user",
          content: body,
        });
        convo.messages.push({
          role: "assistant",
          content: `[SYSTEM: LinkedIn profile loaded for ${linkedinData.name || "user"}. Role: ${linkedinData.headline || linkedinData.role || "unknown"}. ${convo.profile.background || ""}. Now summarize this back to the user warmly and ask for confirmation.]`,
        });
        // Remove the system message so AI generates a fresh response
        convo.messages.pop();
      } else {
        // Scrape failed — just treat as normal message
        convo.messages.push({ role: "user", content: body });
      }
    } else {
      // Normal message
      convo.messages.push({ role: "user", content: body });
    }

    // Keep conversation history manageable (last 20 messages)
    if (convo.messages.length > 20) {
      convo.messages = convo.messages.slice(-20);
    }

    // Generate AI response
    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: getSystemPrompt(convo.profile),
      messages: convo.messages,
    });

    const aiResponse = result.text;

    // Store AI response in history
    convo.messages.push({ role: "assistant", content: aiResponse });

    // Try to extract name from conversation if not yet known
    if (!convo.profile.name && convo.messages.length >= 2) {
      const extractResult = await generateText({
        model: anthropic("claude-haiku-4-5-20251001"),
        system:
          'Extract the user\'s name from this conversation if they\'ve shared it. Return ONLY the name, or "UNKNOWN" if not found. No other text.',
        messages: [
          {
            role: "user",
            content: convo.messages
              .map((m) => `${m.role}: ${m.content}`)
              .join("\n"),
          },
        ],
      });
      const name = extractResult.text.trim();
      if (name !== "UNKNOWN") {
        convo.profile.name = name;
      }
    }

    return twimlResponse(aiResponse);
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return twimlResponse(
      "Oops, I hit a snag. Please try again in a moment!"
    );
  }
}
