import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin-auth';
import LoginForm from './form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await isAdmin()) redirect('/admin');
  return (
    <div className="login">
      <div className="login-card">
        <img src="/mascot.webp" alt="" width={120} height={110} />
        <h1>Team panel</h1>
        <p>Harbour Study Abroad · demo</p>
        <LoginForm />
      </div>
    </div>
  );
}
