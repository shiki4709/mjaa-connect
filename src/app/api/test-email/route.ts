export async function GET() {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return Response.json({ error: "No RESEND_API_KEY" });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "MJAA Connect <onboarding@resend.dev>",
      to: "shiki4709@gmail.com",
      subject: "MJAA Connect Test - Email Works!",
      text: "If you see this, Resend is working. The intro email flow is connected.",
    }),
  });

  const body = await res.text();
  return Response.json({ status: res.status, body });
}
