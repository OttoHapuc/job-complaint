import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { LegalNoticeBanner } from '@/components/legal-notice-banner'
import { ThemeToggle } from '@/components/theme-toggle'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'JobComplaint — Canal Seguro de Denúncias',
  description: 'Sistema corporativo seguro e anônimo para denúncias no ambiente de trabalho, assistido por Inteligência Artificial e em conformidade com a LGPD.',
  generator: 'v0.app',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} bg-background`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var k='jc_theme';var s=localStorage.getItem(k);var t=(s==='dark'||s==='light')?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t;}catch(e){}})();",
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeToggle />
        {children}
        <LegalNoticeBanner />
      </body>
    </html>
  )
}
