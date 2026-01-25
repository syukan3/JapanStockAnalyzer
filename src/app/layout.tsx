import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Japan Stock Analyzer',
  description: 'J-Quants API data synchronization and analysis',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
