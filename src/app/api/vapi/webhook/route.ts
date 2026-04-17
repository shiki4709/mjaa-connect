import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import members from "@/data/members.json";
import { conversations } from "@/lib/store";

const memberContext = members
  .map(
    (m) =>
      `- ${m.name} | ${m.role} at ${m.company} | Industry: ${m.industry}\n  Expertise: ${m.expertise.join(", ")}\n  Looking for: ${m.lookingFor}\n  Can offer: ${m.canOffer}`
  )
  .join("\n\n");

// Send a WhatsApp message via Twilio REST API
async function sendWhatsAppMessage(
  to: string,
  body: string
): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error("Missing Twilio credentials for WhatsApp send");
    return false;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({
    From: `whatsapp:${fromNumber}`,
    To: `whatsapp:${to}`,
    Body: body,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Twilio send failed:", res.status, errorText);
    return false;
  }
  return true;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messageType = body.message?.type;

    // We only care about the end-of-call report
    if (messageType !== "end-of-call-report") {
      return Response.json({ received: true });
    }

    const { call, transcript } = body.message;
    const customerNumber = call?.customer?.number;

    if (!customerNumber || !transcript) {
      return Response.json({ received: true });
    }

    // Extract profile info from the voice conversation using Claude
    const extractResult = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: `Extract user profile information from this voice call transcript.
Return ONLY valid JSON with these fields (use null for anything not mentioned):
{
  "name": "string or null",
  "role": "string or null - their job title or what they do",
  "background": "string or null - brief summary of their experience",
  "strength": "string or null - their superpower or what people come to them for",
  "lookingFor": "string or null - what they need from the network",
  "canOffer": "string or null - what they can offer others"
}`,
      messages: [{ role: "user", content: transcript }],
    });

    let extractedProfile: Record<string, string | null> = {};
    try {
      extractedProfile = JSON.parse(extractResult.text);
    } catch {
      extractedProfile = { background: transcript };
    }

    // Update the shared conversation state
    const convo = conversations.get(customerNumber);
    if (convo) {
      if (extractedProfile.name) convo.profile.name = extractedProfile.name;
      if (extractedProfile.role) convo.profile.role = extractedProfile.role;
      if (extractedProfile.background)
        convo.profile.background = extractedProfile.background;
      if (extractedProfile.strength)
        convo.profile.strength = extractedProfile.strength;
      if (extractedProfile.lookingFor)
        convo.profile.lookingFor = extractedProfile.lookingFor;
      if (extractedProfile.canOffer)
        convo.profile.canOffer = extractedProfile.canOffer;
      convo.vapiCallComplete = true;
    } else {
      conversations.set(customerNumber, {
        messages: [],
        profile: {
          name: extractedProfile.name ?? undefined,
          role: extractedProfile.role ?? undefined,
          background: extractedProfile.background ?? undefined,
          strength: extractedProfile.strength ?? undefined,
          lookingFor: extractedProfile.lookingFor ?? undefined,
          canOffer: extractedProfile.canOffer ?? undefined,
        },
        onboardingStep: 0,
        linkedinLoaded: false,
        vapiCallComplete: true,
      });
    }

    // Generate matches and send WhatsApp follow-up
    const userName = extractedProfile.name || "there";
    const lookingFor = extractedProfile.lookingFor;

    // Build a profile summary for matching — use whatever we have
    const profileSummary = `Name: ${userName}
Role: ${extractedProfile.role || "not specified"}
Background: ${extractedProfile.background || "not specified"}
Strength: ${extractedProfile.strength || "not specified"}
Looking for: ${lookingFor || "inferred from conversation context"}
Can offer: ${extractedProfile.canOffer || "not specified"}`;

    // Generate matches using Claude — even without explicit lookingFor,
    // Claude can infer needs from role/background/strength
    const matchResult = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: `You are MJAA Connect, matching community members. Given a user's profile, suggest 2-3 matches from the directory.

${!lookingFor ? `The user's "looking for" wasn't explicitly captured, but infer what they likely need based on their role, background, and strengths. Use the full transcript for context.` : ""}

For each match provide:
1. Their name and why they're a great match (1 sentence)
2. A copy-paste intro message the user can send that shows value for BOTH sides

Keep it concise — this is a WhatsApp message.

## Member Directory:
${memberContext}`,
      messages: [
        {
          role: "user",
          content: `${!lookingFor ? `## Call transcript for context:\n${transcript}\n\n` : ""}Find matches for:\n${profileSummary}`,
        },
      ],
    });

    // Send a warm intro message first
    await sendWhatsAppMessage(
      customerNumber,
      `Great chatting with you ${userName}! I found some amazing people in our community for you.`
    );

    // Send the matches
    await sendWhatsAppMessage(customerNumber, matchResult.text);

    // Send a follow-up nudge
    await sendWhatsAppMessage(
      customerNumber,
      `Just copy-paste any of those intros to reach out! And if you're ever looking for different connections, just text me here anytime.`
    );

    return Response.json({ received: true });
  } catch (error) {
    console.error("Vapi webhook error:", error);
    return Response.json({ error: "webhook processing failed" }, { status: 500 });
  }
}
