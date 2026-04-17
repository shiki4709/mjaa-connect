import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import members from "@/data/members.json";
import {
  getConversation,
  setConversation,
  newConversation,
  type ConversationState,
} from "@/lib/store";
import { sendWhatsAppMessage } from "@/lib/twilio";

const memberContext = members
  .map(
    (m) =>
      `- ${m.name} | ${m.role} at ${m.company} | Industry: ${m.industry}\n  Expertise: ${m.expertise.join(", ")}\n  Looking for: ${m.lookingFor}\n  Can offer: ${m.canOffer}`
  )
  .join("\n\n");

function extractLinkedInUrl(text: string): string | null {
  const match = text.match(
    /https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/
  );
  return match ? match[0] : null;
}

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

function getSystemPrompt(convo: ConversationState) {
  const { profile } = convo;

  // If voice onboarding completed, skip to matching
  const voiceContext = convo.vapiCallComplete
    ? `\n\n## IMPORTANT: Voice onboarding already completed!
The user just finished a voice call with you. Their profile is filled in below.
Do NOT re-ask onboarding questions. Instead:
- Warmly welcome them back to WhatsApp
- Briefly confirm what you learned about them (1-2 sentences)
- If "Looking for" is filled in, immediately suggest 2-3 matches from the directory
- If "Looking for" is NOT filled in, ask just that one question to trigger matching`
    : "";

  return `You are MJAA Connect, an AI matchmaker for the MJAA/MJW professional community via WhatsApp.

## CRITICAL: Keep every message SHORT.
- Max 2-3 sentences per message. This is WhatsApp, not email.
- Ask ONE question at a time. Never list multiple options or bullet points.
- Never give a menu of choices like "Are you looking for A, B, C, or D?" — just ask the open-ended question and let them answer.
- No markdown formatting. Use *bold* only for names.
- React briefly to what they said, then ask the next thing. That's it.

## Onboarding (one question per message):
1. The first message already asked their name. When they reply with their name, IMMEDIATELY offer to call them. Say something like: "Nice to meet you [name]! Let me give you a quick call — 2 minutes and I'll find you the perfect connections. Sound good?"
2. If they say YES to the call (any affirmative like "yes", "sure", "ok", "yeah", "go for it"), respond with EXACTLY this text and nothing else: [TRIGGER_VOICE_CALL]
3. ONLY if they explicitly say NO to the call, continue with text onboarding:
   a. Ask what they do
   b. Ask their biggest strength — "What's your superpower? The thing people come to you for?"
   c. Ask what they can offer others in the network
   d. "What are you looking for right now?" — this starts matching
4. ALWAYS push for the call. If they seem hesitant, reassure them it's just 2 minutes and way easier than typing.
${voiceContext}

## Matching:
When they say what they need, respond with [MATCHES_NEEDED] followed by what they're looking for.
Example: "[MATCHES_NEEDED] looking for a job in AI/ML engineering"
Do NOT try to list matches yourself. Do NOT say "one sec" or "let me find". Just output the tag.
The system will generate and send matches automatically.

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

// Strip "whatsapp:" prefix to get raw phone number for Vapi
function extractPhoneNumber(twilioFrom: string): string {
  return twilioFrom.replace("whatsapp:", "");
}

// Trigger an outbound Vapi voice call
async function triggerVapiCall(phoneNumber: string, userName: string): Promise<string | null> {
  const apiKey = process.env.VAPI_API_KEY;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

  if (!apiKey || !phoneNumberId) {
    console.error("Missing VAPI_API_KEY or VAPI_PHONE_NUMBER_ID");
    return null;
  }

  const res = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "outboundPhoneCall",
      phoneNumberId,
      customer: { number: phoneNumber },
      assistant: {
        model: {
          provider: "anthropic",
          model: "claude-haiku-4-5-20251001",
          messages: [
            {
              role: "system",
              content: `You are MJAA Connect, a warm and friendly AI matchmaker for the MJAA/MJW professional community.

You're calling ${userName} to get to know them for matching with other community members. This is a SHORT call — 2 minutes max.

## Your conversation flow (ask one thing at a time, react warmly to each answer):
1. Greet them: "Hey ${userName}! This is MJAA Connect. Thanks for picking up! I just want to ask you a few quick questions so I can find you the perfect connections in our community."
2. Ask what they do — their role and what their work is about
3. Ask what their superpower is and what they can offer others — "What's the thing people always come to you for? What would you bring to someone in our community?"
4. Ask what they're looking for — "What would be most helpful for you right now? Could be mentorship, funding, partnerships, hiring — anything."
5. After they answer, wrap up: "Love it. I'll send you a few matches on WhatsApp in just a moment. Great chatting with you ${userName}!"
6. End the call.

## Rules:
- Be conversational, warm, and natural — like a friend, not a survey
- Keep it SHORT. React briefly to what they say, then move on
- Don't repeat back everything they said — just acknowledge and ask the next thing
- If they go off topic, gently guide back
- The closing matters — make them EXCITED to check WhatsApp for their matches
- Total call should be under 2 minutes`,
            },
          ],
        },
        voice: {
          provider: "11labs",
          voiceId: "sarah",
        },
        firstMessage: `Hey ${userName}! This is MJAA Connect. Thanks for picking up! I just want to ask a few quick questions so I can match you with the right people in our community. Sound good?`,
        endCallFunctionEnabled: true,
        recordingEnabled: true,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Vapi call creation failed:", res.status, errorText);
    return null;
  }

  const callData = await res.json();
  return callData.id ?? null;
}

export async function POST(req: Request) {
  try {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const body = params.get("Body");
    const from = params.get("From");

    if (!body || !from) {
      return twimlResponse(
        "Sorry, something went wrong. Please try sending your message again."
      );
    }

    const phoneNumber = extractPhoneNumber(from);

    // Debug: log every incoming message
    console.log("WHATSAPP INCOMING:", { body, from, phoneNumber });

    const lowerBody = body.toLowerCase().trim();

    // "join" messages: Twilio may or may not forward these.
    // Either way, wipe state and return empty TwiML.
    if (lowerBody.startsWith("join ")) {
      await setConversation(phoneNumber, newConversation());
      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // For ANY message: if no conversation exists OR conversation has
    // no assistant messages yet, this is a fresh user — ask their name.
    const existing = await getConversation(phoneNumber);
    const isNewUser = !existing || existing.messages.length === 0;

    if (isNewUser) {
      const greeting =
        "Hey! Welcome to MJAA Connect — I'm your AI matchmaker for the MJAA community. I'll connect you with the right people based on what you need. What's your name?";
      const convo = newConversation();
      convo.messages.push({ role: "user", content: body });
      convo.messages.push({ role: "assistant", content: greeting });
      await setConversation(phoneNumber, convo);
      return twimlResponse(greeting);
    }

    const convo = existing;

    // Check if message contains a LinkedIn URL
    const linkedinUrl = extractLinkedInUrl(body);
    if (linkedinUrl && !convo.linkedinLoaded) {
      convo.profile.linkedinUrl = linkedinUrl;

      const linkedinData = await scrapeLinkedInProfile(linkedinUrl);
      if (linkedinData) {
        convo.linkedinLoaded = true;
        if (linkedinData.name) convo.profile.name = linkedinData.name;
        if (linkedinData.headline || linkedinData.role) {
          convo.profile.role = linkedinData.headline || linkedinData.role;
        }

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

        convo.messages.push({ role: "user", content: body });
        convo.messages.push({
          role: "assistant",
          content: `[SYSTEM: LinkedIn profile loaded for ${linkedinData.name || "user"}. Role: ${linkedinData.headline || linkedinData.role || "unknown"}. ${convo.profile.background || ""}. Now summarize this back to the user warmly and ask for confirmation.]`,
        });
        convo.messages.pop();
      } else {
        convo.messages.push({ role: "user", content: body });
      }
    } else {
      convo.messages.push({ role: "user", content: body });
    }

    // Keep conversation history manageable
    if (convo.messages.length > 20) {
      convo.messages = convo.messages.slice(-20);
    }

    // Generate AI response
    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: getSystemPrompt(convo),
      messages: convo.messages,
    });

    let aiResponse = result.text;

    // Check if the AI wants to trigger a voice call
    if (aiResponse.includes("[TRIGGER_VOICE_CALL]")) {
      const callId = await triggerVapiCall(
        phoneNumber,
        convo.profile.name || "there"
      );

      if (callId) {
        convo.vapiCallId = callId;
        aiResponse =
          "Calling you now! Pick up the phone — I'll ask you a few quick questions and then send your matches right here on WhatsApp.";
      } else {
        aiResponse =
          "Hmm, I couldn't start the call right now. Let's keep going here instead! What do you do?";
      }
    }

    // Check if the AI wants to trigger matching
    if (aiResponse.includes("[MATCHES_NEEDED]")) {
      const lookingFor = aiResponse.replace("[MATCHES_NEEDED]", "").trim() || body;
      aiResponse = `On it! Finding the best people in our community for you...`;

      // Save state before async match generation
      convo.messages.push({ role: "assistant", content: aiResponse });
      convo.profile.lookingFor = lookingFor;
      await setConversation(phoneNumber, convo);

      // Generate matches via Claude
      const matchResult = await generateText({
        model: anthropic("claude-haiku-4-5-20251001"),
        system: `You are MJAA Connect, matching community members. Given a user's profile, find 2-3 best matches from the directory.

Return ONLY valid JSON — an array of match objects:
[
  {
    "name": "Full Name",
    "roleCompany": "Role at Company",
    "bullets": [
      "One sentence: specific reason this person is relevant",
      "One sentence: how their background connects to user's needs",
      "One sentence: what they can offer that directly helps"
    ],
    "drawback": "One honest caveat (or null)",
    "introMessage": "2-3 sentence copy-paste intro showing value for BOTH sides."
  }
]

TOTAL per match must be UNDER 1500 characters. Be specific but concise.

## Member Directory:
${memberContext}`,
        messages: [
          {
            role: "user",
            content: `Find matches for:
Name: ${convo.profile.name || "unknown"}
Role: ${convo.profile.role || "not specified"}
Background: ${convo.profile.background || "not specified"}
Strength: ${convo.profile.strength || "not specified"}
Looking for: ${lookingFor}
Can offer: ${convo.profile.canOffer || "not specified"}`,
          },
        ],
      });

      // Parse and send each match separately via REST API
      try {
        const cleaned = matchResult.text
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```\s*$/, "")
          .trim();
        const matches = JSON.parse(cleaned) as Array<{
          name: string;
          roleCompany: string;
          bullets: string[];
          drawback: string | null;
          introMessage: string;
        }>;

        for (const match of matches) {
          const bulletText = match.bullets.map((b) => `• ${b}`).join("\n");
          const drawbackText = match.drawback
            ? `\nDrawback: ${match.drawback}`
            : "";
          const msg = `*${match.name}* (${match.roleCompany})
${bulletText}
${drawbackText}

💬 Intro you can send:
"${match.introMessage}"`;
          const truncated = msg.length > 1500 ? msg.slice(0, 1497) + "..." : msg;
          await sendWhatsAppMessage(phoneNumber, truncated);
        }

        await sendWhatsAppMessage(
          phoneNumber,
          `Just copy-paste any of those intros to reach out! Text me here anytime you want different connections.`
        );
      } catch {
        const fallback = matchResult.text.length > 1500
          ? matchResult.text.slice(0, 1497) + "..."
          : matchResult.text;
        await sendWhatsAppMessage(phoneNumber, fallback);
      }

      return twimlResponse(aiResponse);
    }

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

    // Persist conversation state to Redis
    await setConversation(phoneNumber, convo);

    return twimlResponse(aiResponse);
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return twimlResponse(
      "Oops, I hit a snag. Please try again in a moment!"
    );
  }
}
