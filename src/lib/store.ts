// Persistent conversation store backed by Upstash Redis.
// Keyed by phone number (e.g. "+14155551234").
// Used by both WhatsApp and Vapi webhook routes.

import { Redis } from "@upstash/redis";

export interface UserProfile {
  name?: string;
  role?: string;
  background?: string;
  strength?: string;
  lookingFor?: string;
  canOffer?: string;
  linkedinUrl?: string;
  email?: string;
}

export interface PendingMatch {
  name: string;
  roleCompany: string;
  bullets: string[];
  drawback: string | null;
  introMessage: string;
  linkedin: string | null;
  email: string | null;
}

export interface ConversationState {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  profile: UserProfile;
  onboardingStep: number;
  linkedinLoaded: boolean;
  vapiCallId?: string;
  vapiCallComplete?: boolean;
  pendingMatches?: PendingMatch[];
  currentMatchIndex?: number;
  acceptedMatches?: PendingMatch[];
}

const redis = Redis.fromEnv();

const KEY_PREFIX = "convo:";
// Conversations expire after 24 hours
const TTL_SECONDS = 60 * 60 * 24;

export async function getConversation(
  phoneNumber: string
): Promise<ConversationState | null> {
  const data = await redis.get<ConversationState>(`${KEY_PREFIX}${phoneNumber}`);
  return data;
}

export async function setConversation(
  phoneNumber: string,
  state: ConversationState
): Promise<void> {
  await redis.set(`${KEY_PREFIX}${phoneNumber}`, state, { ex: TTL_SECONDS });
}

export function newConversation(): ConversationState {
  return {
    messages: [],
    profile: {},
    onboardingStep: 0,
    linkedinLoaded: false,
  };
}
