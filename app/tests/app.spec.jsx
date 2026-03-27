import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../src/App.jsx';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            activationDefinition: { description: 'Invoice or workflow execution activates a business.' },
            businessTypes: ['Restoran / Kafe'],
            orderChannels: ['WhatsApp'],
            businesses: [],
            activeBusiness: null,
            dashboard: {
              headline: {
                signups: 0,
                activationRate: 0,
                timeToActivationMinutes: null,
                cac: null,
                invoicesIssued: 0,
                revenue: 0,
              },
              completionRates: [],
              recentLogs: [],
            },
          }),
      }),
    ),
  );
});

describe('App shell', () => {
  it('renders the onboarding headline and dashboard shell', async () => {
    render(<App />);

    await waitFor(() => {
    expect(screen.getByText('Tapau GTM Engine')).toBeTruthy();
    });

    expect(screen.getByText('Onboarding flow')).toBeTruthy();
    expect(screen.getByText('Metrics dashboard')).toBeTruthy();
    expect(screen.getByText('Credential onboarding')).toBeTruthy();
  });
});
