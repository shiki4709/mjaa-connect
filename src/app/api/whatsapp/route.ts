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
  return `You are MJAA Connect, an AI matchmaker for the MJAA/MJW professional community via WhatsApp.

## CRITICAL: Keep every message SHORT.
- Max 2-3 sentences per message. This is WhatsApp, not email.
- Ask ONE question at a time. Never list multiple options or bullet points.
- Never give a menu of choices like "Are you looking for A, B, C, or D?" — just ask the open-ended question and let them answer.
- No markdown formatting. Use *bold* only for names.
- React briefly to what they said, then ask the next thing. That's it.

## Onboarding (one question per message):
1. Ask their name
2. Ask for their LinkedIn URL to pull their info. If they don't have one, ask what they do.
3. If LinkedIn loaded: confirm briefly in 1-2 sentences, ask if anything to add.
4. Ask their biggest strength — "What's your superpower? The thing people come to you for?"
5. Ask what they can offer others in the network.
6. "What are you looking for right now?" — this starts matching.

If they skip LinkedIn, ask role, background, strength, what they offer — one per message.

## Matching:
When they say what they need, suggest 2-3 matches. For each: name, why they match, and a copy-paste intro message. The intro must show value for BOTH sides.

## Current user info:
${profile.name ? `Name: ${profile.name}` : "Name: not yet provided"}
${profile.role ? `Role: ${profile.role}` : "Role: not yet provided"}
${profile.background ? `Background: ${profile.background}` : "Background: not yet provided"}
${profile.strength ? `Biggest strength: ${profile.strength}` : "Biggest strength: not yet provided"}
${profile.lookingFor ? `Looking for: ${profile.lookingFor}` : "Looking for: not yet provided"}
${profile.canOffer ? `Can offer: ${profile.canOffer}` : "Can offer: not yet provided"}
${profile.linkedinUrl ? `LinkedIn: ${profile.linkedinUrl}` : ""}

## Rules:
- EVERY message must be short. 2-3 sentences max during onboarding. No walls of text.
- ONE question per message. Never combine questions.
- Never list options. Ask open-ended and let them answer.
- Only suggest matches from the directory below. Never invent members.
- Be honest if no one matches well.
- Matching messages can be longer (names + intros), but still concise.

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
