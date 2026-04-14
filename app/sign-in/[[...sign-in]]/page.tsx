import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0d12]">
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        appearance={{
          variables: {
            colorPrimary: '#6ee7b7',
            colorBackground: '#111827',
            colorText: '#e5e7eb',
            colorInputBackground: '#1f2937',
            colorInputText: '#e5e7eb',
          },
          elements: {
            rootBox: 'w-full max-w-md',
            card: 'bg-[#111827] border border-white/10 shadow-2xl',
          },
        }}
      />
      {/* Fallback visible while Clerk loads */}
      <noscript>
        <p className="text-zinc-400 mt-4 text-sm">JavaScript is required to sign in.</p>
      </noscript>
    </div>
  );
}
