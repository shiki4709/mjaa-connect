"use client";

import { useState } from "react";

interface UserProfile {
  name: string;
  email: string;
  role: string;
  lookingFor: string;
  canOffer: string;
}

interface SignUpFormProps {
  onComplete: (profile: UserProfile) => void;
}

export default function SignUpForm({ onComplete }: SignUpFormProps) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<UserProfile>({
    name: "",
    email: "",
    role: "",
    lookingFor: "",
    canOffer: "",
  });

  const steps = [
    {
      field: "name" as const,
      label: "What's your name?",
      placeholder: "e.g. Sarah Chen",
      type: "text",
    },
    {
      field: "email" as const,
      label: "Your email?",
      placeholder: "sarah@example.com",
      type: "email",
    },
    {
      field: "role" as const,
      label: "What do you do?",
      placeholder: "e.g. Product Manager at Google",
      type: "text",
    },
    {
      field: "lookingFor" as const,
      label: "What are you looking for?",
      placeholder: "e.g. Investors for my healthcare startup, mentorship in AI...",
      type: "text",
    },
    {
      field: "canOffer" as const,
      label: "What can you offer others?",
      placeholder: "e.g. Product strategy advice, hiring referrals...",
      type: "text",
    },
  ];

  const currentStep = steps[step];
  const value = profile[currentStep.field];

  function handleNext() {
    if (!value.trim()) return;
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete(profile);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleNext();
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">MJAA Connect</h1>
          <p className="text-zinc-400 text-sm">
            AI-powered networking for the MJAA/MJW community
          </p>
        </div>

        <div className="flex gap-1.5 mb-8">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-amber-500" : "bg-zinc-800"
              }`}
            />
          ))}
        </div>

        <div className="space-y-4">
          <label className="block text-white text-lg font-medium">
            {currentStep.label}
          </label>
          {currentStep.field === "lookingFor" || currentStep.field === "canOffer" ? (
            <textarea
              value={value}
              onChange={(e) =>
                setProfile({ ...profile, [currentStep.field]: e.target.value })
              }
              onKeyDown={handleKeyDown}
              placeholder={currentStep.placeholder}
              rows={3}
              autoFocus
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none"
            />
          ) : (
            <input
              type={currentStep.type}
              value={value}
              onChange={(e) =>
                setProfile({ ...profile, [currentStep.field]: e.target.value })
              }
              onKeyDown={handleKeyDown}
              placeholder={currentStep.placeholder}
              autoFocus
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          )}
          <button
            onClick={handleNext}
            disabled={!value.trim()}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-semibold py-3 rounded-xl transition-colors"
          >
            {step < steps.length - 1 ? "Continue" : "Start Connecting"}
          </button>
        </div>

        <p className="text-zinc-600 text-xs mt-6 text-center">
          Step {step + 1} of {steps.length}
        </p>
      </div>
    </div>
  );
}
