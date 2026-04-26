import LandingPage from '@/components/shared/LandingPage';

// Flostruction Landing Page — root route (/)
// No navigation to /field, /verify, /command — public-facing only
export default function Home() {
  return <LandingPage />;
}
