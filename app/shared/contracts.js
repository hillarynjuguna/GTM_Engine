export const ONBOARDING_STATES = {
  NOT_STARTED: 'NOT_STARTED',
  BUSINESS_PROFILE_COMPLETED: 'BUSINESS_PROFILE_COMPLETED',
  TEMPLATES_READY: 'TEMPLATES_READY',
  MENU_READY: 'MENU_READY',
  WHATSAPP_CONNECTED: 'WHATSAPP_CONNECTED',
  WHATSAPP_SKIPPED: 'WHATSAPP_SKIPPED',
  FIRST_INVOICE_SENT: 'FIRST_INVOICE_SENT',
  ACTIVATED: 'ACTIVATED',
};

export const ONBOARDING_STEPS = [
  {
    id: 'business_profile',
    label: 'Business profile',
    description: 'Capture enough business context to pre-configure the workspace.',
    terminalState: ONBOARDING_STATES.BUSINESS_PROFILE_COMPLETED,
  },
  {
    id: 'template_generation',
    label: 'Template generation',
    description: 'Generate invoice and WhatsApp defaults automatically.',
    terminalState: ONBOARDING_STATES.TEMPLATES_READY,
  },
  {
    id: 'data_import',
    label: 'Menu import',
    description: 'Import or manually add sellable items for invoicing.',
    terminalState: ONBOARDING_STATES.MENU_READY,
  },
  {
    id: 'whatsapp_connection',
    label: 'WhatsApp connection',
    description: 'Connect or deliberately skip the messaging channel.',
    terminalState: ONBOARDING_STATES.WHATSAPP_CONNECTED,
  },
  {
    id: 'first_invoice',
    label: 'First invoice',
    description: 'Create and send the first invoice to trigger activation.',
    terminalState: ONBOARDING_STATES.FIRST_INVOICE_SENT,
  },
];

export const ACTIVATION_DEFINITION = {
  code: 'activation_qualified',
  description:
    'A business activates when it sends its first successful invoice or executes its first successful workflow.',
  qualifiesOn: ['invoice_sent', 'workflow_executed'],
  successWindowHours: 24,
};

export const ORDER_CHANNELS = ['WhatsApp', 'Walk-in', 'Grab/Foodpanda', 'Phone call'];

export const BUSINESS_TYPES = ['Restoran / Kafe', 'Bakeri / Kek', 'Catering', 'Food Stall / Gerai', 'Lain-lain'];

export const MENU_FIELDS = ['name', 'price', 'category'];

export const DEFAULT_ACQUISITION_HOOKS = [
  {
    id: 'seed-meta',
    channel: 'Meta Ads',
    spend: 900,
    leads: 22,
    customers: 5,
    createdAt: '2026-03-24T09:00:00.000Z',
  },
];

export const DEFAULT_WHATSAPP_TEMPLATES = [
  {
    id: 'menu-request',
    name: 'Menu request',
    trigger: 'contains_any(menu, apa ada, harga)',
    response:
      "Ini menu kami. Balas dengan nama item dan kuantiti, contohnya 'Nasi Lemak 2, Teh Tarik 1'.",
  },
  {
    id: 'order-confirmation',
    name: 'Order confirmation',
    trigger: 'order_detected',
    response: 'Terima kasih. Kami sedang siapkan order anda dan invois akan dihantar sebentar lagi.',
  },
  {
    id: 'hours',
    name: 'Business hours',
    trigger: 'contains_any(open, buka, hours)',
    response: 'Kami buka setiap hari 9 pagi hingga 9 malam. Nak tengok menu? Balas MENU.',
  },
];
