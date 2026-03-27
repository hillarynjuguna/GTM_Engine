import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.js';
import { createFileStore } from '../server/store.js';
import { createInitialState } from '../server/domain.js';
import { parseLhdnError } from '../server/integrations/lhdn.js';
import { matchTemplate } from '../server/integrations/whatsapp.js';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../shared/contracts.js';

function buildServer() {
  const runtimePath = path.join(process.cwd(), 'server', 'runtime', `test-${crypto.randomUUID()}.db`);
  const store = createFileStore(runtimePath);
  store.reset(createInitialState());
  return { app: createApp(store), runtimePath, store };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

async function createBusinessProfile(app, overrides = {}) {
  return request(app).post('/api/onboarding/profile').send({
    businessName: 'Kedai Warisan',
    businessType: 'Restoran / Kafe',
    ownerName: 'Aisyah',
    phone: '60123456789',
    email: 'aisyah@example.com',
    orderChannels: ['WhatsApp'],
    leadSource: 'Meta Ads',
    ...overrides,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Integration helpers', () => {
  it('parses a TIN rejection into a diagnosis', () => {
    const diagnosis = parseLhdnError({
      rejectedDocuments: [
        {
          error: [
            {
              code: 'CF001',
              message: 'Taxpayer TIN is invalid.',
            },
          ],
        },
      ],
    });

    expect(diagnosis).toHaveLength(1);
    expect(diagnosis[0].code).toBe('CF001');
    expect(diagnosis[0].fix).toContain('TIN');
  });

  it('parses a schema validation rejection into a diagnosis', () => {
    const diagnosis = parseLhdnError({
      rejectedDocuments: [
        {
          error: [
            {
              code: 'CF999',
              message: 'Schema validation failed: AddressLine is required.',
            },
          ],
        },
      ],
    });

    expect(diagnosis[0].fix).toContain('schema validation');
  });

  it('falls back safely for unknown payloads', () => {
    const diagnosis = parseLhdnError('Unexpected gateway failure');

    expect(diagnosis).toHaveLength(1);
    expect(diagnosis[0].code).toBe('UNKNOWN');
    expect(diagnosis[0].message).toContain('Unexpected gateway failure');
  });

  it('returns null for empty payloads', () => {
    expect(parseLhdnError(null)).toBeNull();
  });

  it('matches WhatsApp templates by keyword rules', () => {
    expect(matchTemplate(DEFAULT_WHATSAPP_TEMPLATES, 'menu please')?.id).toBe('menu-request');
    expect(matchTemplate(DEFAULT_WHATSAPP_TEMPLATES, 'open now?')?.id).toBe('hours');
    expect(matchTemplate(DEFAULT_WHATSAPP_TEMPLATES, 'random nonsense xyz')).toBeNull();
    expect(matchTemplate([], 'menu')).toBeNull();
    expect(matchTemplate(DEFAULT_WHATSAPP_TEMPLATES, null)).toBeNull();
  });
});

describe('Tapau GTM onboarding API', () => {
  it('activates a business when the first invoice is sent', async () => {
    const { app } = buildServer();

    await createBusinessProfile(app);
    await request(app).post('/api/templates/generate').send({});

    const importResponse = await request(app).post('/api/import/confirm').send({
      source: 'manual',
      items: [
        { name: 'Nasi Lemak', price: 8, category: 'Main' },
        { name: 'Teh Tarik', price: 3, category: 'Drinks' },
      ],
    });

    const firstItemId = importResponse.body.activeBusiness.menuItems[0].id;

    await request(app).post('/api/whatsapp/connect').send({
      phoneNumber: '60123456789',
      testRecipient: '60123456789',
      skip: true,
    });

    const invoiceResponse = await request(app)
      .post('/api/invoices/create')
      .send({
        customerName: 'Test Customer',
        customerPhone: '60112223333',
        lineItems: [{ itemId: firstItemId, quantity: 2 }],
        source: 'dashboard',
        invoiceType: 'real',
        submitToLhdn: false,
        sendWhatsappConfirmation: false,
      })
      .expect(201);

    expect(invoiceResponse.body.activeBusiness.activationAt).toBeTruthy();
    expect(invoiceResponse.body.dashboard.headline.activated).toBe(1);
    expect(invoiceResponse.body.dashboard.headline.activationRate).toBe(100);
  });

  it('validates CSV preview rows and reports price errors', async () => {
    const { app } = buildServer();

    const response = await request(app)
      .post('/api/import/csv/preview')
      .send({
        csvText: 'Item,Price,Category\nNasi Lemak,8,Main\nTeh Tarik,,Drinks',
      })
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.errors).toHaveLength(1);
    expect(response.body.errors[0].field).toBe('price');
  });

  it('computes CAC from acquisition hooks', async () => {
    const { app } = buildServer();

    const response = await request(app)
      .post('/api/acquisition/hooks')
      .send({
        channel: 'Google Ads',
        spend: 500,
        leads: 10,
        customers: 2,
      })
      .expect(201);

    expect(response.body.headline.cac).toBeGreaterThan(0);
    expect(response.body.acquisitionHooks[0].channel).toBe('Google Ads');
  });

  it('encrypts and persists saved credentials across store reopen', async () => {
    const { app, runtimePath, store } = buildServer();
    await createBusinessProfile(app, { businessName: 'Persisted Warung' });

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: 'sandbox-token', expires_in: 3600 }))
        .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'wamid.saved' }] })),
    );

    const saveResponse = await request(app)
      .post('/api/credentials/save')
      .send({
        lhdnClientId: 'client-123',
        lhdnClientSecret: 'secret-456',
        whatsappAccessToken: 'token-789',
        whatsappPhoneNumberId: 'phone-001',
        whatsappVerifyToken: 'verify-002',
        whatsappTestRecipient: '60118889999',
      })
      .expect(201);

    const businessId = saveResponse.body.activeBusiness.id;
    const reloadedStore = createFileStore(runtimePath);
    const savedCredentials = reloadedStore.getCredentials(businessId);
    expect(savedCredentials.lhdnClientId).toBe('client-123');
    expect(savedCredentials.whatsappPhoneNumberId).toBe('phone-001');

    const rawRow = new DatabaseSync(runtimePath)
      .prepare('SELECT lhdn_client_id, whatsapp_access_token FROM credentials WHERE business_id = ?')
      .get(businessId);

    expect(rawRow.lhdn_client_id).not.toBe('client-123');
    expect(rawRow.whatsapp_access_token).not.toBe('token-789');
    expect(store.getCredentialSummary(businessId).hasLhdnCredentials).toBe(true);
  });

  it('tests credentials and logs provider-level success events', async () => {
    const { app, store } = buildServer();
    const profileResponse = await createBusinessProfile(app, { businessName: 'Validation Bistro' });
    const businessId = profileResponse.body.activeBusiness.id;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ access_token: 'sandbox-token', expires_in: 3600 })));

    await request(app)
      .post('/api/credentials/lhdn/test')
      .send({
        lhdnClientId: 'client-abc',
        lhdnClientSecret: 'secret-def',
      })
      .expect(200);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ messages: [{ id: 'wamid.test' }] })));

    await request(app)
      .post('/api/credentials/whatsapp/test')
      .send({
        whatsappAccessToken: 'token-xyz',
        whatsappPhoneNumberId: '12345',
        whatsappVerifyToken: 'verify-me',
        whatsappTestRecipient: '60112223333',
      })
      .expect(200);

    const state = store.read();
    const business = state.businesses.find((candidate) => candidate.id === businessId);
    expect(business.events.filter((event) => event.event === 'CREDENTIAL_TEST_SUCCESS')).toHaveLength(2);
  });

  it('records a session ping once per 30 minutes and exposes retention data', async () => {
    const { app, runtimePath } = buildServer();
    const profileResponse = await createBusinessProfile(app, { businessName: 'Return Visit Cafe' });
    const businessId = profileResponse.body.activeBusiness.id;

    const firstPing = await request(app).post('/api/sessions/ping').send({}).expect(200);
    expect(firstPing.body.recorded).toBe(true);

    let state = createFileStore(runtimePath).read();
    let business = state.businesses.find((candidate) => candidate.id === businessId);
    expect(business.events.filter((event) => event.event === 'session_started')).toHaveLength(1);

    await request(app).post('/api/sessions/ping').send({}).expect(200);

    state = createFileStore(runtimePath).read();
    business = state.businesses.find((candidate) => candidate.id === businessId);
    expect(business.events.filter((event) => event.event === 'session_started')).toHaveLength(1);

    business.activationAt = '2026-03-20T08:00:00.000Z';
    business.onboardingState = 'ACTIVATED';
    business.events[0].timestamp = '2026-03-21T09:00:00.000Z';
    business.events.push({
      id: 'evt-return-late',
      event: 'session_started',
      timestamp: '2026-03-27T07:30:00.000Z',
      properties: {
        daysSinceSignup: 7,
        isReturn: true,
        sessionCount: 2,
        onboardingState: 'ACTIVATED',
        activationAt: '2026-03-20T08:00:00.000Z',
      },
    });
    createFileStore(runtimePath).write(state);

    const report = await request(app).get('/api/intelligence/report').expect(200);
    expect(report.body.retention).toBeTruthy();
    expect(report.body.retention.sampleSize).toBeGreaterThan(0);
    expect(report.body.retention.d7).toBeGreaterThan(0);
  });

  it('routes incoming WhatsApp webhook messages to the business that owns the phone number id', async () => {
    const { app, runtimePath } = buildServer();
    const profileResponse = await createBusinessProfile(app, { businessName: 'Webhook Warung' });
    const businessId = profileResponse.body.activeBusiness.id;

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: 'sandbox-token', expires_in: 3600 }))
        .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'wamid.saved' }] })),
    );

    await request(app)
      .post('/api/credentials/save')
      .send({
        lhdnClientId: 'client-123',
        lhdnClientSecret: 'secret-456',
        whatsappAccessToken: 'token-789',
        whatsappPhoneNumberId: '123',
        whatsappVerifyToken: 'verify-me',
        whatsappTestRecipient: '60118889999',
      })
      .expect(201);

    const verifyResponse = await request(app)
      .get('/api/whatsapp/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify-me',
        'hub.challenge': 'challenge-123',
      })
      .expect(200);

    expect(verifyResponse.text).toBe('challenge-123');

    const webhookResponse = await request(app)
      .post('/api/whatsapp/webhook')
      .send({
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: '123' },
                  messages: [
                    {
                      from: '60119998877',
                      timestamp: '1710000000',
                      text: { body: 'Menu please' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      })
      .expect(200);

    expect(webhookResponse.body.received).toBe(true);

    const state = createFileStore(runtimePath).read();
    const business = state.businesses.find((candidate) => candidate.id === businessId);
    expect(business.events.some((event) => event.event === 'WHATSAPP_MESSAGE_RECEIVED')).toBe(true);
  });

  it('dispatches a WhatsApp auto-reply when an inbound message matches a saved template', async () => {
    const { app, runtimePath } = buildServer();
    const profileResponse = await createBusinessProfile(app, {
      businessName: 'Auto Reply Warung',
      phone: '60114445555',
    });
    const businessId = profileResponse.body.activeBusiness.id;

    await request(app).post('/api/templates/generate').send({}).expect(200);

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: 'sandbox-token', expires_in: 3600 }))
        .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'wamid.saved' }] })),
    );

    await request(app)
      .post('/api/credentials/save')
      .send({
        lhdnClientId: 'client-auto-reply',
        lhdnClientSecret: 'secret-auto-reply',
        whatsappAccessToken: 'token-auto-reply',
        whatsappPhoneNumberId: 'wa-auto-123',
        whatsappVerifyToken: 'verify-auto-123',
        whatsappTestRecipient: '60114445555',
      })
      .expect(201);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ messages: [{ id: 'wamid.reply' }] })));

    await request(app)
      .post('/api/whatsapp/webhook')
      .send({
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'wa-auto-123' },
                  messages: [
                    {
                      from: '60119990000',
                      timestamp: '1710000000',
                      text: { body: 'menu please' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      })
      .expect(200);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const state = createFileStore(runtimePath).read();
    const business = state.businesses.find((candidate) => candidate.id === businessId);
    expect(business.events.some((event) => event.event === 'WHATSAPP_AUTO_REPLY_SENT')).toBe(true);
  });

  it('returns LHDN diagnosis details when submission is rejected', async () => {
    const { app, runtimePath } = buildServer();
    await createBusinessProfile(app, { businessName: 'Diagnosis Diner' });
    await request(app).post('/api/templates/generate').send({}).expect(200);

    const importResponse = await request(app)
      .post('/api/import/confirm')
      .send({
        source: 'manual',
        items: [{ name: 'Nasi Lemak', price: 8, category: 'Main' }],
      })
      .expect(200);

    const itemId = importResponse.body.activeBusiness.menuItems[0].id;

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: 'sandbox-token', expires_in: 3600 }))
        .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'wamid.saved' }] })),
    );

    await request(app)
      .post('/api/credentials/save')
      .send({
        lhdnClientId: 'client-diagnosis',
        lhdnClientSecret: 'secret-diagnosis',
        whatsappAccessToken: 'token-diagnosis',
        whatsappPhoneNumberId: 'wa-diagnosis-123',
        whatsappVerifyToken: 'verify-diagnosis-123',
        whatsappTestRecipient: '60118887777',
      })
      .expect(201);

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: 'sandbox-token-2', expires_in: 3600 }))
        .mockResolvedValueOnce(
          jsonResponse(
            {
              rejectedDocuments: [
                {
                  error: [
                    {
                      code: 'CF001',
                      message: 'Taxpayer TIN is invalid.',
                    },
                  ],
                },
              ],
            },
            400,
          ),
        ),
    );

    const response = await request(app)
      .post('/api/invoices/create')
      .send({
        customerName: 'Diagnosis Customer',
        customerPhone: '60112223333',
        lineItems: [{ itemId, quantity: 1 }],
        source: 'dashboard',
        invoiceType: 'real',
        submitToLhdn: true,
        sendWhatsappConfirmation: false,
      })
      .expect(400);

    expect(response.body.diagnosis).toHaveLength(1);
    expect(response.body.diagnosis[0].code).toBe('CF001');
    expect(response.body.diagnosis[0].fix).toContain('TIN');
    expect(response.body.activeBusiness.invoices.at(-1).lhdn.status).toBe('failed');
    expect(response.body.activeBusiness.invoices.at(-1).lhdn.diagnosis).toHaveLength(1);

    const reloadedState = createFileStore(runtimePath).read();
    expect(reloadedState.businesses[0].invoices.at(-1).lhdn.diagnosis[0].code).toBe('CF001');
  });

  it('persists applied optimizations and learned lifecycle updates after intelligence reporting', async () => {
    const { app, runtimePath } = buildServer();

    await createBusinessProfile(app, { businessName: 'Learning Warung' });
    await request(app)
      .post('/api/intelligence/optimizations/ttv_whatsapp_skip/apply')
      .send({
        baseConfidence: 0.7,
      })
      .expect(200);

    await createBusinessProfile(app, { businessName: 'Later One' });
    await createBusinessProfile(app, { businessName: 'Later Two' });
    await createBusinessProfile(app, { businessName: 'Later Three' });

    const reportResponse = await request(app).get('/api/intelligence/report').expect(200);
    expect(reportResponse.body.executionPayload.codexTasks.length).toBeGreaterThan(0);

    const reloadedState = createFileStore(runtimePath).read();
    const optimization = reloadedState.appliedOptimizations.find((candidate) => candidate.id === 'ttv_whatsapp_skip');
    expect(optimization).toBeTruthy();
    expect(optimization.lastEvaluatedAt).toBeTruthy();
    expect(['applied', 'validated', 'reinforced', 'deprecated']).toContain(optimization.state);
    expect(optimization.impact).toBeTruthy();
  });

  it('records intervention lifecycle and honors cooldowns', async () => {
    const { app, runtimePath } = buildServer();

    await createBusinessProfile(app, { businessName: 'Dormant Bistro', phone: '60110000001' });

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: 'sandbox-token', expires_in: 3600 }))
        .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'wamid.saved' }] }))
        .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'wamid.nudge' }] })),
    );

    await request(app)
      .post('/api/credentials/save')
      .send({
        lhdnClientId: 'client-123',
        lhdnClientSecret: 'secret-456',
        whatsappAccessToken: 'token-789',
        whatsappPhoneNumberId: '555',
        whatsappVerifyToken: 'verify-555',
        whatsappTestRecipient: '60110000001',
      })
      .expect(201);

    const staleState = createFileStore(runtimePath).read();
    staleState.businesses[0].createdAt = '2026-03-20T08:00:00.000Z';
    staleState.businesses[0].updatedAt = '2026-03-20T08:00:00.000Z';
    staleState.businesses[0].events = [
      {
        id: 'evt-old',
        event: 'signup_completed',
        timestamp: '2026-03-20T08:00:00.000Z',
        properties: {},
      },
    ];
    createFileStore(runtimePath).write(staleState);

    const firstRun = await request(app).post('/api/intelligence/interventions/run').send({}).expect(200);
    expect(firstRun.body.results.some((result) => result.status === 'success')).toBe(true);

    const secondRun = await request(app).post('/api/intelligence/interventions/run').send({}).expect(200);
    expect(secondRun.body.processed).toBe(0);
    expect(secondRun.body.results).toHaveLength(0);

    const reloadedState = createFileStore(runtimePath).read();
    expect(reloadedState.interventions).toHaveLength(1);
    expect(reloadedState.interventions[0].triggerCount).toBe(1);
    expect(reloadedState.interventions[0].cooldownUntil).toBeTruthy();
  });
});
