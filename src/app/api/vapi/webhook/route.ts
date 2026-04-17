import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import members from "@/data/members.json";
import { getConversation, setConversation, newConversation } from "@/lib/store";
import { sendWhatsAppMessage } from "@/lib/twilio";

const memberContext = members
  .map(
    (m) =>
      `- ${m.name} | ${m.role} at ${m.company} | Industry: ${m.industry}\n  Expertise: ${m.expertise.join(", ")}\n  Looking for: ${m.lookingFor}\n  Can offer: ${m.canOffer}`
  )
  .join("\n\n");

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
      "Specific reason this person is relevant — reference their expertise, what they're building, concrete details",
      "How their background maps to what the user needs — be specific about the connection",
      "What they can offer that directly helps the user's goals",
      "Any logistics or availability context"
    ],
    "drawback": "One honest caveat or limitation of this match (or null if none)",
    "introMessage": "A copy-paste message the user can send to this person that shows value for BOTH sides. Be specific about what each person brings."
  }
]

## IMPORTANT:
- Each bullet should be 1 sentence max — specific but concise.
- The intro message should be 2-3 sentences max.
- TOTAL per match must be UNDER 1500 characters. This is a WhatsApp message limit.
- Be specific but brief. No filler words.

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
      introMessage: string;
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

    // Send each match as a separate message — Boardy style
    for (const match of matches) {
      const bulletText = match.bullets.map((b) => `• ${b}`).join("\n");
      const drawbackText = match.drawback
        ? `\nDrawback: ${match.drawback}`
        : "";

      const matchMessage = `*${match.name}* (${match.roleCompany})
${bulletText}
${drawbackText}

💬 Intro you can send:
"${match.introMessage}"`;

      // Twilio WhatsApp limit is 1600 chars — truncate if needed
      const truncated = matchMessage.length > 1500
        ? matchMessage.slice(0, 1497) + "..."
        : matchMessage;
      await sendWhatsAppMessage(customerNumber, truncated);
    }

    // Follow-up nudge
    await sendWhatsAppMessage(
      customerNumber,
      `Just copy-paste any of those intros to reach out! Text me here anytime you want different connections.`
    );

    return Response.json({ received: true });
  } catch (error) {
    console.error("Vapi webhook error:", error);
    return Response.json({ error: "webhook processing failed" }, { status: 500 });
  }
}
