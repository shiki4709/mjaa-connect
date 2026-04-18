import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import members from "@/data/members.json";
import {
  getConversation,
  setConversation,
  newConversation,
  type ConversationState,
  type PendingMatch,
} from "@/lib/store";
import { sendWhatsAppMessage } from "@/lib/twilio";

function findMember(name: string) {
  return members.find(
    (m) => m.name.toLowerCase() === name.toLowerCase()
  );
}

function formatMatchCard(match: PendingMatch, index: number, total: number): string {
  const bulletText = match.bullets.map((b) => `• ${b}`).join("\n");
  const drawbackText = match.drawback ? `\nDrawback: ${match.drawback}` : "";
  const linkedinText = match.linkedin ? `\n${match.linkedin}` : "";

  const msg = `*${match.name}* (${match.roleCompany})
${bulletText}
${drawbackText}
${linkedinText}

Reply *accept* to connect or *skip* to see the next match (${index}/${total})`;

  return msg.length > 1500 ? msg.slice(0, 1497) + "..." : msg;
}

async function sendIntroEmail(
  userName: string,
  userRole: string,
  match: PendingMatch
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !match.email) {
    console.log("INTRO EMAIL (not sent):", { to: match.email, matchName: match.name, userName });
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "MJAA Connect <connect@mjaa-connect.vercel.app>",
      to: match.email,
      subject: `MJAA Connect: Meet ${userName}`,
      text: `Hi ${match.name},\n\n${userName}${userRole ? ` (${userRole})` : ""} from the MJAA community would love to connect with you.\n\nThey're interested in connecting because of your expertise in ${match.roleCompany}.\n\nWe'll let ${userName} follow up from here!\n\nBest,\nMJAA Connect`,
    }),
  }).catch((err) => console.error("Resend email failed:", err));
}

const memberContext = members
  .map(
    (m) =>
      `- ${m.name} | ${m.role} at ${m.company} | Industry: ${m.industry}\n  Expertise: ${m.expertise.join(", ")}\n  Looking for: ${m.lookingFor}\n  Can offer: ${m.canOffer}`
  )
  .join("\n\n");

function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function extractLinkedInUrl(text: string): string | null {
  const match = text.match(
    /https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/
  );
  return match ? match[0] : null;
}

function getSystemPrompt(convo: ConversationState) {
  const { profile } = convo;

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
- No markdown formatting. Use *bold* only for names.
- React briefly to what they said, then ask the next thing.

## Onboarding (one question per message):
1. The first message already asked their name. When they reply with their name, ask for their LinkedIn profile and email: "Nice to meet you [name]! Drop me your LinkedIn URL and email so I can connect you properly."
2. After they share LinkedIn/email (or say they don't have one), IMMEDIATELY offer to call: "Perfect! Let me give you a quick call — 2 minutes and I'll find you the perfect connections. Sound good?"
3. If they say YES to the call, respond with EXACTLY this text and nothing else: [TRIGGER_VOICE_CALL]
4. ONLY if they explicitly say NO to the call, continue with text onboarding:
   a. Ask what they do
   b. Ask their superpower and what they can offer others
   c. "What are you looking for right now?" — this starts matching
5. ALWAYS push for the call. If they seem hesitant, reassure them it's just 2 minutes.
${voiceContext}

## Matching:
When they say what they need, respond with [MATCHES_NEEDED] followed by what they're looking for.
Example: "[MATCHES_NEEDED] looking for a job in AI/ML engineering"
Do NOT try to list matches yourself. Just output the tag.

## Current user info:
${profile.name ? `Name: ${profile.name}` : "Name: not yet provided"}
${profile.role ? `Role: ${profile.role}` : "Role: not yet provided"}
${profile.background ? `Background: ${profile.background}` : "Background: not yet provided"}
${profile.strength ? `Biggest strength: ${profile.strength}` : "Biggest strength: not yet provided"}
${profile.lookingFor ? `Looking for: ${profile.lookingFor}` : "Looking for: not yet provided"}
${profile.canOffer ? `Can offer: ${profile.canOffer}` : "Can offer: not yet provided"}
${profile.linkedinUrl ? `LinkedIn: ${profile.linkedinUrl}` : ""}

## Rules:
- EVERY message must be short. 2-3 sentences max during onboarding.
- ONE question per message. Never combine questions.
- Only suggest matches from the directory below. Never invent members.

## MJAA/MJW Member Directory:
${memberContext}`;
}

function twimlResponse(message: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
  return new Response(xml, {
    headers: { "Content-Type": "text/xml" },
  });
}

function emptyTwiml(): Response {
  return new Response("<Response></Response>", {
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
5. After they answer, ask for their email — "Last thing — what's your email? I'll send intros there when I match you with someone."
6. After they give their email (or say they don't want to), wrap up: "Love it. I'll send you a few matches on WhatsApp in just a moment. Great chatting with you ${userName}!"
7. End the call.

## Rules:
- Be conversational, warm, and natural — like a friend, not a survey
- Keep it SHORT. React briefly to what they say, then move on
- Don't repeat back everything they said — just acknowledge and ask the next thing
- If they go off topic, gently guide back
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

// Process message in background — generates AI response and sends via REST API
// This runs AFTER we've already returned TwiML to Twilio, so no timeout risk.
async function processMessageInBackground(
  phoneNumber: string,
  body: string,
  convo: ConversationState
): Promise<void> {
  try {
    // Extract email/linkedin from message
    const email = extractEmail(body);
    if (email) convo.profile.email = email;

    const linkedinUrl = extractLinkedInUrl(body);
    if (linkedinUrl) convo.profile.linkedinUrl = linkedinUrl;

    convo.messages.push({ role: "user", content: body });

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

    // Only trigger call on exact tag — no fuzzy matching
    if (aiResponse.includes("[TRIGGER_VOICE_CALL]")) {
      const callId = await triggerVapiCall(phoneNumber, convo.profile.name || "there");

      if (callId) {
        convo.vapiCallId = callId;
        aiResponse = "Calling you now! Pick up the phone — I'll ask you a few quick questions and then send your matches right here on WhatsApp.";
      } else {
        aiResponse = "Hmm, I couldn't start the call right now. Let's keep going here instead! What do you do?";
      }
    }

    // Handle matching
    if (aiResponse.includes("[MATCHES_NEEDED]")) {
      const lookingFor = aiResponse.replace("[MATCHES_NEEDED]", "").trim() || body;
      convo.profile.lookingFor = lookingFor;

      await sendWhatsAppMessage(phoneNumber, "On it! Finding the best people in our community for you...");

      const matchResult = await generateText({
        model: anthropic("claude-haiku-4-5-20251001"),
        system: `You are MJAA Connect, matching community members. Find 2-3 best matches.

Return ONLY valid JSON array:
[{"name":"Full Name","roleCompany":"Role at Company","bullets":["reason 1","reason 2","reason 3"],"drawback":"caveat or null"}]

MAX 3 bullets per match, each under 100 chars. Keep it SHORT.

## Member Directory:
${memberContext}`,
        messages: [
          {
            role: "user",
            content: `Find matches for:
Name: ${convo.profile.name || "unknown"}
Role: ${convo.profile.role || "not specified"}
Looking for: ${lookingFor}`,
          },
        ],
      });

      try {
        const cleaned = matchResult.text
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```\s*$/, "")
          .trim();
        const rawMatches = JSON.parse(cleaned) as Array<{
          name: string;
          roleCompany: string;
          bullets: string[];
          drawback: string | null;
        }>;

        const enriched: PendingMatch[] = rawMatches.map((match) => {
          const member = findMember(match.name);
          return { ...match, linkedin: member?.linkedin ?? null, email: member?.email ?? null };
        });

        convo.pendingMatches = enriched;
        convo.currentMatchIndex = 0;
        convo.acceptedMatches = [];
        convo.messages.push({ role: "assistant", content: "Here are your matches:" });
        await setConversation(phoneNumber, convo);

        const msg = formatMatchCard(enriched[0], 1, enriched.length);
        await sendWhatsAppMessage(phoneNumber, msg);
      } catch {
        const fallback = matchResult.text.length > 1500
          ? matchResult.text.slice(0, 1497) + "..."
          : matchResult.text;
        await sendWhatsAppMessage(phoneNumber, fallback);
      }
      return;
    }

    // Normal response — send via REST API
    convo.messages.push({ role: "assistant", content: aiResponse });

    // Simple name extraction from early messages
    if (!convo.profile.name && convo.messages.length >= 2) {
      const userMsgs = convo.messages.filter((m) => m.role === "user");
      if (userMsgs.length >= 1) {
        const firstReply = userMsgs[0].content.trim();
        // If the first user message is short (likely a name), use it
        if (firstReply.length < 30 && !firstReply.includes(" ") || firstReply.split(" ").length <= 3) {
          convo.profile.name = firstReply;
        }
      }
    }

    await setConversation(phoneNumber, convo);
    await sendWhatsAppMessage(phoneNumber, aiResponse);
  } catch (error) {
    console.error("Background processing error:", error);
    await sendWhatsAppMessage(phoneNumber, "Oops, I hit a snag. Please try again!");
  }
}

export async function POST(req: Request) {
  try {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const body = params.get("Body");
    const from = params.get("From");

    if (!body || !from) {
      return twimlResponse("Sorry, something went wrong. Please try sending your message again.");
    }

    const phoneNumber = extractPhoneNumber(from);
    console.log("WHATSAPP INCOMING:", { body, from: phoneNumber });

    const lowerBody = body.toLowerCase().trim();

    // "join" messages — wipe state, return immediately
    if (lowerBody.startsWith("join ")) {
      await setConversation(phoneNumber, newConversation());
      return emptyTwiml();
    }

    // New user — return greeting via TwiML (fast, no LLM call)
    const existing = await getConversation(phoneNumber);
    const isNewUser = !existing || existing.messages.length === 0;

    if (isNewUser) {
      const greeting = "Hey! Welcome to MJAA Connect — I'm your AI matchmaker for the MJAA community. I'll connect you with the right people based on what you need. What's your name?";
      const convo = newConversation();
      convo.messages.push({ role: "user", content: body });
      convo.messages.push({ role: "assistant", content: greeting });
      await setConversation(phoneNumber, convo);
      return twimlResponse(greeting);
    }

    const convo = existing;

    // Handle accept/skip for pending matches — fast, no LLM call
    if (convo.pendingMatches && convo.pendingMatches.length > 0 && convo.currentMatchIndex !== undefined) {
      const isAccept = /^(accept|yes|connect|y)$/i.test(lowerBody);
      const isSkip = /^(skip|next|no|n|pass)$/i.test(lowerBody);

      if (isAccept || isSkip) {
        const currentMatch = convo.pendingMatches[convo.currentMatchIndex];

        if (isAccept && currentMatch) {
          if (!convo.acceptedMatches) convo.acceptedMatches = [];
          convo.acceptedMatches.push(currentMatch);

          if (currentMatch.email) {
            // Fire and forget — don't block TwiML response
            sendIntroEmail(convo.profile.name || "MJAA Member", convo.profile.role || "", currentMatch);
          }
        }

        convo.currentMatchIndex++;

        if (convo.currentMatchIndex < convo.pendingMatches.length) {
          const nextMatch = convo.pendingMatches[convo.currentMatchIndex];
          const msg = formatMatchCard(nextMatch, convo.currentMatchIndex + 1, convo.pendingMatches.length);
          await setConversation(phoneNumber, convo);

          // Fire and forget — send next match in background
          sendWhatsAppMessage(phoneNumber, msg);

          const ack = isAccept
            ? `Great choice! I've sent an intro to *${currentMatch.name}*. Here's your next match...`
            : "Got it, here's the next one...";
          return twimlResponse(ack);
        } else {
          convo.pendingMatches = undefined;
          convo.currentMatchIndex = undefined;
          const accepted = convo.acceptedMatches?.length || 0;
          await setConversation(phoneNumber, convo);
          const doneMsg = accepted > 0
            ? `That's all your matches! I sent ${accepted} intro${accepted > 1 ? "s" : ""}. Text me anytime you want more connections.`
            : `That's all your matches! Text me anytime you want to try again with different criteria.`;
          return twimlResponse(doneMsg);
        }
      }
    }

    // Process synchronously — send response via REST API.
    // TwiML is not used for these messages, so Twilio timeout doesn't apply
    // (we already returned for new-user and accept/skip paths via TwiML above).
    await processMessageInBackground(phoneNumber, body, convo);

    return emptyTwiml();
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return twimlResponse("Oops, I hit a snag. Please try again in a moment!");
  }
}
