// Saturday Shape A — Task A4: welcome email render tests.

import { describe, it, expect } from 'vitest';
import { renderWelcomeEmail } from './welcome';

describe('renderWelcomeEmail', () => {
  it('renders subject "Welcome to FLOSTRUCTION — your /command is ready"', () => {
    const out = renderWelcomeEmail({
      to: 'a@example.test',
      companyName: 'Acme Pty Ltd',
      pricingTier: 'standard',
    });
    expect(out.subject).toBe('Welcome to FLOSTRUCTION — your /command is ready');
  });

  it('text body addresses the company by name', () => {
    const out = renderWelcomeEmail({
      to: 'a@example.test',
      companyName: 'Acme Pty Ltd',
      pricingTier: 'standard',
    });
    expect(out.text).toMatch(/Hi Acme Pty Ltd,/);
  });

  it('text body labels Standard tier without spot number', () => {
    const out = renderWelcomeEmail({
      to: 'a@example.test',
      companyName: 'Acme',
      pricingTier: 'standard',
    });
    expect(out.text).toMatch(/Tier: Standard/);
    expect(out.text).not.toMatch(/spot #/);
  });

  it('text body labels Founding tier with spot number when provided', () => {
    const out = renderWelcomeEmail({
      to: 'a@example.test',
      companyName: 'Acme',
      pricingTier: 'founding',
      foundingSpot: 7,
    });
    expect(out.text).toMatch(/Tier: Founding Cohort · spot #7/);
  });

  it('text body labels Founding tier without spot number when foundingSpot null', () => {
    const out = renderWelcomeEmail({
      to: 'a@example.test',
      companyName: 'Acme',
      pricingTier: 'founding',
      foundingSpot: null,
    });
    expect(out.text).toMatch(/Tier: Founding Cohort\n/);
  });

  it('text body links to /command/dashboard with NEXT_PUBLIC_APP_URL', () => {
    const out = renderWelcomeEmail({
      to: 'a@example.test',
      companyName: 'Acme',
      pricingTier: 'standard',
    });
    expect(out.text).toMatch(/\/command\/dashboard/);
  });

  it('text body includes first-step site guidance', () => {
    const out = renderWelcomeEmail({
      to: 'a@example.test',
      companyName: 'Acme',
      pricingTier: 'standard',
    });
    expect(out.text).toMatch(/First step: add your first site/);
  });

  it('text body includes canonical Foundation Entity sign-off', () => {
    const out = renderWelcomeEmail({
      to: 'a@example.test',
      companyName: 'Acme',
      pricingTier: 'standard',
    });
    expect(out.text).toMatch(/FLOSMOSIS PTY LTD/);
    expect(out.text).toMatch(/Foundation Entity for the WLES per Constitution v1\.0 cl 7\.3/);
  });

  it('html body uses canonical mockup palette tokens', () => {
    const out = renderWelcomeEmail({
      to: 'a@example.test',
      companyName: 'Acme',
      pricingTier: 'standard',
    });
    expect(out.html).toMatch(/#0F0F10/); // charcoal
    expect(out.html).toMatch(/#F5F2EA/); // cream
    expect(out.html).toMatch(/#D9A548/); // mockup amber
    expect(out.html).toMatch(/#2D5F3F/); // forest
    expect(out.html).toMatch(/Archivo Narrow/);
    expect(out.html).toMatch(/JetBrains Mono/);
  });

  it('html body cites ACN 697 323 925 in the footer (canonical Foundation Entity ID)', () => {
    const out = renderWelcomeEmail({
      to: 'a@example.test',
      companyName: 'Acme',
      pricingTier: 'standard',
    });
    expect(out.html).toMatch(/ACN 697 323 925/);
  });

  it('html body has CTA button with /command/dashboard link', () => {
    const out = renderWelcomeEmail({
      to: 'a@example.test',
      companyName: 'Acme',
      pricingTier: 'standard',
    });
    expect(out.html).toMatch(/href=".*\/command\/dashboard"/);
    expect(out.html).toMatch(/Open \/command/);
  });

  it('html body escapes user-supplied company name (XSS guard)', () => {
    const out = renderWelcomeEmail({
      to: 'a@example.test',
      companyName: '<script>alert(1)</script>',
      pricingTier: 'standard',
    });
    expect(out.html).not.toMatch(/<script>alert/);
    expect(out.html).toMatch(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });
});
