'use client';

import { useActionState } from 'react';
import { login } from '../actions';

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="login-form">
      <label htmlFor="pw">Password</label>
      <input id="pw" name="password" type="password" autoComplete="current-password" required autoFocus />
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn" disabled={pending}>{pending ? 'Checking…' : 'Log in'}</button>
    </form>
  );
}
