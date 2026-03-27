import Papa from 'papaparse';
import {
  ACTIVATION_DEFINITION,
  DEFAULT_ACQUISITION_HOOKS,
  DEFAULT_WHATSAPP_TEMPLATES,
  ONBOARDING_STATES,
  ONBOARDING_STEPS,
} from '../shared/contracts.js';

const DEFAULT_MENU_ITEMS = [
  { id: 'seed-nasi-lemak', name: 'Nasi Lemak', price: 8, category: 'Main / Hidangan Utama' },
  { id: 'seed-teh-tarik', name: 'Teh Tarik', price: 3, category: 'Drinks / Minuman' },
  { id: 'seed-kuih', name: 'Kuih Seri Muka', price: 4.5, category: 'Dessert / Pencuci Mulut' },
];

export function createInitialState() {
  return {
    version: 1,
    activeBusinessId: null,
    businesses: [],
    acquisitionHooks: [...DEFAULT_ACQUISITION_HOOKS],
    logs: [],
    appliedOptimizations: [],
    interventions: [],
  };
}

export function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getActiveBusiness(state) {
  return state.businesses.find((business) => business.id === state.activeBusinessId) ?? null;
}

export function ensureBusiness(state) {
  const business = getActiveBusiness(state);
  if (!business) {
    throw new Error('No active business found. Complete the business profile first.');
  }
  return business;
}

export function createBusiness(profile) {
  const createdAt = new Date().toISOString();
  return {
    id: createId('biz'),
    createdAt,
    updatedAt: createdAt,
    activationAt: null,
    onboardingState: ONBOARDING_STATES.NOT_STARTED,
    completedSteps: [],
    profile,
    templates: {
      invoice: null,
      whatsapp: [],
    },
    menuItems: [],
    whatsapp: {
      status: 'pending',
      phoneNumber: profile.phone ?? '',
      connectedAt: null,
      testRecipient: profile.phone ?? '',
    },
    invoices: [],
    workflows: [],
    events: [],
  };
}

export function upsertBusiness(state, candidate) {
  const existingIndex = state.businesses.findIndex((business) => business.id === candidate.id);
  if (existingIndex >= 0) {
    state.businesses[existingIndex] = candidate;
  } else {
    state.businesses.push(candidate);
  }
  state.activeBusinessId = candidate.id;
}

export function markStepComplete(business, stepId, terminalState) {
  if (!business.completedSteps.includes(stepId)) {
    business.completedSteps.push(stepId);
  }
  business.onboardingState = terminalState;
  business.updatedAt = new Date().toISOString();
}

export function appendLog(state, action, details = {}) {
  const entry = {
    id: createId('log'),
    timestamp: new Date().toISOString(),
    action,
    details,
  };
  state.logs.unshift(entry);
  state.logs = state.logs.slice(0, 100);
  return entry;
}

export function normalizeAppliedOptimizations(state) {
  if (!Array.isArray(state.appliedOptimizations)) {
    state.appliedOptimizations = [];
  }

  state.appliedOptimizations = state.appliedOptimizations.map((optimization) =>
    typeof optimization === 'string'
      ? buildOptimizationRecord({ id: optimization })
      : buildOptimizationRecord(optimization),
  );

  return state.appliedOptimizations;
}

export function normalizeInterventions(state) {
  if (!Array.isArray(state.interventions)) {
    state.interventions = [];
  }

  state.interventions = state.interventions.map((intervention) => ({
    id: intervention.id || createId('intv'),
    businessId: intervention.businessId || '',
    type: intervention.type || 'unknown',
    triggerCount: Number(intervention.triggerCount || 0),
    escalationLevel: Number(intervention.escalationLevel || 0),
    lastTriggeredAt: intervention.lastTriggeredAt || null,
    cooldownUntil: intervention.cooldownUntil || null,
    lastOutcome: intervention.lastOutcome || null,
    lastError: intervention.lastError || '',
    status: intervention.status || 'idle',
    history: Array.isArray(intervention.history) ? intervention.history : [],
  }));

  return state.interventions;
}

export function appendEvent(business, event, properties = {}) {
  const entry = {
    id: createId('evt'),
    event,
    timestamp: new Date().toISOString(),
    properties,
  };
  business.events.push(entry);
  business.updatedAt = entry.timestamp;
  return entry;
}

export function generateTemplates(profile) {
  const invoice = {
    invoice: {
      header: {
        invoice_number: 'INV-{auto_increment}',
        date_issued: '{ISO_8601_datetime}',
        due_date: '{ISO_8601_datetime}',
        currency: 'MYR',
        status: 'draft',
        lhdn_compliance: {
          version: '1.0',
          tin_number: profile.tinNumber || 'PENDING_TIN',
          brn_number: profile.registrationNumber || 'PENDING_BRN',
          msic_code: profile.businessType === 'Bakeri / Kek' ? '10710' : '56101',
          sst_registration: profile.sstNumber || null,
          e_invoice_uuid: '{uuid_v4}',
        },
      },
      seller: {
        name: profile.businessName,
        phone: profile.phone,
        email: profile.email,
      },
      buyer: {
        name: 'Walk-in Customer',
        phone: null,
      },
      items: [],
      totals: {
        subtotal: 0,
        tax_total: 0,
        discount: 0,
        grand_total: 0,
      },
    },
  };

  return {
    invoice,
    whatsapp: DEFAULT_WHATSAPP_TEMPLATES.map((template) => ({
      ...template,
      response: template.response.replace('{business_name}', profile.businessName),
    })),
  };
}

export function inferCsvMapping(headers) {
  const lowerHeaders = headers.map((header) => header.trim().toLowerCase());
  const findHeader = (candidates) =>
    headers[lowerHeaders.findIndex((header) => candidates.some((candidate) => header.includes(candidate)))];

  return {
    name: findHeader(['item', 'name', 'product', 'menu']) ?? headers[0] ?? '',
    price: findHeader(['price', 'amount', 'rm', 'cost']) ?? headers[1] ?? '',
    category: findHeader(['category', 'type', 'group']) ?? headers[2] ?? '',
  };
}

export function previewCsvImport(csvText, mapping = {}) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (value) => value.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const resolvedMapping = {
    ...inferCsvMapping(headers),
    ...mapping,
  };

  const items = [];
  const errors = [];

  parsed.data.forEach((row, index) => {
    const rawName = row[resolvedMapping.name];
    const rawPrice = row[resolvedMapping.price];
    const rawCategory = row[resolvedMapping.category];
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    const numericPrice = Number.parseFloat(String(rawPrice).replace(/[^\d.-]/g, ''));

    if (!name) {
      errors.push({ row: index + 2, field: 'name', message: 'Item name is required.' });
      return;
    }

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      errors.push({ row: index + 2, field: 'price', message: 'Price must be greater than 0.' });
      return;
    }

    items.push({
      id: createId('item'),
      name,
      price: Number(numericPrice.toFixed(2)),
      category: rawCategory?.trim?.() || 'General',
    });
  });

  return {
    headers,
    mapping: resolvedMapping,
    items,
    errors,
    totalRows: parsed.data.length,
  };
}

export function saveMenuItems(business, items, source) {
  const nextItems = (items.length > 0 ? items : DEFAULT_MENU_ITEMS).map((item) => ({
    ...item,
    id: item.id || createId('item'),
  }));
  business.menuItems = nextItems;
  markStepComplete(business, 'data_import', ONBOARDING_STATES.MENU_READY);
  appendEvent(business, 'menu_items_added', {
    count: nextItems.length,
    method: source,
  });
}

export function connectWhatsapp(business, payload) {
  const phoneNumber = payload.phoneNumber;
  const skip = payload.skip;
  if (skip) {
    business.whatsapp = {
      ...business.whatsapp,
      status: 'skipped',
      phoneNumber: phoneNumber || business.whatsapp.phoneNumber,
      testRecipient: payload.testRecipient || business.whatsapp.testRecipient || phoneNumber || '',
      connectedAt: null,
    };
    markStepComplete(business, 'whatsapp_connection', ONBOARDING_STATES.WHATSAPP_SKIPPED);
    appendEvent(business, 'onboarding_step_skipped', {
      step_name: 'whatsapp_connection',
    });
    return;
  }

  business.whatsapp = {
    status: 'connected',
    phoneNumber,
    testRecipient: payload.testRecipient || business.whatsapp?.testRecipient || phoneNumber || '',
    connectedAt: new Date().toISOString(),
  };
  markStepComplete(business, 'whatsapp_connection', ONBOARDING_STATES.WHATSAPP_CONNECTED);
  appendEvent(business, 'whatsapp_connected', {
    phoneNumber,
  });
}

export function createInvoice(business, payload) {
  const items = payload.lineItems.map((lineItem) => {
    const menuItem = business.menuItems.find((candidate) => candidate.id === lineItem.itemId);
    if (!menuItem) {
      throw new Error(`Menu item ${lineItem.itemId} was not found.`);
    }
    const quantity = Number(lineItem.quantity);
    const subtotal = Number((menuItem.price * quantity).toFixed(2));
    return {
      itemId: menuItem.id,
      name: menuItem.name,
      category: menuItem.category,
      quantity,
      unitPrice: menuItem.price,
      subtotal,
    };
  });

  const subtotal = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
  const taxTotal = Number((subtotal * 0.06).toFixed(2));
  const grandTotal = Number((subtotal + taxTotal).toFixed(2));
  const invoiceNumber = `INV-${String(business.invoices.length + 1).padStart(4, '0')}`;
  const issuedAt = new Date().toISOString();

  const invoice = {
    id: createId('inv'),
    invoiceNumber,
    status: 'issued',
    issuedAt,
    buyer: {
      name: payload.customerName || 'Walk-in Customer',
      phone: payload.customerPhone || null,
    },
    items,
    totals: {
      subtotal,
      taxTotal,
      grandTotal,
    },
    lhdn: {
      status: 'pending',
      uuid: null,
      submissionUid: null,
      submittedAt: null,
      response: null,
    },
  };

  business.invoices.push(invoice);
  markStepComplete(business, 'first_invoice', ONBOARDING_STATES.FIRST_INVOICE_SENT);

  appendEvent(business, 'invoice_created', {
    invoice_type: payload.invoiceType || 'real',
    items_count: items.length,
    amount: grandTotal,
  });
  appendEvent(business, 'order_created', {
    source: payload.source || 'dashboard',
    items_count: items.length,
    amount: grandTotal,
  });

  maybeActivateBusiness(business, 'invoice_sent', {
    invoiceNumber,
    totalAmount: grandTotal,
  });

  return invoice;
}

export function executeWorkflow(business, payload = {}) {
  const workflow = {
    id: createId('wf'),
    name: payload.name || 'sample_workflow',
    channel: payload.channel || 'whatsapp',
    executedAt: new Date().toISOString(),
    status: 'success',
  };
  business.workflows.push(workflow);
  appendEvent(business, 'workflow_executed', {
    name: workflow.name,
    channel: workflow.channel,
  });
  maybeActivateBusiness(business, 'workflow_executed', {
    workflowId: workflow.id,
  });
  return workflow;
}

export function maybeActivateBusiness(business, qualifyingAction, properties = {}) {
  if (business.activationAt) {
    return;
  }
  if (!ACTIVATION_DEFINITION.qualifiesOn.includes(qualifyingAction)) {
    return;
  }
  const activationAt = new Date().toISOString();
  business.activationAt = activationAt;
  business.onboardingState = ONBOARDING_STATES.ACTIVATED;
  business.updatedAt = activationAt;

  appendEvent(business, ACTIVATION_DEFINITION.code, {
    qualifyingAction,
    ...properties,
    time_to_activation_minutes: minutesBetween(business.createdAt, activationAt),
  });
}

export function addAcquisitionHook(state, hook) {
  state.acquisitionHooks.unshift({
    id: createId('acq'),
    createdAt: new Date().toISOString(),
    ...hook,
  });
}

export function serializeBusiness(business, credentialSummary = null) {
  if (!business) {
    return null;
  }
  return {
    ...business,
    credentials: credentialSummary ?? {
      hasLhdnCredentials: false,
      hasWhatsAppCredentials: false,
      createdAt: null,
      lhdnClientIdMasked: '',
      whatsappPhoneNumberIdMasked: '',
    },
    suggestedMenuItems:
      business.menuItems.length > 0 ? business.menuItems : DEFAULT_MENU_ITEMS.map((item) => ({ ...item })),
    stepStatuses: ONBOARDING_STEPS.map((step) => ({
      ...step,
      completed: business.completedSteps.includes(step.id),
      current:
        !business.completedSteps.includes(step.id) &&
        ONBOARDING_STEPS.find((candidate) => !business.completedSteps.includes(candidate.id))?.id === step.id,
    })),
  };
}

export function buildDashboardSummary(state) {
  const businesses = state.businesses;
  const signups = businesses.length;
  const activatedBusinesses = businesses.filter((business) => Boolean(business.activationAt));
  const invoicesIssued = businesses.reduce((sum, business) => sum + business.invoices.length, 0);
  const revenue = businesses.reduce(
    (sum, business) =>
      sum + business.invoices.reduce((businessSum, invoice) => businessSum + invoice.totals.grandTotal, 0),
    0,
  );

  const completionRates = ONBOARDING_STEPS.map((step) => ({
    stepId: step.id,
    label: step.label,
    completionRate: signups === 0 ? 0 : percentage(businesses.filter((business) => business.completedSteps.includes(step.id)).length / signups),
  }));

  const dropOffMap = businesses
    .filter((business) => !business.activationAt)
    .reduce((result, business) => {
      result[business.onboardingState] = (result[business.onboardingState] ?? 0) + 1;
      return result;
    }, {});

  const activationMinutes = activatedBusinesses.map((business) =>
    minutesBetween(business.createdAt, business.activationAt),
  );

  const acquisitionSpend = state.acquisitionHooks.reduce((sum, hook) => sum + Number(hook.spend || 0), 0);
  const acquisitionCustomers = state.acquisitionHooks.reduce((sum, hook) => sum + Number(hook.customers || 0), 0);

  return {
    activationDefinition: ACTIVATION_DEFINITION,
    headline: {
      signups,
      activated: activatedBusinesses.length,
      activationRate: signups === 0 ? 0 : percentage(activatedBusinesses.length / signups),
      onboardingCompletionRate:
        signups === 0
          ? 0
          : percentage(
              businesses.filter((business) => business.completedSteps.includes('first_invoice')).length / signups,
            ),
      timeToActivationMinutes: activationMinutes.length === 0 ? null : median(activationMinutes),
      invoicesIssued,
      revenue: Number(revenue.toFixed(2)),
      cac: acquisitionCustomers === 0 ? null : Number((acquisitionSpend / acquisitionCustomers).toFixed(2)),
    },
    completionRates,
    dropOffPoints: dropOffMap,
    acquisitionHooks: state.acquisitionHooks,
    recentLogs: state.logs.slice(0, 12),
    appliedOptimizations: state.appliedOptimizations ?? [],
    interventions: state.interventions ?? [],
  };
}

export function minutesBetween(startIso, endIso) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.max(0, Math.round((end - start) / 60000));
}

function percentage(value) {
  return Number((value * 100).toFixed(1));
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(1));
  }
  return sorted[middle];
}

export function applyOptimization(state, optimizationId, baseConfidence = 0.5) {
  normalizeAppliedOptimizations(state);
  const existing = state.appliedOptimizations.find((o) => o.id === optimizationId);
  if (!existing) {
    state.appliedOptimizations.push(
      buildOptimizationRecord({
        id: optimizationId,
        state: 'applied',
        appliedAt: new Date().toISOString(),
        baseConfidence,
        confidence: baseConfidence,
      }),
    );
  } else {
    existing.state = 'applied';
    existing.appliedAt = new Date().toISOString();
    existing.baseConfidence = baseConfidence;
    existing.confidence = baseConfidence;
    existing.impact = existing.impact || defaultOptimizationImpact();
  }
}

export function updateOptimizationLearning(state, updates = []) {
  normalizeAppliedOptimizations(state);

  for (const update of updates) {
    const optimization = state.appliedOptimizations.find((candidate) => candidate.id === update.id);
    if (!optimization) {
      continue;
    }

    optimization.state = update.state ?? optimization.state;
    optimization.confidence = update.confidence ?? optimization.confidence;
    optimization.impact = {
      ...defaultOptimizationImpact(),
      ...(optimization.impact ?? {}),
      ...(update.impact ?? {}),
    };
    optimization.context = {
      ...(optimization.context ?? {}),
      ...(update.context ?? {}),
    };
    optimization.lastEvaluatedAt = update.lastEvaluatedAt ?? new Date().toISOString();
  }
}

export function canTriggerIntervention(state, businessId, type, now = Date.now()) {
  const intervention = findIntervention(state, businessId, type);
  if (!intervention) {
    return { allowed: true, intervention: null };
  }

  const cooldownUntil = intervention.cooldownUntil ? new Date(intervention.cooldownUntil).getTime() : 0;
  if (cooldownUntil > now) {
    return { allowed: false, intervention };
  }

  if (intervention.triggerCount >= 3 && intervention.lastOutcome === 'success') {
    return { allowed: false, intervention };
  }

  return { allowed: true, intervention };
}

export function recordInterventionAttempt(
  state,
  { businessId, type, status, target = '', error = '', metadata = {}, now = new Date().toISOString() },
) {
  normalizeInterventions(state);
  let intervention = findIntervention(state, businessId, type);

  if (!intervention) {
    intervention = {
      id: createId('intv'),
      businessId,
      type,
      triggerCount: 0,
      escalationLevel: 0,
      lastTriggeredAt: null,
      cooldownUntil: null,
      lastOutcome: null,
      lastError: '',
      status: 'idle',
      history: [],
    };
    state.interventions.push(intervention);
  }

  intervention.triggerCount += 1;
  intervention.lastTriggeredAt = now;
  intervention.lastOutcome = status;
  intervention.lastError = error;
  intervention.status = status;
  intervention.escalationLevel =
    status === 'success' ? intervention.escalationLevel : Math.min(intervention.escalationLevel + 1, 3);
  intervention.cooldownUntil = new Date(
    new Date(now).getTime() + interventionCooldownMs(type, intervention.triggerCount, status),
  ).toISOString();
  intervention.history.push({
    at: now,
    status,
    target,
    error,
    metadata,
  });
  intervention.history = intervention.history.slice(-10);

  return intervention;
}

function findIntervention(state, businessId, type) {
  return (state.interventions ?? []).find(
    (candidate) => candidate.businessId === businessId && candidate.type === type,
  );
}

function interventionCooldownMs(type, triggerCount, status) {
  const baseHours = type === 'TRIGGER_WHATSAPP_NUDGE' ? 24 : 6;
  const multiplier = status === 'success' ? Math.max(triggerCount, 1) : Math.max(triggerCount + 1, 2);
  return baseHours * multiplier * 60 * 60 * 1000;
}

function buildOptimizationRecord(optimization = {}) {
  return {
    id: optimization.id || createId('opt'),
    state: optimization.state || 'applied',
    appliedAt: optimization.appliedAt || new Date().toISOString(),
    lastEvaluatedAt: optimization.lastEvaluatedAt || null,
    baseConfidence: Number(optimization.baseConfidence ?? 0.5),
    confidence: Number(optimization.confidence ?? optimization.baseConfidence ?? 0.5),
    impact: {
      ...defaultOptimizationImpact(),
      ...(optimization.impact ?? {}),
    },
    context: {
      cohort: optimization.context?.cohort || 'global',
      triggerType: optimization.context?.triggerType || 'manual',
      vertical: optimization.context?.vertical || 'sme_saas',
    },
  };
}

function defaultOptimizationImpact() {
  return {
    deltaActivation: 0,
    sampleSize: 0,
    observedAt: null,
    beforeRate: 0,
    afterRate: 0,
  };
}
