import { redirect } from 'next/navigation';

export default function CommandRoot() {
  redirect('/command/dashboard');
}
