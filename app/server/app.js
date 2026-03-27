import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import {
  ACTIVATION_DEFINITION,
  BUSINESS_TYPES,
  MENU_FIELDS,
  ONBOARDING_STATES,
  ONBOARDING_STEPS,
  ORDER_CHANNELS,
} from '../shared/contracts.js';
import {
  addAcquisitionHook,
  appendEvent,
  appendLog,
  applyOptimization,
  buildDashboardSummary,
  canTriggerIntervention,
  connectWhatsapp,
  createBusiness,
  createInvoice,
  ensureBusiness,
  executeWorkflow,
  generateTemplates,
  getActiveBusiness,
  markStepComplete,
  previewCsvImport,
  recordSession,
  recordInterventionAttempt,
  saveMenuItems,
  serializeBusiness,
  updateOptimizationLearning,
  upsertBusiness,
} from './domain.js';
import { parseLhdnError, submitInvoiceToLhdn, testLhdnCredentials } from './integrations/lhdn.js';
import {
  buildTemplateMessage,
  extractIncomingWhatsAppEvents,
  matchTemplate,
  sendWhatsAppTextMessage,
  verifyWebhookChallenge,
} from './integrations/whatsapp.js';
import { deriveOptimizationLearningUpdates, detectFriction, generateIntelligenceReport } from './intelligence.js';

const profileSchema = z.object({
  businessName: z.string().min(2),
  businessType: z.enum(BUSINESS_TYPES),
  ownerName: z.string().min(2),
  phone: z.string().min(5),
  email: z.string().email(),
  orderChannels: z.array(z.enum(ORDER_CHANNELS)).min(1),
  leadSource: z.string().min(2),
  registrationNumber: z.string().optional().default(''),
  tinNumber: z.string().optional().default(''),
  sstNumber: z.string().optional().default(''),
  addressLine1: z.string().optional().default(''),
  addressLine2: z.string().optional().default(''),
  addressLine3: z.string().optional().default(''),
  city: z.string().optional().default(''),
  postcode: z.string().optional().default(''),
  stateCode: z.string().optional().default(''),
  countryCode: z.string().optional().default('MYS'),
  msicCode: z.string().optional().default(''),
});

const businessSelectionSchema = z.object({
  businessId: z.string().nullable().optional().default(null),
});

const csvPreviewSchema = z.object({
  csvText: z.string().min(1),
  mapping: z.record(z.string()).optional(),
});

const menuItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  price: z.number().positive(),
  category: z.string().min(1),
});

const menuConfirmSchema = z.object({
  items: z.array(menuItemSchema).min(1),
  source: z.enum(['csv', 'manual']),
});

const whatsappConnectionSchema = z.object({
  phoneNumber: z.string().optional().default(''),
  testRecipient: z.string().optional().default(''),
  skip: z.boolean().optional().default(false),
});

const credentialSchema = z.object({
  lhdnClientId: z.string().min(1),
  lhdnClientSecret: z.string().min(1),
  whatsappAccessToken: z.string().min(1),
  whatsappPhoneNumberId: z.string().min(1),
  whatsappVerifyToken: z.string().min(1),
  whatsappTestRecipient: z.string().min(5),
});

const lhdnCredentialTestSchema = credentialSchema.pick({
  lhdnClientId: true,
  lhdnClientSecret: true,
});

const whatsappCredentialTestSchema = credentialSchema.pick({
  whatsappAccessToken: true,
  whatsappPhoneNumberId: true,
  whatsappVerifyToken: true,
  whatsappTestRecipient: true,
});

const invoiceSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().optional().default(''),
  lineItems: z.array(z.object({ itemId: z.string().min(1), quantity: z.number().int().positive() })).min(1),
  source: z.string().optional().default('dashboard'),
  invoiceType: z.enum(['real', 'simulated']).optional().default('real'),
  submitToLhdn: z.boolean().optional().default(true),
  sendWhatsappConfirmation: z.boolean().optional().default(false),
});

const workflowSchema = z.object({
  name: z.string().optional().default('sample_workflow'),
  channel: z.string().optional().default('whatsapp'),
});

const acquisitionSchema = z.object({
  channel: z.string().min(2),
  spend: z.number().nonnegative(),
  leads: z.number().int().nonnegative(),
  customers: z.number().int().nonnegative(),
});

const sendWhatsAppSchema = z.object({
  to: z.string().optional().default(''),
  templateId: z.enum(['order-confirmation', 'menu-request', 'hours']).default('order-confirmation'),
  body: z.string().optional().default(''),
});

export function createApp(rawStore) {
  let cachedIntelligenceReport = null;

  const store = {
    ...rawStore,
    write: (state) => {
      cachedIntelligenceReport = null;
      return rawStore.write(state);
    },
    update: (updater) => {
      cachedIntelligenceReport = null;
      return rawStore.update(updater);
    },
    reset: (state) => {
      cachedIntelligenceReport = null;
      return rawStore.reset(state);
    },
    saveCredentials: (businessId, credentials) => {
      cachedIntelligenceReport = null;
      return rawStore.saveCredentials(businessId, credentials);
    }
  };

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, activationDefinition: ACTIVATION_DEFINITION });
  });

  app.post('/api/sessions/ping', (_request, response, next) => {
    try {
      const state = store.update((draft) => {
        const business = getActiveBusiness(draft);
        if (!business) {
          return draft;
        }

        const sessionEvent = recordSession(business);
        if (sessionEvent) {
          appendLog(draft, 'session_recorded', {
            businessId: business.id,
            sessionCount: sessionEvent.properties.sessionCount,
            isReturn: sessionEvent.properties.isReturn,
            daysSinceSignup: sessionEvent.properties.daysSinceSignup,
          });
        }

        return draft;
      });

      response.json({
        recorded: true,
        activeBusiness: state.activeBusinessId ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/state', (_request, response) => {
    response.json(buildStateResponse(store));
  });

  app.post('/api/businesses/select', (request, response, next) => {
    try {
      const payload = businessSelectionSchema.parse(request.body);
      const state = store.update((draft) => {
        if (!payload.businessId) {
          draft.activeBusinessId = null;
          appendLog(draft, 'active_business_cleared', {});
          return draft;
        }

        const business = draft.businesses.find((candidate) => candidate.id === payload.businessId);
        if (!business) {
          const error = new Error('Selected business was not found.');
          error.status = 404;
          throw error;
        }

        draft.activeBusinessId = business.id;
        appendLog(draft, 'active_business_selected', {
          businessId: business.id,
          businessName: business.profile.businessName,
        });
        return draft;
      });

      response.json(buildStateResponse(store, state));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/onboarding/profile', (request, response, next) => {
    try {
      const payload = profileSchema.parse(request.body);
      const state = store.update((draft) => {
        let business = getActiveBusiness(draft);

        if (!business || business.activationAt) {
          business = createBusiness(payload);
          appendEvent(business, 'signup_completed', { source: payload.leadSource });
          appendEvent(business, 'onboarding_started', {});
        } else {
          business.profile = payload;
        }

        business.profile = payload;
        markStepComplete(business, 'business_profile', ONBOARDING_STATES.BUSINESS_PROFILE_COMPLETED);
        appendEvent(business, 'onboarding_step_completed', {
          step_name: 'business_profile',
        });

        if (!business.whatsapp?.phoneNumber) {
          business.whatsapp.phoneNumber = payload.phone;
        }
        if (!business.whatsapp?.testRecipient) {
          business.whatsapp.testRecipient = payload.phone;
        }

        upsertBusiness(draft, business);
        appendLog(draft, 'business_profile_saved', {
          businessId: business.id,
          businessName: payload.businessName,
        });

        return draft;
      });

      response.status(201).json(buildStateResponse(store, state));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/credentials/lhdn/test', async (request, response, next) => {
    try {
      const payload = lhdnCredentialTestSchema.parse(request.body);
      const state = store.read();
      const business = ensureBusiness(state);
      const result = await testLhdnCredentials({
        credentials: payload,
      });

      appendEvent(business, 'CREDENTIAL_TEST_SUCCESS', {
        provider: 'lhdn',
        apiBaseUrl: result.apiBaseUrl,
      });
      appendLog(state, 'credential_test_success', {
        businessId: business.id,
        provider: 'lhdn',
        tokenPreview: result.tokenPreview,
      });
      store.write(state);

      response.json({
        success: true,
        message: 'LHDN sandbox credentials validated successfully.',
        details: `Authenticated against ${result.identityBaseUrl}.`,
      });
    } catch (error) {
      recordCredentialFailure(store, 'lhdn', error);
      next(error);
    }
  });

  app.post('/api/credentials/whatsapp/test', async (request, response, next) => {
    try {
      const payload = whatsappCredentialTestSchema.parse(request.body);
      const state = store.read();
      const business = ensureBusiness(state);
      const messageResult = await sendWhatsAppTextMessage({
        business,
        credentials: payload,
        to: payload.whatsappTestRecipient,
        body: buildCredentialTestMessage(business.profile.businessName),
      });

      appendEvent(business, 'CREDENTIAL_TEST_SUCCESS', {
        provider: 'whatsapp',
        messageId: messageResult.messageId,
        to: payload.whatsappTestRecipient,
      });
      appendLog(state, 'credential_test_success', {
        businessId: business.id,
        provider: 'whatsapp',
        messageId: messageResult.messageId,
        to: payload.whatsappTestRecipient,
      });
      store.write(state);

      response.json({
        success: true,
        message: 'WhatsApp Cloud API credentials validated successfully.',
        details: messageResult.messageId
          ? `Test message accepted with id ${messageResult.messageId}.`
          : 'Test message accepted by Meta Cloud API.',
      });
    } catch (error) {
      recordCredentialFailure(store, 'whatsapp', error);
      next(error);
    }
  });

  app.post('/api/credentials/save', async (request, response, next) => {
    try {
      const payload = credentialSchema.parse(request.body);
      const state = store.read();
      const business = ensureBusiness(state);

      await testLhdnCredentials({
        credentials: payload,
      });

      await sendWhatsAppTextMessage({
        business,
        credentials: payload,
        to: payload.whatsappTestRecipient,
        body: buildCredentialTestMessage(business.profile.businessName),
      });

      store.saveCredentials(business.id, payload);
      business.whatsapp = {
        ...business.whatsapp,
        phoneNumber: business.whatsapp?.phoneNumber || business.profile.phone,
        testRecipient: payload.whatsappTestRecipient,
      };

      appendEvent(business, 'CREDENTIAL_SAVED', {
        providers: ['lhdn', 'whatsapp'],
      });
      appendLog(state, 'credentials_saved', {
        businessId: business.id,
        businessName: business.profile.businessName,
      });
      store.write(state);

      response.status(201).json(buildStateResponse(store));
    } catch (error) {
      recordCredentialFailure(store, 'credential_save', error);
      next(error);
    }
  });

  app.post('/api/templates/generate', (_request, response, next) => {
    try {
      const state = store.update((draft) => {
        const business = ensureBusiness(draft);
        business.templates = generateTemplates(business.profile);
        markStepComplete(business, 'template_generation', ONBOARDING_STATES.TEMPLATES_READY);
        appendEvent(business, 'onboarding_step_completed', {
          step_name: 'template_generation',
        });
        appendLog(draft, 'templates_generated', {
          businessId: business.id,
        });
        return draft;
      });

      response.json(buildStateResponse(store, state));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/import/csv/preview', (request, response, next) => {
    try {
      const payload = csvPreviewSchema.parse(request.body);
      response.json(previewCsvImport(payload.csvText, payload.mapping));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/import/confirm', (request, response, next) => {
    try {
      const payload = menuConfirmSchema.parse(request.body);
      const state = store.update((draft) => {
        const business = ensureBusiness(draft);
        saveMenuItems(business, payload.items, payload.source);
        appendLog(draft, 'menu_import_confirmed', {
          businessId: business.id,
          itemCount: payload.items.length,
          source: payload.source,
        });
        return draft;
      });

      response.json(buildStateResponse(store, state));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/whatsapp/connect', (request, response, next) => {
    try {
      const payload = whatsappConnectionSchema.parse(request.body);
      const state = store.update((draft) => {
        const business = ensureBusiness(draft);
        const credentialSummary = store.getCredentialSummary(business.id);

        if (!payload.skip && !credentialSummary.hasWhatsAppCredentials) {
          const error = new Error('Validate and save WhatsApp credentials before connecting the channel.');
          error.status = 400;
          throw error;
        }

        connectWhatsapp(business, payload);
        appendLog(draft, payload.skip ? 'whatsapp_skipped' : 'whatsapp_connected', {
          businessId: business.id,
          phoneNumber: payload.phoneNumber,
          testRecipient: payload.testRecipient,
        });
        return draft;
      });

      response.json(buildStateResponse(store, state));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/invoices/create', async (request, response, next) => {
    try {
      const payload = invoiceSchema.parse(request.body);
      const state = store.read();
      const business = ensureBusiness(state);
      const credentials = store.getCredentials(business.id);
      const invoice = createInvoice(business, payload);
      appendLog(state, 'invoice_sent', {
        businessId: business.id,
        invoiceNumber: invoice.invoiceNumber,
      });

      try {
        if (payload.submitToLhdn) {
          const lhdnResult = await submitInvoiceToLhdn({ invoice, business, credentials });
          invoice.lhdn = {
            status: 'submitted',
            uuid: lhdnResult.uuid,
            submissionUid: lhdnResult.submissionUid,
            submittedAt: new Date().toISOString(),
            response: lhdnResult.rawResponse,
          };
          appendEvent(business, 'LHDN_SUBMISSION_SUCCESS', {
            responseStatus: lhdnResult.responseStatus,
            uuid: lhdnResult.uuid,
            submissionUid: lhdnResult.submissionUid,
            payload: lhdnResult.rawResponse,
          });
          appendLog(state, 'lhdn_submission_success', {
            businessId: business.id,
            invoiceNumber: invoice.invoiceNumber,
            uuid: lhdnResult.uuid,
          });
        }

        if (payload.sendWhatsappConfirmation) {
          const recipient = business.whatsapp?.testRecipient || payload.customerPhone || business.whatsapp?.phoneNumber;
          const body =
            buildTemplateMessage(business, 'order-confirmation', {
              total: invoice.totals.grandTotal.toFixed(2),
              invoice_number: invoice.invoiceNumber,
            }) + `\n\nInvoice ${invoice.invoiceNumber} total RM${invoice.totals.grandTotal.toFixed(2)}`;
          const messageResult = await sendWhatsAppTextMessage({
            business,
            credentials,
            to: recipient,
            body,
          });
          appendEvent(business, 'WHATSAPP_MESSAGE_SENT', {
            to: recipient,
            messageId: messageResult.messageId,
            payload: messageResult.rawResponse,
          });
          appendLog(state, 'whatsapp_message_sent', {
            businessId: business.id,
            invoiceNumber: invoice.invoiceNumber,
            messageId: messageResult.messageId,
          });
        }
      } catch (integrationError) {
        if (integrationError.message.includes('LHDN')) {
          const diagnosis = parseLhdnError(integrationError.payload);
          invoice.lhdn = {
            status: 'failed',
            uuid: null,
            submissionUid: null,
            submittedAt: new Date().toISOString(),
            response: integrationError.payload || integrationError.message,
            diagnosis,
          };
          appendEvent(business, 'LHDN_SUBMISSION_FAILED', {
            payload: integrationError.payload || integrationError.message,
            diagnosis,
          });
          appendLog(state, 'lhdn_submission_failed', {
            businessId: business.id,
            invoiceNumber: invoice.invoiceNumber,
            error: integrationError.message,
          });
        }

        if (integrationError.message.includes('WhatsApp')) {
          appendEvent(business, 'WHATSAPP_MESSAGE_SENT', {
            error: integrationError.payload || integrationError.message,
          });
          appendLog(state, 'whatsapp_message_failed', {
            businessId: business.id,
            invoiceNumber: invoice.invoiceNumber,
            error: integrationError.message,
          });
        }

        store.write(state);
        response.status(integrationError.status || 502).json({
          message: integrationError.message,
          details: formatErrorDetails(integrationError),
          integrationPayload: integrationError.payload || null,
          diagnosis: integrationError.message.includes('LHDN') ? parseLhdnError(integrationError.payload) : null,
          ...buildStateResponse(store, state),
        });
        return;
      }

      store.write(state);

      response.status(201).json(buildStateResponse(store, state));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/whatsapp/send-test', async (request, response, next) => {
    try {
      const payload = sendWhatsAppSchema.parse(request.body);
      const state = store.read();
      const business = ensureBusiness(state);
      const credentials = store.getCredentials(business.id);
      const to = payload.to || business.whatsapp?.testRecipient || business.whatsapp?.phoneNumber;

      if (!to) {
        const error = new Error('No WhatsApp recipient is configured for this business.');
        error.status = 400;
        throw error;
      }

      const body =
        payload.body ||
        buildTemplateMessage(business, payload.templateId, {
          business_name: business.profile.businessName,
        });

      const messageResult = await sendWhatsAppTextMessage({
        business,
        credentials,
        to,
        body,
      });

      appendEvent(business, 'WHATSAPP_MESSAGE_SENT', {
        to,
        templateId: payload.templateId,
        messageId: messageResult.messageId,
        payload: messageResult.rawResponse,
      });
      appendLog(state, 'whatsapp_message_sent', {
        businessId: business.id,
        templateId: payload.templateId,
        to,
        messageId: messageResult.messageId,
      });
      store.write(state);

      response.status(201).json({
        messageId: messageResult.messageId,
        rawResponse: messageResult.rawResponse,
        ...buildStateResponse(store, state),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/whatsapp/webhook', (request, response) => {
    const token = String(request.query['hub.verify_token'] || '');
    const businessId = store.findBusinessIdByWhatsAppVerifyToken(token);
    const challenge = businessId ? verifyWebhookChallenge(request.query, token) : null;

    if (!challenge) {
      response.status(403).send('Verification failed');
      return;
    }

    response.status(200).send(challenge);
  });

  app.post('/api/whatsapp/webhook', (request, response, next) => {
    try {
      const state = store.read();
      const events = extractIncomingWhatsAppEvents(request.body);

      appendLog(state, 'whatsapp_webhook_received', {
        events: events.length,
      });

      for (const event of events) {
        const phoneNumberId = event.metadata?.phone_number_id || '';
        const businessId = store.findBusinessIdByWhatsAppPhoneNumberId(phoneNumberId);
        const business = state.businesses.find((candidate) => candidate.id === businessId);

        if (!business) {
          appendLog(state, 'whatsapp_webhook_unmatched', {
            phoneNumberId,
            type: event.type,
          });
          continue;
        }

        if (event.type === 'message') {
          appendEvent(business, 'WHATSAPP_MESSAGE_RECEIVED', {
            from: event.from,
            text: event.text,
            timestamp: event.timestamp,
            payload: event.raw,
          });

          const templates = business.templates?.whatsapp ?? [];
          const credentials = store.getCredentials(business.id);
          const matchedTemplate = matchTemplate(templates, event.text);

          if (matchedTemplate && credentials?.whatsappAccessToken) {
            const replyBody = matchedTemplate.response.replace(
              '{business_name}',
              business.profile?.businessName ?? 'your business',
            );

            sendWhatsAppTextMessage({
              business,
              credentials,
              to: event.from,
              body: replyBody,
            })
              .then((result) => {
                store.update((draft) => {
                  const draftBusiness = draft.businesses.find((candidate) => candidate.id === business.id);
                  if (!draftBusiness) {
                    return draft;
                  }

                  appendEvent(draftBusiness, 'WHATSAPP_AUTO_REPLY_SENT', {
                    to: event.from,
                    templateId: matchedTemplate.id,
                    messageId: result.messageId,
                  });
                  appendLog(draft, 'whatsapp_auto_reply_sent', {
                    businessId: draftBusiness.id,
                    templateId: matchedTemplate.id,
                    to: event.from,
                    messageId: result.messageId,
                  });
                  return draft;
                });
              })
              .catch((sendError) => {
                store.update((draft) => {
                  const draftBusiness = draft.businesses.find((candidate) => candidate.id === business.id);
                  if (draftBusiness) {
                    appendEvent(draftBusiness, 'WHATSAPP_AUTO_REPLY_FAILED', {
                      to: event.from,
                      templateId: matchedTemplate.id,
                      error: sendError.message,
                    });
                  }
                  appendLog(draft, 'whatsapp_auto_reply_failed', {
                    businessId: business.id,
                    templateId: matchedTemplate.id,
                    to: event.from,
                    error: sendError.message,
                  });
                  return draft;
                });
              });
          }
        } else {
          appendLog(state, 'whatsapp_status_received', {
            businessId,
            status: event.status,
            recipient: event.recipient,
            payload: event.raw,
          });
        }
      }

      store.write(state);
      response.status(200).json({ received: true, events: events.length });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/workflows/execute', (request, response, next) => {
    try {
      const payload = workflowSchema.parse(request.body);
      const state = store.update((draft) => {
        const business = ensureBusiness(draft);
        const workflow = executeWorkflow(business, payload);
        appendLog(draft, 'workflow_executed', {
          businessId: business.id,
          workflowId: workflow.id,
        });
        return draft;
      });

      response.status(201).json(buildStateResponse(store, state));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/intelligence/report', (_request, response) => {
    if (cachedIntelligenceReport) {
      return response.json(cachedIntelligenceReport);
    }

    const state = store.update((draft) => {
      updateOptimizationLearning(draft, deriveOptimizationLearningUpdates(draft));
      return draft;
    });
    
    cachedIntelligenceReport = generateIntelligenceReport(state);
    response.json(cachedIntelligenceReport);
  });

  app.post('/api/intelligence/interventions/run', async (_request, response, next) => {
    try {
      const state = store.read();
      const friction = detectFriction(state);
      const nudges = friction.hotspots.filter((h) => h.interventionType === 'TRIGGER_WHATSAPP_NUDGE');
      const results = [];

      for (const nudge of nudges) {
        const business = state.businesses.find((b) => b.id === nudge.businessId);
        if (!business) {
          continue;
        }

        const triggerCheck = canTriggerIntervention(state, business.id, nudge.type);
        if (!triggerCheck.allowed) {
          results.push({
            businessId: business.id,
            status: 'skipped_cooldown',
            cooldownUntil: triggerCheck.intervention?.cooldownUntil || null,
          });
          continue;
        }

        const phone = business.whatsapp?.phoneNumber || business.profile?.phone;
        if (!phone) {
          results.push({ businessId: business.id, status: 'skipped_no_phone' });
          continue;
        }

        const message = `Hi ${business.profile.businessName}, we noticed you haven't finished setting up Tapau GTM. Would you like some help getting your first invoice out?`;

        try {
          await sendWhatsAppTextMessage({
            business,
            credentials: store.getCredentials(business.id),
            to: phone,
            body: message,
          });

          store.update((draft) => {
            const draftBusiness = draft.businesses.find((b) => b.id === business.id);
            if (draftBusiness) {
              appendEvent(draftBusiness, 'INTERVENTION_TRIGGERED', {
                interventionType: 'TRIGGER_WHATSAPP_NUDGE',
                nudgeType: nudge.type,
                target: phone,
              });
              recordInterventionAttempt(draft, {
                businessId: draftBusiness.id,
                type: nudge.type,
                status: 'success',
                target: phone,
                metadata: {
                  interventionType: 'TRIGGER_WHATSAPP_NUDGE',
                },
              });
              appendLog(draft, 'intervention_triggered', {
                businessId: draftBusiness.id,
                interventionType: 'TRIGGER_WHATSAPP_NUDGE',
                nudgeType: nudge.type,
              });
            }
            return draft;
          });

          results.push({ businessId: business.id, status: 'success' });
        } catch (error) {
          store.update((draft) => {
            recordInterventionAttempt(draft, {
              businessId: business.id,
              type: nudge.type,
              status: 'failed',
              target: phone,
              error: error.message,
              metadata: {
                interventionType: 'TRIGGER_WHATSAPP_NUDGE',
              },
            });
            appendLog(draft, 'intervention_failed', {
              businessId: business.id,
              interventionType: 'TRIGGER_WHATSAPP_NUDGE',
              nudgeType: nudge.type,
              error: error.message,
            });
            return draft;
          });
          results.push({ businessId: business.id, status: 'failed', error: error.message });
        }
      }

      response.json({ processed: nudges.length, results });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/intelligence/optimizations/:id/apply', (request, response, next) => {
    try {
      const { id } = request.params;
      const { baseConfidence = 0.5 } = request.body || {};
      store.update((draft) => {
        applyOptimization(draft, id, baseConfidence);
        appendLog(draft, 'optimization_applied', { optimizationId: id, baseConfidence });
        return draft;
      });
      response.status(200).json({ success: true, id });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/dashboard/summary', (_request, response) => {
    response.json(buildDashboardSummary(store.read()));
  });

  app.post('/api/acquisition/hooks', (request, response, next) => {
    try {
      const payload = acquisitionSchema.parse(request.body);
      const state = store.update((draft) => {
        addAcquisitionHook(draft, payload);
        appendLog(draft, 'acquisition_hook_added', payload);
        return draft;
      });
      response.status(201).json(buildDashboardSummary(state));
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({
        message: 'Validation failed.',
        issues: error.issues,
      });
      return;
    }

    response.status(error.status || 500).json({
      message: error.message || 'Unexpected server error.',
      details: formatErrorDetails(error),
    });
  });

  return app;
}

function buildStateResponse(store, providedState = null) {
  const state = providedState ?? store.read();
  const activeBusiness = getActiveBusiness(state);

  return {
    activationDefinition: ACTIVATION_DEFINITION,
    steps: ONBOARDING_STEPS,
    menuFields: MENU_FIELDS,
    businessTypes: BUSINESS_TYPES,
    orderChannels: ORDER_CHANNELS,
    businesses: state.businesses.map((business) => ({
      id: business.id,
      businessName: business.profile.businessName,
      ownerName: business.profile.ownerName,
      createdAt: business.createdAt,
      activationAt: business.activationAt,
      onboardingState: business.onboardingState,
      isActive: state.activeBusinessId === business.id,
      credentials: store.getCredentialSummary(business.id),
    })),
    activeBusiness: activeBusiness
      ? serializeBusiness(activeBusiness, store.getCredentialSummary(activeBusiness.id))
      : null,
    dashboard: buildDashboardSummary(state),
  };
}

function buildCredentialTestMessage(businessName) {
  return `Tapau GTM credential validation for ${businessName}. Jika mesej ini diterima, sambungan WhatsApp anda berfungsi.`;
}

function formatErrorDetails(error) {
  if (!error?.payload) {
    return '';
  }

  if (typeof error.payload === 'string') {
    return error.payload;
  }

  return JSON.stringify(error.payload);
}

function recordCredentialFailure(store, provider, error) {
  try {
    const state = store.read();
    const business = getActiveBusiness(state);

    if (!business) {
      return;
    }

    appendEvent(business, 'CREDENTIAL_TEST_FAILED', {
      provider,
      payload: error.payload || error.message,
    });
    appendLog(state, 'credential_test_failed', {
      businessId: business.id,
      provider,
      error: error.message,
    });
    store.write(state);
  } catch {
    // Best-effort failure logging should not mask the original integration error.
  }
}
