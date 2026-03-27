import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const initialProfile = {
  businessName: '',
  businessType: 'Restoran / Kafe',
  ownerName: '',
  phone: '',
  email: '',
  orderChannels: ['WhatsApp'],
  leadSource: 'Meta Ads',
  registrationNumber: '',
  tinNumber: '',
  sstNumber: '',
  addressLine1: '',
  addressLine2: '',
  addressLine3: '',
  city: '',
  postcode: '',
  stateCode: '',
  countryCode: 'MYS',
  msicCode: '',
};

const initialCredentials = {
  lhdnClientId: '',
  lhdnClientSecret: '',
  whatsappAccessToken: '',
  whatsappPhoneNumberId: '',
  whatsappVerifyToken: '',
  whatsappTestRecipient: '',
};

const initialValidationState = {
  lhdn: { success: false, message: '', details: '' },
  whatsapp: { success: false, message: '', details: '' },
};

const initialAcquisitionHook = {
  channel: 'Meta Ads',
  spend: 300,
  leads: 8,
  customers: 2,
};

export default function App() {
  const [appState, setAppState] = useState(null);
  const [profile, setProfile] = useState(initialProfile);
  const [credentialForm, setCredentialForm] = useState(initialCredentials);
  const [credentialValidation, setCredentialValidation] = useState(initialValidationState);
  const [csvPreview, setCsvPreview] = useState(null);
  const [csvText, setCsvText] = useState('');
  const [manualItems, setManualItems] = useState([
    { name: 'Nasi Lemak', price: 8, category: 'Main / Hidangan Utama' },
    { name: 'Teh Tarik', price: 3, category: 'Drinks / Minuman' },
  ]);
  const [invoiceCustomer, setInvoiceCustomer] = useState({
    customerName: 'Test Customer',
    customerPhone: '60120000000',
  });
  const [itemQuantities, setItemQuantities] = useState({});
  const [invoiceOptions, setInvoiceOptions] = useState({
    submitToLhdn: true,
    sendWhatsappConfirmation: false,
  });
  const [acquisitionHook, setAcquisitionHook] = useState(initialAcquisitionHook);
  const [intelligenceReport, setIntelligenceReport] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    loadState();
  }, []);

  const businesses = appState?.businesses ?? [];
  const activeBusiness = appState?.activeBusiness ?? null;
  const dashboard = appState?.dashboard ?? null;
  const menuItems = activeBusiness?.suggestedMenuItems ?? [];
  const credentialSummary = activeBusiness?.credentials ?? {
    hasLhdnCredentials: false,
    hasWhatsAppCredentials: false,
    createdAt: null,
  };

  useEffect(() => {
    if (!activeBusiness) {
      setProfile(initialProfile);
      setCredentialForm(initialCredentials);
      setCredentialValidation(initialValidationState);
      return;
    }

    setProfile((current) => ({
      ...current,
      ...activeBusiness.profile,
    }));
    setCredentialForm({
      ...initialCredentials,
      whatsappTestRecipient: activeBusiness.whatsapp?.testRecipient || activeBusiness.profile.phone || '',
    });
    setCredentialValidation(initialValidationState);
  }, [activeBusiness?.id]);

  const currentStep = useMemo(
    () => activeBusiness?.stepStatuses?.find((step) => step.current) ?? activeBusiness?.stepStatuses?.at(-1),
    [activeBusiness],
  );

  const canSaveCredentials =
    Boolean(activeBusiness) && credentialValidation.lhdn.success && credentialValidation.whatsapp.success;

  const canSubmitInvoice =
    Boolean(activeBusiness) &&
    (!invoiceOptions.submitToLhdn || credentialSummary.hasLhdnCredentials) &&
    (!invoiceOptions.sendWhatsappConfirmation || credentialSummary.hasWhatsAppCredentials);

  async function loadState() {
    const data = await api('/api/state');
    setAppState(data);
  }

  async function runRequest(label, action) {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      return await action();
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    } finally {
      setBusy('');
    }
  }

  async function selectBusiness(businessId) {
    await runRequest(businessId ? 'Switching business...' : 'Preparing new business workspace...', async () => {
      const data = await api('/api/businesses/select', {
        method: 'POST',
        body: JSON.stringify({
          businessId,
        }),
      });
      setAppState(data);
    });
  }

  async function saveProfile(event) {
    event.preventDefault();
    await runRequest('Saving business profile...', async () => {
      const data = await api('/api/onboarding/profile', {
        method: 'POST',
        body: JSON.stringify({ ...profile }),
      });
      setAppState(data);
      setNotice('Business profile saved. Next, validate credentials for this business.');
    });
  }

  async function testLhdnCredentials() {
    await runRequest('Testing LHDN credentials...', async () => {
      const data = await api('/api/credentials/lhdn/test', {
        method: 'POST',
        body: JSON.stringify({
          lhdnClientId: credentialForm.lhdnClientId,
          lhdnClientSecret: credentialForm.lhdnClientSecret,
        }),
      });
      setCredentialValidation((current) => ({
        ...current,
        lhdn: {
          success: true,
          message: data.message,
          details: data.details,
        },
      }));
      setNotice(data.message);
    });
  }

  async function testWhatsAppCredentials() {
    await runRequest('Testing WhatsApp credentials...', async () => {
      const data = await api('/api/credentials/whatsapp/test', {
        method: 'POST',
        body: JSON.stringify({
          whatsappAccessToken: credentialForm.whatsappAccessToken,
          whatsappPhoneNumberId: credentialForm.whatsappPhoneNumberId,
          whatsappVerifyToken: credentialForm.whatsappVerifyToken,
          whatsappTestRecipient: credentialForm.whatsappTestRecipient,
        }),
      });
      setCredentialValidation((current) => ({
        ...current,
        whatsapp: {
          success: true,
          message: data.message,
          details: data.details,
        },
      }));
      setNotice(data.message);
    });
  }

  async function saveCredentials() {
    await runRequest('Saving validated credentials...', async () => {
      const data = await api('/api/credentials/save', {
        method: 'POST',
        body: JSON.stringify(credentialForm),
      });
      setAppState(data);
      setNotice('Credentials saved securely for this business.');
    });
  }

  async function generateTemplates() {
    await runRequest('Generating templates...', async () => {
      const data = await api('/api/templates/generate', { method: 'POST' });
      setAppState(data);
    });
  }

  async function handleCsvFile(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const nextCsvText = await file.text();
    setCsvText(nextCsvText);
    await previewCsv(nextCsvText);
  }

  async function previewCsv(nextCsvText = csvText, mapping = csvPreview?.mapping) {
    await runRequest('Previewing CSV import...', async () => {
      const data = await api('/api/import/csv/preview', {
        method: 'POST',
        body: JSON.stringify({
          csvText: nextCsvText,
          mapping,
        }),
      });
      setCsvPreview(data);
    });
  }

  async function confirmCsvImport() {
    if (!csvPreview?.items?.length) {
      return;
    }
    await runRequest('Importing menu items...', async () => {
      const data = await api('/api/import/confirm', {
        method: 'POST',
        body: JSON.stringify({
          items: csvPreview.items,
          source: 'csv',
        }),
      });
      setAppState(data);
    });
  }

  async function saveManualItems() {
    await runRequest('Saving manual menu...', async () => {
      const data = await api('/api/import/confirm', {
        method: 'POST',
        body: JSON.stringify({
          items: manualItems.map((item) => ({
            ...item,
            price: Number(item.price),
          })),
          source: 'manual',
        }),
      });
      setAppState(data);
    });
  }

  async function connectWhatsApp(skip = false) {
    await runRequest(skip ? 'Skipping WhatsApp...' : 'Connecting WhatsApp...', async () => {
      const data = await api('/api/whatsapp/connect', {
        method: 'POST',
        body: JSON.stringify({
          phoneNumber: profile.phone,
          testRecipient: credentialForm.whatsappTestRecipient || profile.phone,
          skip,
        }),
      });
      setAppState(data);
    });
  }

  async function sendTestWhatsApp() {
    await runRequest('Sending stored WhatsApp test message...', async () => {
      const data = await api('/api/whatsapp/send-test', {
        method: 'POST',
        body: JSON.stringify({
          to: credentialForm.whatsappTestRecipient || profile.phone,
          templateId: 'order-confirmation',
        }),
      });
      setAppState((current) => ({
        ...current,
        activeBusiness: data.activeBusiness,
        dashboard: data.dashboard,
        businesses: data.businesses,
      }));
      setNotice(data.messageId ? `WhatsApp message sent with id ${data.messageId}.` : 'WhatsApp message sent.');
    });
  }

  async function sendInvoice(event) {
    event.preventDefault();
    const lineItems = menuItems
      .map((item) => ({
        itemId: item.id,
        quantity: Number(itemQuantities[item.id] || 0),
      }))
      .filter((item) => item.quantity > 0);

    if (lineItems.length === 0) {
      setError('Add at least one item quantity before sending the first invoice.');
      return;
    }

    await runRequest('Sending first invoice...', async () => {
      const data = await api('/api/invoices/create', {
        method: 'POST',
        body: JSON.stringify({
          ...invoiceCustomer,
          lineItems,
          source: 'dashboard',
          invoiceType: 'real',
          ...invoiceOptions,
        }),
      });
      setAppState(data);
    });
  }

  async function executeWorkflow() {
    await runRequest('Executing workflow...', async () => {
      const data = await api('/api/workflows/execute', {
        method: 'POST',
        body: JSON.stringify({
          name: 'post_order_reminder',
          channel: 'whatsapp',
        }),
      });
      setAppState(data);
    });
  }

  async function saveAcquisitionHook(event) {
    event.preventDefault();
    await runRequest('Saving acquisition hook...', async () => {
      const data = await api('/api/acquisition/hooks', {
        method: 'POST',
        body: JSON.stringify({
          ...acquisitionHook,
          spend: Number(acquisitionHook.spend),
          leads: Number(acquisitionHook.leads),
          customers: Number(acquisitionHook.customers),
        }),
      });
      setAppState((current) => ({
        ...current,
        dashboard: data,
      }));
    });
  }

  async function loadIntelligenceReport() {
    await runRequest('Loading intelligence report...', async () => {
      const data = await api('/api/intelligence/report');
      setIntelligenceReport(data);
    });
  }

  async function runInterventions() {
    await runRequest('Triggering automated interventions...', async () => {
      await api('/api/intelligence/interventions/run', { method: 'POST' });
      await loadIntelligenceReport();
    });
  }

  async function applyCodexTask(task) {
    await runRequest('Applying execution task...', async () => {
      await api(`/api/intelligence/optimizations/${task.id}/apply`, { 
        method: 'POST',
        body: JSON.stringify({ baseConfidence: task.confidence ?? 0.8 }),
      });
      await loadIntelligenceReport();
    });
  }

  function updateOrderChannels(channel) {
    setProfile((current) => ({
      ...current,
      orderChannels: current.orderChannels.includes(channel)
        ? current.orderChannels.filter((value) => value !== channel)
        : [...current.orderChannels, channel],
    }));
  }

  function updateManualItem(index, field, value) {
    setManualItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  }

  function addManualItemRow() {
    setManualItems((current) => [...current, { name: '', price: 0, category: 'General' }]);
  }

  function updateCredential(field, value) {
    setCredentialForm((current) => ({
      ...current,
      [field]: value,
    }));

    if (field.startsWith('lhdn')) {
      setCredentialValidation((current) => ({
        ...current,
        lhdn: { success: false, message: '', details: '' },
      }));
    } else {
      setCredentialValidation((current) => ({
        ...current,
        whatsapp: { success: false, message: '', details: '' },
      }));
    }
  }

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Autonomous GTM System Builder</p>
          <h1>Tapau GTM Engine</h1>
          <p className="hero-copy">
            Guided SME onboarding that drives the first invoice within one session, with tenant-owned credentials baked in.
          </p>
        </div>
        <div className="hero-status">
          <span className="status-label">Current step</span>
          <strong>{currentStep?.label ?? 'Business profile'}</strong>
          <span className="status-note">
            {activeBusiness?.activationAt
              ? `Activated in ${dashboard?.headline?.timeToActivationMinutes ?? 0} min`
              : 'Aim: complete in under 30 minutes'}
          </span>
        </div>
      </header>

      {error ? <div className="banner error">{error}</div> : null}
      {notice ? <div className="banner busy">{notice}</div> : null}
      {busy ? <div className="banner busy">{busy}</div> : null}

      <main className="layout">
        <section className="panel stack">
          <div className="section-heading">
            <h2>Onboarding flow</h2>
            <p>Defaults first, low-friction steps, and a resumable state machine.</p>
          </div>

          <div className="card stack">
            <div className="card-header">
              <h3>Workspace businesses</h3>
              <p>Switch between tenants or start a clean onboarding workspace for a new business.</p>
            </div>
            <div className="action-row">
              <select
                value={activeBusiness?.id ?? ''}
                onChange={(event) => selectBusiness(event.target.value || null)}
              >
                <option value="">Start a new business</option>
                {businesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.businessName} {business.activationAt ? '(Activated)' : '(In progress)'}
                  </option>
                ))}
              </select>
              <button className="secondary" type="button" onClick={() => selectBusiness(null)}>
                New business
              </button>
            </div>
            <div className="pill-row">
              {businesses.map((business) => (
                <span key={business.id} className="pill">
                  {business.businessName}: {business.credentials.hasLhdnCredentials ? 'LHDN ready' : 'LHDN missing'} /{' '}
                  {business.credentials.hasWhatsAppCredentials ? 'WA ready' : 'WA missing'}
                </span>
              ))}
            </div>
          </div>

          <ol className="step-list">
            {activeBusiness?.stepStatuses?.map((step) => (
              <li
                key={step.id}
                className={`step-card ${step.completed ? 'complete' : ''} ${step.current ? 'current' : ''}`}
              >
                <div>
                  <strong>{step.label}</strong>
                  <p>{step.description}</p>
                </div>
                <span>{step.completed ? 'Done' : step.current ? 'Next' : 'Pending'}</span>
              </li>
            )) ?? null}
          </ol>

          <form className="card stack" onSubmit={saveProfile}>
            <div className="card-header">
              <h3>1. Business profile</h3>
              <p>Capture just enough context to auto-configure the workspace.</p>
            </div>
            <div className="form-grid">
              <label>
                Business name
                <input
                  value={profile.businessName}
                  onChange={(event) => setProfile((current) => ({ ...current, businessName: event.target.value }))}
                  placeholder="Kedai Nasi Lemak Seri Pagi"
                  required
                />
              </label>
              <label>
                Business type
                <select
                  value={profile.businessType}
                  onChange={(event) => setProfile((current) => ({ ...current, businessType: event.target.value }))}
                >
                  {appState?.businessTypes?.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Owner name
                <input
                  value={profile.ownerName}
                  onChange={(event) => setProfile((current) => ({ ...current, ownerName: event.target.value }))}
                  placeholder="Aisyah"
                  required
                />
              </label>
              <label>
                Business phone
                <input
                  value={profile.phone}
                  onChange={(event) => {
                    const nextPhone = event.target.value;
                    setProfile((current) => ({ ...current, phone: nextPhone }));
                    if (!credentialForm.whatsappTestRecipient) {
                      setCredentialForm((current) => ({ ...current, whatsappTestRecipient: nextPhone }));
                    }
                  }}
                  placeholder="60123456789"
                  required
                />
              </label>
              <label>
                Email
                <input
                  value={profile.email}
                  onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))}
                  placeholder="owner@tapau.my"
                  required
                />
              </label>
              <label>
                Lead source
                <input
                  value={profile.leadSource}
                  onChange={(event) => setProfile((current) => ({ ...current, leadSource: event.target.value }))}
                  placeholder="Meta Ads"
                  required
                />
              </label>
              <label>
                LHDN TIN
                <input
                  value={profile.tinNumber}
                  onChange={(event) => setProfile((current) => ({ ...current, tinNumber: event.target.value }))}
                  placeholder="C1234567890"
                />
              </label>
              <label>
                Business registration
                <input
                  value={profile.registrationNumber}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, registrationNumber: event.target.value }))
                  }
                  placeholder="202401012345"
                />
              </label>
              <label>
                SST number
                <input
                  value={profile.sstNumber}
                  onChange={(event) => setProfile((current) => ({ ...current, sstNumber: event.target.value }))}
                  placeholder="A10-2408-32000001"
                />
              </label>
              <label>
                MSIC code
                <input
                  value={profile.msicCode}
                  onChange={(event) => setProfile((current) => ({ ...current, msicCode: event.target.value }))}
                  placeholder="56101"
                />
              </label>
              <label>
                Address line 1
                <input
                  value={profile.addressLine1}
                  onChange={(event) => setProfile((current) => ({ ...current, addressLine1: event.target.value }))}
                  placeholder="Lot 66"
                />
              </label>
              <label>
                Address line 2
                <input
                  value={profile.addressLine2}
                  onChange={(event) => setProfile((current) => ({ ...current, addressLine2: event.target.value }))}
                  placeholder="Bangunan Merdeka"
                />
              </label>
              <label>
                Address line 3
                <input
                  value={profile.addressLine3}
                  onChange={(event) => setProfile((current) => ({ ...current, addressLine3: event.target.value }))}
                  placeholder="Persiaran Jaya"
                />
              </label>
              <label>
                City
                <input
                  value={profile.city}
                  onChange={(event) => setProfile((current) => ({ ...current, city: event.target.value }))}
                  placeholder="Kuala Lumpur"
                />
              </label>
              <label>
                Postcode
                <input
                  value={profile.postcode}
                  onChange={(event) => setProfile((current) => ({ ...current, postcode: event.target.value }))}
                  placeholder="50480"
                />
              </label>
              <label>
                State code
                <input
                  value={profile.stateCode}
                  onChange={(event) => setProfile((current) => ({ ...current, stateCode: event.target.value }))}
                  placeholder="10"
                />
              </label>
            </div>
            <div className="channel-group">
              {appState?.orderChannels?.map((channel) => (
                <label key={channel} className="checkbox-chip">
                  <input
                    type="checkbox"
                    checked={profile.orderChannels.includes(channel)}
                    onChange={() => updateOrderChannels(channel)}
                  />
                  <span>{channel}</span>
                </label>
              ))}
            </div>
            <button className="primary" type="submit">
              Save profile
            </button>
          </form>

          <div className="card stack">
            <div className="card-header">
              <h3>Credential onboarding</h3>
              <p>Each business owns its own LHDN and WhatsApp credentials. Nothing here relies on `.env`.</p>
            </div>
            <div className="form-grid">
              <label>
                LHDN client ID
                <input
                  value={credentialForm.lhdnClientId}
                  onChange={(event) => updateCredential('lhdnClientId', event.target.value)}
                  placeholder="sandbox-client-id"
                />
              </label>
              <label>
                LHDN client secret
                <input
                  type="password"
                  value={credentialForm.lhdnClientSecret}
                  onChange={(event) => updateCredential('lhdnClientSecret', event.target.value)}
                  placeholder="sandbox-client-secret"
                />
              </label>
              <label>
                WhatsApp access token
                <input
                  type="password"
                  value={credentialForm.whatsappAccessToken}
                  onChange={(event) => updateCredential('whatsappAccessToken', event.target.value)}
                  placeholder="EAAB..."
                />
              </label>
              <label>
                WhatsApp phone number ID
                <input
                  value={credentialForm.whatsappPhoneNumberId}
                  onChange={(event) => updateCredential('whatsappPhoneNumberId', event.target.value)}
                  placeholder="123456789012345"
                />
              </label>
              <label>
                WhatsApp verify token
                <input
                  value={credentialForm.whatsappVerifyToken}
                  onChange={(event) => updateCredential('whatsappVerifyToken', event.target.value)}
                  placeholder="tapau-verify-token"
                />
              </label>
              <label>
                WhatsApp test recipient
                <input
                  value={credentialForm.whatsappTestRecipient}
                  onChange={(event) => updateCredential('whatsappTestRecipient', event.target.value)}
                  placeholder="60123456789"
                />
              </label>
            </div>
            <div className="action-row">
              <button className="secondary" type="button" onClick={testLhdnCredentials} disabled={!activeBusiness}>
                Test LHDN connection
              </button>
              <button className="secondary" type="button" onClick={testWhatsAppCredentials} disabled={!activeBusiness}>
                Test WhatsApp connection
              </button>
              <button className="primary" type="button" onClick={saveCredentials} disabled={!canSaveCredentials}>
                Save validated credentials
              </button>
            </div>
            <div className="pill-row">
              <span className="pill">{credentialSummary.hasLhdnCredentials ? 'LHDN stored' : 'LHDN not stored'}</span>
              <span className="pill">
                {credentialSummary.hasWhatsAppCredentials ? 'WhatsApp stored' : 'WhatsApp not stored'}
              </span>
              <span className="pill">
                Saved: {credentialSummary.createdAt ? new Date(credentialSummary.createdAt).toLocaleString() : 'Not yet'}
              </span>
            </div>
            <CredentialFeedback title="LHDN Credentials" status={credentialValidation.lhdn} />
            <CredentialFeedback title="WhatsApp Credentials" status={credentialValidation.whatsapp} />
            <div className="stack">
              <small>
                LHDN docs:{' '}
                <a
                  href="https://sdk.myinvois.hasil.gov.my/api/07-login-as-taxpayer-system/"
                  target="_blank"
                  rel="noreferrer"
                >
                  sandbox login
                </a>
              </small>
              <small>
                Meta docs:{' '}
                <a
                  href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                  target="_blank"
                  rel="noreferrer"
                >
                  Cloud API setup
                </a>
              </small>
            </div>
          </div>

          <div className="card stack">
            <div className="card-header">
              <h3>2. Auto template generation</h3>
              <p>Prebuilt invoice and WhatsApp defaults based on the saved profile.</p>
            </div>
            <button className="primary" type="button" onClick={generateTemplates} disabled={!activeBusiness}>
              Generate defaults
            </button>
            {activeBusiness?.templates?.invoice ? (
              <div className="template-grid">
                <pre>{JSON.stringify(activeBusiness.templates.invoice, null, 2)}</pre>
                <pre>{JSON.stringify(activeBusiness.templates.whatsapp, null, 2)}</pre>
              </div>
            ) : null}
          </div>

          <div className="card stack">
            <div className="card-header">
              <h3>3. Data import tool</h3>
              <p>Upload CSV, map columns, validate rows, or fall back to quick manual entry.</p>
            </div>
            <input type="file" accept=".csv" onChange={handleCsvFile} />
            {csvPreview ? (
              <div className="stack">
                <div className="mapping-grid">
                  {Object.entries(csvPreview.mapping).map(([field, column]) => (
                    <label key={field}>
                      {field}
                      <select
                        value={column}
                        onChange={(event) => {
                          const nextMapping = { ...csvPreview.mapping, [field]: event.target.value };
                          setCsvPreview((current) => ({ ...current, mapping: nextMapping }));
                          previewCsv(csvText, nextMapping);
                        }}
                      >
                        {csvPreview.headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {csvPreview.errors.length > 0 ? (
                  <div className="validation-list">
                    {csvPreview.errors.map((issue) => (
                      <div key={`${issue.row}-${issue.field}`} className="validation-item">
                        Row {issue.row}: {issue.message}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="validation-ok">
                    {csvPreview.items.length} valid items ready to import from {csvPreview.totalRows} rows.
                  </div>
                )}
                <div className="data-table">
                  {csvPreview.items.slice(0, 5).map((item) => (
                    <div key={item.id} className="data-row">
                      <span>{item.name}</span>
                      <span>RM {item.price.toFixed(2)}</span>
                      <span>{item.category}</span>
                    </div>
                  ))}
                </div>
                <button
                  className="primary"
                  type="button"
                  onClick={confirmCsvImport}
                  disabled={csvPreview.errors.length > 0 || csvPreview.items.length === 0}
                >
                  Confirm CSV import
                </button>
              </div>
            ) : null}
            <div className="divider" />
            <div className="stack">
              <strong>Manual quick add</strong>
              {manualItems.map((item, index) => (
                <div className="manual-row" key={`${index}-${item.name}`}>
                  <input
                    value={item.name}
                    onChange={(event) => updateManualItem(index, 'name', event.target.value)}
                    placeholder="Item name"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.price}
                    onChange={(event) => updateManualItem(index, 'price', event.target.value)}
                    placeholder="Price"
                  />
                  <input
                    value={item.category}
                    onChange={(event) => updateManualItem(index, 'category', event.target.value)}
                    placeholder="Category"
                  />
                </div>
              ))}
              <div className="action-row">
                <button className="secondary" type="button" onClick={addManualItemRow}>
                  Add row
                </button>
                <button className="primary" type="button" onClick={saveManualItems}>
                  Save manual items
                </button>
              </div>
            </div>
          </div>

          {!appState?.dashboard?.appliedOptimizations?.some(opt => typeof opt === 'object' ? opt.id === 'ttv_whatsapp_skip' && ['applied', 'validated', 'reinforced'].includes(opt.state) : opt === 'ttv_whatsapp_skip') && !appState?.dashboard?.appliedOptimizations?.some(opt => typeof opt === 'object' ? opt.id.includes('Implement dynamic TTV') && ['applied', 'validated', 'reinforced'].includes(opt.state) : typeof opt === 'string' && opt.includes('Implement dynamic TTV')) ? (
            <div className="card stack">
              <div className="card-header">
                <h3>4. WhatsApp connection</h3>
                <p>Once credentials are saved, connect the channel or deliberately skip it for this tenant.</p>
              </div>
              <div className="action-row">
                <button className="primary" type="button" onClick={() => connectWhatsApp(false)} disabled={!activeBusiness}>
                  Connect WhatsApp
                </button>
                <button className="secondary" type="button" onClick={() => connectWhatsApp(true)} disabled={!activeBusiness}>
                  Skip for now
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={sendTestWhatsApp}
                  disabled={!activeBusiness || !credentialSummary.hasWhatsAppCredentials}
                >
                  Send stored-credential test
                </button>
              </div>
              <div className="pill-row">
                <span className="pill">{activeBusiness?.whatsapp?.status ?? 'pending'}</span>
                <span className="pill">{activeBusiness?.whatsapp?.phoneNumber ?? 'No number saved'}</span>
                <span className="pill">
                  Webhook: {`${window.location.origin}/api/whatsapp/webhook`}
                </span>
              </div>
            </div>
          ) : (
            <div className="card stack success">
              <div className="card-header">
                <h3><del>4. WhatsApp connection</del></h3>
                <p>⚡ <strong>TTV Compression Active:</strong> This step was dynamically hidden by the Intelligence Engine to accelerate the user to their first invoice.</p>
              </div>
            </div>
          )}

          <form className="card stack" onSubmit={sendInvoice}>
            <div className="card-header">
              <h3>5. First invoice and activation</h3>
              <p>Send the first invoice or execute a workflow to trigger activation.</p>
            </div>
            <div className="form-grid">
              <label>
                Customer name
                <input
                  value={invoiceCustomer.customerName}
                  onChange={(event) =>
                    setInvoiceCustomer((current) => ({ ...current, customerName: event.target.value }))
                  }
                />
              </label>
              <label>
                Customer phone
                <input
                  value={invoiceCustomer.customerPhone}
                  onChange={(event) =>
                    setInvoiceCustomer((current) => ({ ...current, customerPhone: event.target.value }))
                  }
                />
              </label>
            </div>
            <div className="invoice-list">
              {menuItems.map((item) => (
                <label key={item.id} className="invoice-row">
                  <span>
                    {item.name}
                    <small>{item.category}</small>
                  </span>
                  <span>RM {Number(item.price).toFixed(2)}</span>
                  <input
                    type="number"
                    min="0"
                    value={itemQuantities[item.id] ?? 0}
                    onChange={(event) =>
                      setItemQuantities((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="action-row">
              <label className="checkbox-chip">
                <input
                  type="checkbox"
                  checked={invoiceOptions.submitToLhdn}
                  onChange={(event) =>
                    setInvoiceOptions((current) => ({ ...current, submitToLhdn: event.target.checked }))
                  }
                />
                <span>Submit to LHDN</span>
              </label>
              <label className="checkbox-chip">
                <input
                  type="checkbox"
                  checked={invoiceOptions.sendWhatsappConfirmation}
                  onChange={(event) =>
                    setInvoiceOptions((current) => ({
                      ...current,
                      sendWhatsappConfirmation: event.target.checked,
                    }))
                  }
                />
                <span>Send WhatsApp confirmation</span>
              </label>
            </div>
            <div className="pill-row">
              <span className="pill">{credentialSummary.hasLhdnCredentials ? 'LHDN ready' : 'LHDN required'}</span>
              <span className="pill">
                {credentialSummary.hasWhatsAppCredentials ? 'WhatsApp ready' : 'WhatsApp required for confirmations'}
              </span>
            </div>
            <div className="action-row">
              <button className="primary" type="submit" disabled={!canSubmitInvoice}>
                Send first invoice
              </button>
              <button className="secondary" type="button" onClick={executeWorkflow} disabled={!activeBusiness}>
                Execute sample workflow
              </button>
            </div>
            {activeBusiness?.invoices?.length ? (
              <div className="pill-row">
                <span className="pill">
                  Last LHDN status: {activeBusiness.invoices.at(-1)?.lhdn?.status ?? 'pending'}
                </span>
                <span className="pill">
                  UUID: {activeBusiness.invoices.at(-1)?.lhdn?.uuid ?? 'Pending'}
                </span>
              </div>
            ) : null}
          </form>
        </section>

        <aside className="panel stack">
          <div className="section-heading">
            <h2>Metrics dashboard</h2>
            <p>Real metrics computed from stored events, not hard-coded mock numbers.</p>
          </div>

          <div className="metrics-grid">
            <MetricCard label="Signups" value={dashboard?.headline?.signups ?? 0} />
            <MetricCard label="Activation rate" value={`${dashboard?.headline?.activationRate ?? 0}%`} />
            <MetricCard
              label="Time to activation"
              value={
                dashboard?.headline?.timeToActivationMinutes == null
                  ? 'Pending'
                  : `${dashboard.headline.timeToActivationMinutes} min`
              }
            />
            <MetricCard
              label="CAC"
              value={dashboard?.headline?.cac == null ? 'Pending' : `RM ${dashboard.headline.cac}`}
            />
            <MetricCard label="Invoices" value={dashboard?.headline?.invoicesIssued ?? 0} />
            <MetricCard label="Revenue" value={`RM ${dashboard?.headline?.revenue ?? 0}`} />
          </div>

          <div className="card stack">
            <div className="card-header">
              <h3>Completion rates</h3>
              <p>Track drop-off across the activation flow.</p>
            </div>
            {dashboard?.completionRates?.map((rate) => (
              <div key={rate.stepId} className="rate-row">
                <span>{rate.label}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${rate.completionRate}%` }} />
                </div>
                <strong>{rate.completionRate}%</strong>
              </div>
            ))}
          </div>

          <form className="card stack" onSubmit={saveAcquisitionHook}>
            <div className="card-header">
              <h3>CAC tracking hooks</h3>
              <p>Add spend snapshots that feed CAC and acquisition visibility.</p>
            </div>
            <div className="form-grid">
              <label>
                Channel
                <input
                  value={acquisitionHook.channel}
                  onChange={(event) => setAcquisitionHook((current) => ({ ...current, channel: event.target.value }))}
                />
              </label>
              <label>
                Spend
                <input
                  type="number"
                  min="0"
                  value={acquisitionHook.spend}
                  onChange={(event) => setAcquisitionHook((current) => ({ ...current, spend: event.target.value }))}
                />
              </label>
              <label>
                Leads
                <input
                  type="number"
                  min="0"
                  value={acquisitionHook.leads}
                  onChange={(event) => setAcquisitionHook((current) => ({ ...current, leads: event.target.value }))}
                />
              </label>
              <label>
                Customers
                <input
                  type="number"
                  min="0"
                  value={acquisitionHook.customers}
                  onChange={(event) =>
                    setAcquisitionHook((current) => ({ ...current, customers: event.target.value }))
                  }
                />
              </label>
            </div>
            <button className="primary" type="submit">
              Save acquisition hook
            </button>
          </form>

          <div className="card stack">
            <div className="card-header">
              <h3>Execution log</h3>
              <p>Every system action is persisted so we can validate the journey.</p>
            </div>
            <div className="log-list">
              {dashboard?.recentLogs?.map((entry) => (
                <div key={entry.id} className="log-entry">
                  <div>
                    <strong>{entry.action}</strong>
                    <p>{new Date(entry.timestamp).toLocaleString()}</p>
                  </div>
                  <code>{JSON.stringify(entry.details)}</code>
                </div>
              )) ?? <p>No actions yet.</p>}
            </div>
          </div>

          <div className="card stack">
            <div className="card-header">
              <h3>Activation contract</h3>
            </div>
            <p>{appState?.activationDefinition?.description}</p>
          </div>

          <div className="card stack">
            <div className="card-header">
              <h3>Activation Intelligence</h3>
              <p>Closed-loop analysis: behavior → insights → executable tasks.</p>
            </div>
            <div className="action-row" style={{ justifyContent: 'flex-start', marginBottom: '1rem' }}>
              <button className="primary" type="button" onClick={loadIntelligenceReport}>
                Generate intelligence report
              </button>
              {intelligenceReport ? (
                <button className="secondary" type="button" onClick={runInterventions}>
                  Trigger automated interventions
                </button>
              ) : null}
            </div>
            {intelligenceReport ? (
              <IntelligencePanel 
                report={intelligenceReport} 
                onApplyOptimization={applyCodexTask}
              />
            ) : null}
          </div>
        </aside>
      </main>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CredentialFeedback({ title, status }) {
  if (!status.message && !status.details) {
    return null;
  }

  return (
    <div className={`card stack ${status.success ? '' : 'error'}`}>
      <strong>{title}</strong>
      <span>{status.message}</span>
      {status.details ? <small>{status.details}</small> : null}
    </div>
  );
}

function IntelligencePanel({ report, onApplyOptimization }) {
  const { funnel, activationSummary, frictionHotspots, behavioralClusters, optimizations, executionPayload, impacts } = report;

  return (
    <div className="stack intel-panel">
      <div className="intel-section">
        <strong className="intel-heading">Activation funnel</strong>
        <div className="intel-meta">
          {funnel.totalBusinesses} businesses - {(activationSummary?.rate * 100 || 0).toFixed(0)}% activation rate
        </div>
        {funnel.steps?.map((step) => (
          <div key={step.step} className="rate-row">
            <span>{step.step.replace(/_/g, ' ')}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(step.rate * 100).toFixed(0)}%` }} />
            </div>
            <strong>{(step.rate * 100).toFixed(0)}%</strong>
          </div>
        ))}
        {report.timeToActivation ? (
          <div className="pill-row">
            <span className="pill">P50: {report.timeToActivation.p50}</span>
            <span className="pill">P95: {report.timeToActivation.p95}</span>
          </div>
        ) : null}
      </div>

      {frictionHotspots?.length > 0 ? (
        <div className="intel-section">
          <strong className="intel-heading">Friction hotspots ({frictionHotspots.length})</strong>
          {frictionHotspots.slice(0, 6).map((hotspot, index) => (
            <div key={index} className={`intel-item ${hotspot.severity}`}>
              <span className="intel-tag">{hotspot.severity}</span>
              <span>{hotspot.type.replace(/_/g, ' ')}</span>
              <small>{hotspot.businessName}</small>
            </div>
          ))}
        </div>
      ) : null}

      <div className="intel-section">
        <strong className="intel-heading">Behavioral clusters</strong>
        <div className="metrics-grid">
          {Object.entries(behavioralClusters || {}).map(([name, summary]) => (
            <div key={name} className="metric-card">
              <span>{name.replace(/([A-Z])/g, ' $1').trim()}</span>
              <strong>{summary.count}</strong>
              {summary.avgTimeToActivationMinutes != null ? (
                <small>{summary.avgTimeToActivationMinutes}m avg</small>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {optimizations?.length > 0 ? (
        <div className="intel-section">
          <strong className="intel-heading">Recommendations ({optimizations.length})</strong>
          {optimizations.map((opt, index) => (
            <div key={index} className={`intel-item ${opt.priority === 'P0' ? 'critical' : opt.priority === 'P1' ? 'warning' : ''}`}>
              <div className="intel-item-header">
                <span className="intel-tag">{opt.priority}</span>
                <span className="intel-tag">{opt.category}</span>
                <span className="intel-confidence">{(opt.confidence * 100).toFixed(0)}% confidence</span>
              </div>
              <span>{opt.action}</span>
              <small>{opt.expectedImpact}</small>
              {opt.basedOn?.length > 0 ? (
                <div className="intel-signals">
                  {opt.basedOn.map((signal, si) => (
                    <span key={si} className="pill">{signal}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {executionPayload?.codexTasks?.length > 0 ? (
        <div className="intel-section">
          <strong className="intel-heading">Codex execution tasks ({executionPayload.codexTasks.length})</strong>
          {executionPayload.codexTasks.map((task, index) => (
            <div key={index} className={`intel-item ${task.status === 'applied' ? 'applied' : task.priority === 'P0' ? 'critical' : task.priority === 'P1' ? 'warning' : ''}`}>
              <div className="intel-item-header">
                <span className="intel-tag">{task.priority}</span>
                <strong>{task.title}</strong>
                {['applied', 'validated', 'reinforced'].includes(task.status) ? (
                  <span className="intel-tag success">{task.status.charAt(0).toUpperCase() + task.status.slice(1)}</span>
                ) : task.status === 'deprecated' ? (
                  <span className="intel-tag warning">Deprecated (Rolled back)</span>
                ) : (
                  <button className="secondary small" type="button" onClick={() => onApplyOptimization(task)}>
                    Mark Applied
                  </button>
                )}
              </div>
              <span>{task.change}</span>
              <div className="pill-row">
                {task.files.map((file) => (
                  <span key={file} className="pill">{file}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {executionPayload?.priorityFixes?.length > 0 ? (
        <div className="intel-section">
          <strong className="intel-heading">Priority fixes</strong>
          {executionPayload.priorityFixes.map((fix, index) => (
            <div key={index} className="intel-item critical">
              <strong>{fix.issue}</strong>
              <span>{fix.impact}</span>
              <small>Fix: {fix.fix}</small>
            </div>
          ))}
        </div>
      ) : null}

      {executionPayload?.instrumentationGaps?.length > 0 ? (
        <div className="intel-section">
          <strong className="intel-heading">Instrumentation gaps</strong>
          {executionPayload.instrumentationGaps.map((gap, index) => (
            <div key={index} className="intel-item">
              <div className="intel-item-header">
                <span className="intel-tag">{gap.priority}</span>
                <code>{gap.missingEvent}</code>
              </div>
              <small>{gap.reason}</small>
            </div>
          ))}
        </div>
      ) : null}

      {impacts?.length > 0 ? (
        <div className="intel-section">
          <strong className="intel-heading">Optimization Impacts ({impacts.length})</strong>
          {impacts.map((impact, index) => (
            <div key={index} className="intel-item success">
              <div className="intel-item-header">
                <span className={`intel-tag ${['applied', 'validated', 'reinforced'].includes(impact.state) ? 'success' : 'warning'}`}>{impact.state.charAt(0).toUpperCase() + impact.state.slice(1)}</span>
                <strong>{impact.optimizationId}</strong>
                <span className="intel-confidence">{(impact.confidence * 100).toFixed(0)}% confidence</span>
                <span className="intel-meta">Applied: {new Date(impact.appliedAt).toLocaleDateString()}</span>
              </div>
              <div className="metrics-grid" style={{ marginTop: '0.5rem' }}>
                <MetricCard label={`Before (n=${impact.before.total})`} value={`${(impact.before.activationRate * 100).toFixed(1)}%`} />
                <MetricCard label={`After (n=${impact.after.total})`} value={`${(impact.after.activationRate * 100).toFixed(1)}%`} />
                <MetricCard label="Relative Delta" value={`${impact.relativeImprovement > 0 ? '+' : ''}${(impact.relativeImprovement * 100).toFixed(1)}%`} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <small className="intel-meta">Generated: {new Date(report.generatedAt).toLocaleString()}</small>
    </div>
  );
}
