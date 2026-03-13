import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { Navbar } from '@/components/custom/nav';

export default function Layout({ children }: LayoutProps<'/'>) {
  return <HomeLayout  nav={{ enabled: true, }}>{children}</HomeLayout>;
}
