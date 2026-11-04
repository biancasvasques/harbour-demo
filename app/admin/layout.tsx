import type { ReactNode } from 'react';
import './admin.css';

export const metadata = { title: 'Harbour · Team panel' };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="admin">{children}</div>;
}
