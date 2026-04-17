"use client";

// Twilio sandbox: users must text "join southern-up" to +1 415 523 8886 on WhatsApp
const TWILIO_SANDBOX_NUMBER = "14155238886";
const SANDBOX_CODE = "join southern-up";
const WA_LINK = `https://wa.me/${TWILIO_SANDBOX_NUMBER}?text=${encodeURIComponent(SANDBOX_CODE)}`;
// QR code via Google Charts API — encodes the wa.me deep link
const QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(WA_LINK)}`;

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-8 h-8 text-black"
            >
              <path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 00-1.032-.211 50.89 50.89 0 00-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 002.433 3.984L7.28 21.53A.75.75 0 016 21v-4.03a48.527 48.527 0 01-1.087-.128C2.905 16.58 1.5 14.833 1.5 12.862V6.638c0-1.97 1.405-3.718 3.413-3.979z" />
              <path d="M15.75 7.5c-1.376 0-2.739.057-4.086.169C10.124 7.797 9 9.103 9 10.609v4.285c0 1.507 1.128 2.814 2.67 2.94 1.243.102 2.5.157 3.768.165l2.782 2.781a.75.75 0 001.28-.53v-2.39l.33-.026c1.542-.125 2.67-1.433 2.67-2.94v-4.286c0-1.505-1.125-2.811-2.664-2.94A49.392 49.392 0 0015.75 7.5z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">MJAA Connect</h1>
          <p className="text-zinc-400 text-lg">
            Your AI matchmaker for the MJAA/MJW community
          </p>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-6 mb-6">
          <p className="text-zinc-300 text-sm mb-4">
            Scan to join on WhatsApp:
          </p>
          <a href={WA_LINK} target="_blank" rel="noopener noreferrer">
            <div className="bg-white rounded-xl p-4 mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={QR_URL}
                alt="Scan to open WhatsApp"
                width={240}
                height={240}
                className="mx-auto"
              />
            </div>
          </a>
          <p className="text-zinc-500 text-xs">
            Or text <span className="text-amber-500 font-mono">join southern-up</span> to
            <br />
            <span className="text-white font-mono">+1 415 523 8886</span> on WhatsApp
          </p>
        </div>

        <div className="space-y-3 text-left">
          <div className="flex gap-3 items-start">
            <div className="w-6 h-6 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-amber-500 text-xs font-bold">1</span>
            </div>
            <p className="text-zinc-400 text-sm">
              Tell the AI what you&apos;re looking for — funding, mentorship,
              partnerships, or anything else
            </p>
          </div>
          <div className="flex gap-3 items-start">
            <div className="w-6 h-6 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-amber-500 text-xs font-bold">2</span>
            </div>
            <p className="text-zinc-400 text-sm">
              Get matched with 2-3 members from our network who can help
            </p>
          </div>
          <div className="flex gap-3 items-start">
            <div className="w-6 h-6 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-amber-500 text-xs font-bold">3</span>
            </div>
            <p className="text-zinc-400 text-sm">
              Receive a personalized intro message you can send right away
            </p>
          </div>
        </div>

        <p className="text-zinc-600 text-xs mt-8">
          Built with love by the MJAA Family
        </p>
      </div>
    </div>
  );
}
