const DEFAULT_GRAPH_VERSION = 'v17.0';

export function getWhatsAppConfig({ business, credentials = {}, overrides = {} } = {}) {
  return {
    graphVersion: overrides.graphVersion || process.env.WHATSAPP_GRAPH_VERSION || DEFAULT_GRAPH_VERSION,
    accessToken: overrides.accessToken || credentials.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: overrides.phoneNumberId || credentials.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: overrides.verifyToken || credentials.whatsappVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '',
    testRecipient: overrides.testRecipient || business?.whatsapp?.testRecipient || business?.whatsapp?.phoneNumber || process.env.WHATSAPP_TEST_RECIPIENT || '',
  };
}

export async function sendWhatsAppTextMessage({
  business,
  credentials,
  to,
  body,
  fetchImpl = fetch,
  config = getWhatsAppConfig({ business, credentials }),
}) {
  assertWhatsAppConfig(config);

  const response = await fetchImpl(
    `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: {
          preview_url: false,
          body,
        },
      }),
    },
  );

  const responseText = await response.text();
  const responseBody = parseMaybeJson(responseText);

  if (!response.ok) {
    throw createWhatsAppError('WhatsApp send failed.', response.status, responseBody || responseText);
  }

  return {
    status: response.status,
    rawResponse: responseBody || responseText,
    messageId: responseBody?.messages?.[0]?.id || null,
  };
}

export function verifyWebhookChallenge(query, expectedToken) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (mode === 'subscribe' && token && expectedToken && token === expectedToken) {
    return challenge;
  }

  return null;
}

export function extractIncomingWhatsAppEvents(payload) {
  const events = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};

      for (const message of value.messages ?? []) {
        events.push({
          type: 'message',
          from: message.from,
          timestamp: message.timestamp,
          text: message.text?.body || '',
          raw: message,
          contacts: value.contacts ?? [],
          metadata: value.metadata ?? {},
        });
      }

      for (const status of value.statuses ?? []) {
        events.push({
          type: 'status',
          recipient: status.recipient_id,
          status: status.status,
          timestamp: status.timestamp,
          raw: status,
          metadata: value.metadata ?? {},
        });
      }
    }
  }

  return events;
}

export function buildTemplateMessage(business, templateId, replacements = {}) {
  const template = business?.templates?.whatsapp?.find((candidate) => candidate.id === templateId);
  if (!template) {
    throw new Error(`WhatsApp template ${templateId} was not found.`);
  }

  let message = template.response;
  for (const [key, value] of Object.entries(replacements)) {
    message = message.replaceAll(`{${key}}`, String(value));
  }
  return message;
}

function assertWhatsAppConfig(config) {
  if (!config.accessToken || !config.phoneNumberId) {
    throw new Error('Missing WhatsApp Cloud API credentials for this business. Validate and save them first.');
  }
}

function parseMaybeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function createWhatsAppError(message, status, payload) {
  const error = new Error(message);
  error.status = status;
  error.payload = payload;
  return error;
}
