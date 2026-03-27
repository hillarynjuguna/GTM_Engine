import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createInitialState } from './domain.js';

const defaultPath = path.join(process.cwd(), 'server', 'runtime', 'state.db');
const legacyJsonPath = path.join(process.cwd(), 'server', 'runtime', 'state.json');
const defaultEncryptionKeyPath = path.join(process.cwd(), 'server', 'runtime', 'credentials.key');
export function createSqliteStore(filePath = defaultPath) {
  ensureDirectory(filePath);

  const database = new DatabaseSync(filePath);
  database.exec('PRAGMA journal_mode = WAL;');
  createSchema(database);
  const encryptionKey = resolveEncryptionKey();
  const writeStateTransaction = createWriteStateTransaction(database);
  const clearStateTransaction = createClearStateTransaction(database);
  importLegacyStateIfNeeded(database, writeStateTransaction);

  return {
    path: filePath,
    read() {
      return readState(database);
    },
    write(state) {
      writeStateTransaction(state);
      return state;
    },
    update(updater) {
      const current = readState(database);
      const nextState = updater(current) ?? current;
      writeStateTransaction(nextState);
      return nextState;
    },
    reset(nextState = createInitialState()) {
      clearStateTransaction();
      writeStateTransaction(nextState);
      return nextState;
    },
    getCredentials(businessId) {
      return readCredentials(database, encryptionKey, businessId);
    },
    getCredentialSummary(businessId) {
      return summarizeCredentialRow(readCredentialRow(database, businessId), encryptionKey);
    },
    saveCredentials(businessId, credentials) {
      saveCredentials(database, encryptionKey, businessId, credentials);
      return summarizeCredentialRow(readCredentialRow(database, businessId), encryptionKey);
    },
    findBusinessIdByWhatsAppPhoneNumberId(phoneNumberId) {
      if (!phoneNumberId) {
        return null;
      }

      for (const row of database.prepare('SELECT business_id, whatsapp_phone_number_id FROM credentials').all()) {
        if (decryptSecret(encryptionKey, row.whatsapp_phone_number_id) === phoneNumberId) {
          return row.business_id;
        }
      }

      return null;
    },
    findBusinessIdByWhatsAppVerifyToken(verifyToken) {
      if (!verifyToken) {
        return null;
      }

      for (const row of database.prepare('SELECT business_id, whatsapp_verify_token FROM credentials').all()) {
        if (decryptSecret(encryptionKey, row.whatsapp_verify_token) === verifyToken) {
          return row.business_id;
        }
      }

      return null;
    },
  };
}

export const createFileStore = createSqliteStore;

function createSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      activation_at TEXT,
      onboarding_state TEXT NOT NULL,
      completed_steps_json TEXT NOT NULL,
      profile_json TEXT NOT NULL,
      templates_json TEXT NOT NULL,
      menu_items_json TEXT NOT NULL,
      whatsapp_json TEXT NOT NULL,
      workflows_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      invoice_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      properties_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      details_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL UNIQUE,
      lhdn_client_id TEXT NOT NULL,
      lhdn_client_secret TEXT NOT NULL,
      whatsapp_access_token TEXT NOT NULL,
      whatsapp_phone_number_id TEXT NOT NULL,
      whatsapp_verify_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );
  `);
}

function createWriteStateTransaction(database) {
  return (state) => {
    const credentialRows = database.prepare('SELECT * FROM credentials').all();
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(`
        DELETE FROM invoices;
        DELETE FROM events;
        DELETE FROM logs;
        DELETE FROM businesses;
        DELETE FROM meta;
      `);

      const insertBusiness = database.prepare(`
        INSERT INTO businesses (
          id, created_at, updated_at, activation_at, onboarding_state, completed_steps_json,
          profile_json, templates_json, menu_items_json, whatsapp_json, workflows_json
        ) VALUES (
          @id, @created_at, @updated_at, @activation_at, @onboarding_state, @completed_steps_json,
          @profile_json, @templates_json, @menu_items_json, @whatsapp_json, @workflows_json
        )
      `);

      const insertInvoice = database.prepare(`
        INSERT INTO invoices (id, business_id, invoice_number, issued_at, invoice_json)
        VALUES (@id, @business_id, @invoice_number, @issued_at, @invoice_json)
      `);

      const insertEvent = database.prepare(`
        INSERT INTO events (id, business_id, event_name, timestamp, properties_json)
        VALUES (@id, @business_id, @event_name, @timestamp, @properties_json)
      `);

      const insertLog = database.prepare(`
        INSERT INTO logs (id, action, timestamp, details_json)
        VALUES (@id, @action, @timestamp, @details_json)
      `);

      const insertMeta = database.prepare(`
        INSERT INTO meta (key, value_json)
        VALUES (@key, @value_json)
      `);

      const insertCredential = database.prepare(`
        INSERT INTO credentials (
          id,
          business_id,
          lhdn_client_id,
          lhdn_client_secret,
          whatsapp_access_token,
          whatsapp_phone_number_id,
          whatsapp_verify_token,
          created_at
        ) VALUES (
          @id,
          @business_id,
          @lhdn_client_id,
          @lhdn_client_secret,
          @whatsapp_access_token,
          @whatsapp_phone_number_id,
          @whatsapp_verify_token,
          @created_at
        )
      `);

      for (const business of state.businesses) {
        insertBusiness.run({
          id: business.id,
          created_at: business.createdAt,
          updated_at: business.updatedAt,
          activation_at: business.activationAt,
          onboarding_state: business.onboardingState,
          completed_steps_json: JSON.stringify(business.completedSteps ?? []),
          profile_json: JSON.stringify(business.profile ?? {}),
          templates_json: JSON.stringify(business.templates ?? {}),
          menu_items_json: JSON.stringify(business.menuItems ?? []),
          whatsapp_json: JSON.stringify(business.whatsapp ?? {}),
          workflows_json: JSON.stringify(business.workflows ?? []),
        });

        for (const invoice of business.invoices ?? []) {
          insertInvoice.run({
            id: invoice.id,
            business_id: business.id,
            invoice_number: invoice.invoiceNumber,
            issued_at: invoice.issuedAt,
            invoice_json: JSON.stringify(invoice),
          });
        }

        for (const event of business.events ?? []) {
          insertEvent.run({
            id: event.id,
            business_id: business.id,
            event_name: event.event,
            timestamp: event.timestamp,
            properties_json: JSON.stringify(event.properties ?? {}),
          });
        }
      }

      for (const log of state.logs ?? []) {
        insertLog.run({
          id: log.id,
          action: log.action,
          timestamp: log.timestamp,
          details_json: JSON.stringify(log.details ?? {}),
        });
      }

      insertMeta.run({
        key: 'activeBusinessId',
        value_json: JSON.stringify(state.activeBusinessId ?? null),
      });
      insertMeta.run({
        key: 'acquisitionHooks',
        value_json: JSON.stringify(state.acquisitionHooks ?? []),
      });
      insertMeta.run({
        key: 'appliedOptimizations',
        value_json: JSON.stringify(state.appliedOptimizations ?? []),
      });
      insertMeta.run({
        key: 'interventions',
        value_json: JSON.stringify(state.interventions ?? []),
      });

      const businessIds = new Set(state.businesses.map((business) => business.id));
      for (const credentialRow of credentialRows) {
        if (businessIds.has(credentialRow.business_id)) {
          insertCredential.run(credentialRow);
        }
      }

      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  };
}

function createClearStateTransaction(database) {
  return () => {
    database.exec(`
      DELETE FROM credentials;
      DELETE FROM invoices;
      DELETE FROM events;
      DELETE FROM logs;
      DELETE FROM businesses;
      DELETE FROM meta;
    `);
  };
}

function readState(database) {
  const businesses = database.prepare('SELECT * FROM businesses ORDER BY created_at ASC').all();
  const invoices = database.prepare('SELECT * FROM invoices').all();
  const events = database.prepare('SELECT * FROM events').all();
  const logs = database.prepare('SELECT * FROM logs ORDER BY timestamp DESC').all();
  const metaRows = database.prepare('SELECT key, value_json FROM meta').all();
  const meta = Object.fromEntries(metaRows.map((row) => [row.key, safeParse(row.value_json)]));

  return {
    version: 1,
    activeBusinessId: meta.activeBusinessId ?? null,
    acquisitionHooks: meta.acquisitionHooks ?? [],
    appliedOptimizations: meta.appliedOptimizations ?? [],
    interventions: meta.interventions ?? [],
    logs: logs.map((log) => ({
      id: log.id,
      action: log.action,
      timestamp: log.timestamp,
      details: safeParse(log.details_json),
    })),
    businesses: businesses.map((business) => ({
      id: business.id,
      createdAt: business.created_at,
      updatedAt: business.updated_at,
      activationAt: business.activation_at,
      onboardingState: business.onboarding_state,
      completedSteps: safeParse(business.completed_steps_json),
      profile: safeParse(business.profile_json),
      templates: safeParse(business.templates_json),
      menuItems: safeParse(business.menu_items_json),
      whatsapp: safeParse(business.whatsapp_json),
      workflows: safeParse(business.workflows_json),
      invoices: invoices
        .filter((invoice) => invoice.business_id === business.id)
        .map((invoice) => safeParse(invoice.invoice_json)),
      events: events
        .filter((event) => event.business_id === business.id)
        .map((event) => ({
          id: event.id,
          event: event.event_name,
          timestamp: event.timestamp,
          properties: safeParse(event.properties_json),
        })),
    })),
  };
}

function readCredentials(database, encryptionKey, businessId) {
  const row = readCredentialRow(database, businessId);
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    businessId: row.business_id,
    lhdnClientId: decryptSecret(encryptionKey, row.lhdn_client_id),
    lhdnClientSecret: decryptSecret(encryptionKey, row.lhdn_client_secret),
    whatsappAccessToken: decryptSecret(encryptionKey, row.whatsapp_access_token),
    whatsappPhoneNumberId: decryptSecret(encryptionKey, row.whatsapp_phone_number_id),
    whatsappVerifyToken: decryptSecret(encryptionKey, row.whatsapp_verify_token),
    createdAt: row.created_at,
  };
}

function readCredentialRow(database, businessId) {
  return (
    database
      .prepare(
        `
          SELECT *
          FROM credentials
          WHERE business_id = ?
          LIMIT 1
        `,
      )
      .get(businessId) ?? null
  );
}

function saveCredentials(database, encryptionKey, businessId, credentials) {
  const now = new Date().toISOString();
  const existingRow = readCredentialRow(database, businessId);
  const encrypted = {
    id: existingRow?.id || `cred_${crypto.randomUUID()}`,
    business_id: businessId,
    lhdn_client_id: encryptSecret(encryptionKey, credentials.lhdnClientId),
    lhdn_client_secret: encryptSecret(encryptionKey, credentials.lhdnClientSecret),
    whatsapp_access_token: encryptSecret(encryptionKey, credentials.whatsappAccessToken),
    whatsapp_phone_number_id: encryptSecret(encryptionKey, credentials.whatsappPhoneNumberId),
    whatsapp_verify_token: encryptSecret(encryptionKey, credentials.whatsappVerifyToken),
    created_at: existingRow?.created_at || now,
  };

  database
    .prepare(
      `
        INSERT INTO credentials (
          id,
          business_id,
          lhdn_client_id,
          lhdn_client_secret,
          whatsapp_access_token,
          whatsapp_phone_number_id,
          whatsapp_verify_token,
          created_at
        ) VALUES (
          @id,
          @business_id,
          @lhdn_client_id,
          @lhdn_client_secret,
          @whatsapp_access_token,
          @whatsapp_phone_number_id,
          @whatsapp_verify_token,
          @created_at
        )
        ON CONFLICT(business_id) DO UPDATE SET
          lhdn_client_id = excluded.lhdn_client_id,
          lhdn_client_secret = excluded.lhdn_client_secret,
          whatsapp_access_token = excluded.whatsapp_access_token,
          whatsapp_phone_number_id = excluded.whatsapp_phone_number_id,
          whatsapp_verify_token = excluded.whatsapp_verify_token
      `,
    )
    .run(encrypted);
}

function summarizeCredentialRow(row, encryptionKey) {
  if (!row) {
    return {
      hasLhdnCredentials: false,
      hasWhatsAppCredentials: false,
      createdAt: null,
      lhdnClientIdMasked: '',
      whatsappPhoneNumberIdMasked: '',
    };
  }

  return {
    hasLhdnCredentials: Boolean(row.lhdn_client_id && row.lhdn_client_secret),
    hasWhatsAppCredentials: Boolean(
      row.whatsapp_access_token && row.whatsapp_phone_number_id && row.whatsapp_verify_token,
    ),
    createdAt: row.created_at,
    lhdnClientIdMasked: maskSecret(decryptSecret(encryptionKey, row.lhdn_client_id)),
    whatsappPhoneNumberIdMasked: maskSecret(decryptSecret(encryptionKey, row.whatsapp_phone_number_id)),
  };
}

function importLegacyStateIfNeeded(database, writeStateTransaction) {
  const businessCount = database.prepare('SELECT COUNT(*) AS count FROM businesses').get().count;
  if (businessCount > 0 || !fs.existsSync(legacyJsonPath)) {
    return;
  }
  const legacy = JSON.parse(fs.readFileSync(legacyJsonPath, 'utf8'));
  writeStateTransaction(legacy);
}

function resolveEncryptionKey() {
  if (process.env.APP_ENCRYPTION_KEY) {
    return normalizeEncryptionKey(process.env.APP_ENCRYPTION_KEY);
  }

  ensureDirectory(defaultEncryptionKeyPath);

  if (!fs.existsSync(defaultEncryptionKeyPath)) {
    fs.writeFileSync(defaultEncryptionKeyPath, crypto.randomBytes(32).toString('base64'));
  }

  return normalizeEncryptionKey(fs.readFileSync(defaultEncryptionKeyPath, 'utf8').trim());
}

function normalizeEncryptionKey(value) {
  const trimmed = value.trim();

  if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  const base64Buffer = Buffer.from(trimmed, 'base64');
  if (base64Buffer.length === 32) {
    return base64Buffer;
  }

  return crypto.createHash('sha256').update(trimmed).digest();
}

function encryptSecret(key, value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

function decryptSecret(key, value) {
  if (!value) {
    return '';
  }

  if (!value.startsWith('enc:')) {
    return value;
  }

  const payload = Buffer.from(value.slice(4), 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function maskSecret(value) {
  if (!value) {
    return '';
  }
  if (value.length <= 8) {
    return '********';
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
