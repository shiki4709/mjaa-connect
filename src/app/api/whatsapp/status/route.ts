import { sendWhatsAppMessage } from "@/lib/twilio";
import { getConversation, setConversation, newConversation } from "@/lib/store";

export async function POST(req: Request) {
  try {
    const text = await req.text();
    const params = new URLSearchParams(text);

    const messageSid = params.get("MessageSid");
    const messageStatus = params.get("MessageStatus") || params.get("SmsStatus");
    const to = params.get("To");

    // Log for debugging
    console.log("Status callback:", { messageSid, messageStatus, to });

    // When Twilio delivers the sandbox "You are all set!" message,
    // the status will be "delivered" and "To" is the user's number.
    // We send our welcome greeting right after.
    if (messageStatus === "delivered" && to) {
      const phoneNumber = to.replace("whatsapp:", "");

      // Only greet if this is a new user (no existing conversation)
      const existing = await getConversation(phoneNumber);
      if (!existing) {
        const greeting =
          "Hey! Welcome to MJAA Connect — I'm your AI matchmaker for the MJAA community. I'll connect you with the right people based on what you need. Let's start — what's your name?";
        const convo = newConversation();
        convo.messages.push({ role: "assistant", content: greeting });
        await setConversation(phoneNumber, convo);
        await sendWhatsAppMessage(phoneNumber, greeting);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Status callback error:", error);
    return new Response("OK", { status: 200 });
  }
}
