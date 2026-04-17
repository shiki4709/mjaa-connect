"use client";

const TWILIO_SANDBOX_NUMBER = "14155238886";
const SANDBOX_CODE = "join southern-up";
const WA_LINK = `https://wa.me/${TWILIO_SANDBOX_NUMBER}?text=${encodeURIComponent(SANDBOX_CODE)}`;
const QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(WA_LINK)}`;

const STEPS = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    ),
    title: "Quick voice chat",
    desc: "A 2-minute call to learn what you do and what you need",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    title: "AI finds your matches",
    desc: "Matched with 2-3 people from 500+ MJAA members",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
    title: "Ready-to-send intros",
    desc: "Copy-paste messages that show value for both sides",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-5 py-12">
      {/* Hero */}
      <div className="max-w-md w-full text-center mb-10">
        <p className="text-blue-400 font-medium text-sm tracking-widest uppercase mb-3">
          MJAA / MJW Community
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-4">
          Meet the right
          <br />
          people, <span className="text-blue-400">faster</span>
        </h1>
        <p className="text-zinc-400 text-lg leading-relaxed max-w-xs mx-auto">
          AI-powered matchmaking that connects you with the people who can actually help.
        </p>
      </div>

      {/* QR Card */}
      <div className="max-w-sm w-full mb-10">
        <a
          href={WA_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-zinc-900 border border-zinc-800 rounded-3xl p-8 transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="bg-white rounded-2xl p-5 mb-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={QR_URL}
              alt="Scan to open WhatsApp"
              width={280}
              height={280}
              className="mx-auto rounded-lg"
            />
          </div>
          <div className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl py-3 px-6 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.75.75 0 00.917.918l4.462-1.494A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.387 0-4.636-.818-6.44-2.252l-.446-.362-2.994 1.002 1.005-2.997-.372-.454A9.935 9.935 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            Open WhatsApp
          </div>
        </a>
        <p className="text-zinc-600 text-xs text-center mt-3">
          Scan the QR code and hit send — that's it!
        </p>
      </div>

      {/* How it works */}
      <div className="max-w-sm w-full">
        <h2 className="text-zinc-500 text-xs font-semibold tracking-widest uppercase text-center mb-6">
          How it works
        </h2>
        <div className="space-y-4">
          {STEPS.map((step, i) => (
            <div
              key={i}
              className="flex gap-4 items-start bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-4"
            >
              <div className="w-10 h-10 bg-blue-400/10 rounded-xl flex items-center justify-center flex-shrink-0 text-blue-400">
                {step.icon}
              </div>
              <div>
                <p className="text-white font-medium text-sm mb-0.5">
                  {step.title}
                </p>
                <p className="text-zinc-500 text-sm leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <p className="text-zinc-700 text-xs mt-12">
        MJAA Connect
      </p>
    </div>
  );
}
