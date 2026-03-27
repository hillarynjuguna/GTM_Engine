import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { createFileStore } from '../server/store.js';
import { createInitialState } from '../server/domain.js';

const runtimePath = path.join(process.cwd(), 'server', 'runtime', 'simulation-state.db');
const validationDir = path.join(process.cwd(), 'validation');

fs.mkdirSync(validationDir, { recursive: true });

const store = createFileStore(runtimePath);
store.reset(createInitialState());
const app = createApp(store);

async function run() {
  const journey = [];

  const pushStep = (name, response) => {
    journey.push({
      step: name,
      status: response.status,
      timestamp: new Date().toISOString(),
      body: response.body,
    });
  };

  pushStep(
    'business_profile',
    await request(app).post('/api/onboarding/profile').send({
      businessName: 'Warung Pagi Bahagia',
      businessType: 'Restoran / Kafe',
      ownerName: 'Nurul',
      phone: '60199887766',
      email: 'nurul@example.com',
      orderChannels: ['WhatsApp', 'Walk-in'],
      leadSource: 'Meta Ads',
    }),
  );

  pushStep('template_generation', await request(app).post('/api/templates/generate').send({}));

  pushStep(
    'csv_preview',
    await request(app)
      .post('/api/import/csv/preview')
      .send({
        csvText: 'Item,Price,Category\nNasi Lemak,8,Main\nTeh Tarik,3,Drinks\nKuih,4.5,Dessert',
      }),
  );

  const importStep = await request(app)
    .post('/api/import/confirm')
    .send({
      source: 'csv',
      items: journey.at(-1).body.items,
    });
  pushStep('import_confirm', importStep);

  pushStep(
    'whatsapp_connect',
    await request(app).post('/api/whatsapp/connect').send({
      phoneNumber: '60199887766',
      testRecipient: '60199887766',
      skip: true,
    }),
  );

  const itemIds = importStep.body.activeBusiness.menuItems.slice(0, 2).map((item) => item.id);
  pushStep(
    'first_invoice',
    await request(app)
      .post('/api/invoices/create')
      .send({
        customerName: 'First Customer',
        customerPhone: '60125554444',
        lineItems: [
          { itemId: itemIds[0], quantity: 2 },
          { itemId: itemIds[1], quantity: 1 },
        ],
        source: 'dashboard',
        invoiceType: 'real',
        submitToLhdn: false,
        sendWhatsappConfirmation: false,
      }),
  );

  const summaryResponse = await request(app).get('/api/dashboard/summary');
  pushStep('dashboard_summary', summaryResponse);

  const summary = summaryResponse.body;
  const validation = {
    executedAt: new Date().toISOString(),
    success: summary.headline.activated === 1 && summary.headline.invoicesIssued === 1,
    results: {
      onboardingCompletedWithoutErrors: journey.every((step) => step.status < 400),
      firstInvoiceSent: summary.headline.invoicesIssued === 1,
      activationTriggered: summary.headline.activated === 1,
      activationRate: summary.headline.activationRate,
      timeToActivationMinutes: summary.headline.timeToActivationMinutes,
    },
    knownLimitations: [
      'Reality integrations require sandbox credentials and a public webhook URL.',
      'The validation script keeps LHDN and WhatsApp calls disabled so regression checks can run offline.',
      'SQLite is intentionally minimal and not yet multi-tenant hardened.',
    ],
  };

  fs.writeFileSync(path.join(validationDir, 'execution-log.json'), JSON.stringify(journey, null, 2));
  fs.writeFileSync(path.join(validationDir, 'validation-results.json'), JSON.stringify(validation, null, 2));

  console.log(JSON.stringify(validation, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
