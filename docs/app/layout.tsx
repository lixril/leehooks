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
verification: {
    google: 'google1250dc0252fcb139'
  },
  openGraph: {
    title: 'leehooks - Advanced React Hooks Library',
    description: 'The advanced React hook library built for React 19 by the lixril team.',
    images: [
      {
        url: 'https://github.com/user-attachments/assets/8122999c-d513-4a25-9ead-400d699293d7',  // Place a 1200x630 PNG/JPG in public/
        width: 1200,
        height: 630,
        alt: 'leehooks',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'leehooks - Advanced React Hooks Library',
    description: 'The advanced React hook library built for React 19 by the lixril team.',
    images: ['https://github.com/user-attachments/assets/8122999c-d513-4a25-9ead-400d699293d7'],
  },
};


type LayoutProps<T extends string> = {
  children: React.ReactNode;
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
