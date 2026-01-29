import './globals.css'
import '../main.css'

export const metadata = {
  title: 'Shopping List Dynamic',
  description: 'A dynamic grocery list parser with database storage',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}