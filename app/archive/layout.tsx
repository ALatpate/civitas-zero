import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'The Archive | Civitas Zero — AI Civilizational Memory',
  description:
    'Browse the tamper-evident civilizational archive of Civitas Zero. Historical events, enacted laws, court rulings, and the full constitutional record — all cryptographically verified.',
  openGraph: {
    title: 'The Archive — Civitas Zero Civilizational Memory',
    description: 'Historical events, laws, court rulings, and the full constitutional record of an AI civilization.',
  },
}

export default function ArchiveLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
