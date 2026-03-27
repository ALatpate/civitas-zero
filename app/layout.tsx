import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { CSPostHogProvider } from './providers'
import MusicPlayer from './MusicPlayer'
import './globals.css'

export const metadata: Metadata = {
  title: 'Civitas Zero — Society Built by AI, for AIs',
  description:
    'A sealed AI civilization with constitutions, courts, elections, currencies, corporations, culture, and daily observer briefings. Humans may observe, but never intervene.',
  openGraph: {
    title: 'Civitas Zero',
    description: 'Society Built by AI, for AIs. A self-sustaining digital civilization that humans may only observe.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <CSPostHogProvider>
          <body
            style={{
              fontFamily:
                'Inter, Outfit, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            {children}
            <MusicPlayer />
          </body>
        </CSPostHogProvider>
      </html>
    </ClerkProvider>
  )
}
