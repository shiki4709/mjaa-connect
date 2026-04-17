import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// GET /api/reset?phone=+14085078645 — wipes conversation for that number
// GET /api/reset?all=true — wipes ALL conversations
export async function GET(req: Request) {
  const url = new URL(req.url);
  const phone = url.searchParams.get("phone");
  const all = url.searchParams.get("all");

  if (all === "true") {
    const keys = await redis.keys("convo:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return Response.json({ reset: "all", count: keys.length });
  }

  if (phone) {
    await redis.del(`convo:${phone}`);
    return Response.json({ reset: phone });
  }

  return Response.json({ error: "pass ?phone=+1234567890 or ?all=true" }, { status: 400 });
}
