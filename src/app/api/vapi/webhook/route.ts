import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import members from "@/data/members.json";
import { getConversation, setConversation, newConversation, type PendingMatch } from "@/lib/store";
import { sendWhatsAppMessage } from "@/lib/twilio";

const memberContext = members
  .map(
    (m) =>
      `- [ID:${m.id}] ${m.name} | ${m.role} at ${m.company} | Industry: ${m.industry}\n  Expertise: ${m.expertise.join(", ")}\n  Looking for: ${m.lookingFor}\n  Can offer: ${m.canOffer}`
  )
  .join("\n\n");

// Lookup member by name for linkedin/email
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

    console.log("VAPI END-OF-CALL:", { customerNumber, hasTranscript: !!transcript, transcriptLength: transcript?.length });

    if (!customerNumber || !transcript) {
      console.error("VAPI: Missing customerNumber or transcript");
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
  "canOffer": "string or null - what they can offer others",
  "email": "string or null - their email address if they shared it"
}`,
      messages: [{ role: "user", content: transcript }],
    });

    let extractedProfile: Record<string, string | null> = {};
    try {
      extractedProfile = JSON.parse(extractResult.text);
    } catch {
      extractedProfile = { background: transcript };
    }

    // Update the shared conversation state in Redis
    const convo = (await getConversation(customerNumber)) ?? newConversation();
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
    if (extractedProfile.email)
      convo.profile.email = extractedProfile.email;
    convo.vapiCallComplete = true;
    await setConversation(customerNumber, convo);

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

    // Generate matches as structured JSON — one message per person, Boardy-style
    const matchResult = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: `You are MJAA Connect, matching community members. Given a user's profile, find 2-3 best matches from the directory.

${!lookingFor ? `The user's "looking for" wasn't explicitly captured, but infer what they likely need based on their role, background, and strengths. Use the full transcript for context.` : ""}

Return ONLY valid JSON — an array of match objects:
[
  {
    "name": "Full Name",
    "roleCompany": "Role at Company",
    "bullets": [
      "One short sentence: why this person is relevant",
      "One short sentence: how they can help",
      "One short sentence: practical context"
    ],
    "drawback": "Short caveat or null"
  }
]

## CRITICAL RULES:
- MAX 3 bullets per match, each under 100 characters.
- Drawback under 80 characters or null.
- No introMessage field.
- Keep it SHORT. Total JSON per match must be small.

## Member Directory:
${memberContext}`,
      messages: [
        {
          role: "user",
          content: `${!lookingFor ? `## Call transcript for context:\n${transcript}\n\n` : ""}Find matches for:\n${profileSummary}`,
        },
      ],
    });

    // Parse matches and send each as a separate WhatsApp message
    let matches: Array<{
      name: string;
      roleCompany: string;
      bullets: string[];
      drawback: string | null;
    }> = [];
    try {
      // Strip markdown code fences if present (```json ... ```)
      const cleaned = matchResult.text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      matches = JSON.parse(cleaned);
    } catch {
      // Fallback: send raw text if JSON parsing fails, truncated to fit
      const fallback = matchResult.text.length > 1500
        ? matchResult.text.slice(0, 1497) + "..."
        : matchResult.text;
      await sendWhatsAppMessage(customerNumber, fallback);
      return Response.json({ received: true });
    }

    // Send intro message
    await sendWhatsAppMessage(
      customerNumber,
      `Great chatting with you ${userName}! I found ${matches.length} people in our community you should meet 👇`
    );

    // Store pending matches in conversation for accept/skip flow
    const updatedConvo = (await getConversation(customerNumber)) ?? newConversation();
    updatedConvo.pendingMatches = matches.map((match) => {
      const member = findMember(match.name);
      return {
        ...match,
        linkedin: member?.linkedin ?? null,
        email: member?.email ?? null,
      };
    });
    updatedConvo.currentMatchIndex = 0;
    await setConversation(customerNumber, updatedConvo);

    // Send first match
    const firstMatch = updatedConvo.pendingMatches[0];
    const msg = formatMatchCard(firstMatch, 1, matches.length);
    await sendWhatsAppMessage(customerNumber, msg);

    return Response.json({ received: true });
  } catch (error) {
    console.error("Vapi webhook error:", error);
    return Response.json({ error: "webhook processing failed" }, { status: 500 });
  }
}
