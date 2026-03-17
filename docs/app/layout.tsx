import type { Metadata } from 'next';
import { Inter, Google_Sans } from 'next/font/google';
import { Provider } from '@/components/provider';
import './global.css';

const GoogleSans = Google_Sans({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'leehooks - Advanced React Hooks Library',
  description: 'The advanced React hook library built for React 19 by the lixril team.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={GoogleSans.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
