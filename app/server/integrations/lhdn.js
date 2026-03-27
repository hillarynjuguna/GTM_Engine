import crypto from 'node:crypto';

const DEFAULT_API_BASE_URL = 'https://preprod-api.myinvois.hasil.gov.my';
const DEFAULT_IDENTITY_BASE_URL = 'https://preprod-api.myinvois.hasil.gov.my';
const DEFAULT_GENERAL_BUYER_TIN = 'EI00000000010';

let authCache = {
  cacheKey: '',
  accessToken: '',
  expiresAt: 0,
};

export function getLhdnConfig({ credentials = {}, overrides = {} } = {}) {
  const apiBaseUrl = stripTrailingSlash(overrides.apiBaseUrl || process.env.LHDN_API_BASE_URL || DEFAULT_API_BASE_URL);
  const identityBaseUrl = stripTrailingSlash(
    overrides.identityBaseUrl || process.env.LHDN_IDENTITY_BASE_URL || DEFAULT_IDENTITY_BASE_URL,
  );

  return {
    apiBaseUrl,
    identityBaseUrl,
    clientId: overrides.clientId || credentials.lhdnClientId || '',
    clientSecret: overrides.clientSecret || credentials.lhdnClientSecret || '',
    scope: overrides.scope || process.env.LHDN_SCOPE || '',
    defaultBuyerTin: process.env.LHDN_DEFAULT_BUYER_TIN || DEFAULT_GENERAL_BUYER_TIN,
    supplierAddressLine1: process.env.LHDN_SUPPLIER_ADDRESS_LINE1 || 'Lot 66',
    supplierAddressLine2: process.env.LHDN_SUPPLIER_ADDRESS_LINE2 || 'Bangunan Merdeka',
    supplierAddressLine3: process.env.LHDN_SUPPLIER_ADDRESS_LINE3 || 'Persiaran Jaya',
    supplierCity: process.env.LHDN_SUPPLIER_CITY || 'Kuala Lumpur',
    supplierPostcode: process.env.LHDN_SUPPLIER_POSTCODE || '50480',
    supplierStateCode: process.env.LHDN_SUPPLIER_STATE_CODE || '10',
    supplierCountryCode: process.env.LHDN_SUPPLIER_COUNTRY_CODE || 'MYS',
    supplierMsicName:
      process.env.LHDN_SUPPLIER_MSIC_NAME || 'Restaurants and mobile food service activities',
    documentVersion: process.env.LHDN_DOCUMENT_VERSION || '1.0',
  };
}

export async function submitInvoiceToLhdn({
  invoice,
  business,
  credentials,
  fetchImpl = fetch,
  config = getLhdnConfig({ credentials }),
}) {
  assertCredentials(config);
  const accessToken = await getAccessToken({ fetchImpl, config });
  const invoiceDocument = buildLhdnInvoiceDocument({ invoice, business, config });
  const serializedDocument = JSON.stringify(invoiceDocument);
  const document = Buffer.from(serializedDocument, 'utf8').toString('base64');
  const documentHash = crypto.createHash('sha256').update(serializedDocument).digest('base64');

  const response = await fetchImpl(`${config.apiBaseUrl}/api/v1.0/documentsubmissions/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      documents: [
        {
          format: 'JSON',
          document,
          documentHash,
          codeNumber: invoice.invoiceNumber,
        },
      ],
    }),
  });

  const responseText = await response.text();
  const responseBody = parseMaybeJson(responseText);

  if (!response.ok) {
    throw createIntegrationError('LHDN submit failed.', response.status, responseBody || responseText);
  }

  const acceptedDocument = responseBody?.acceptedDocuments?.[0] ?? null;
  if (!acceptedDocument?.uuid) {
    throw createIntegrationError(
      'LHDN submit did not return an accepted document UUID.',
      response.status,
      responseBody || responseText,
    );
  }

  return {
    responseStatus: response.status,
    submissionUid: responseBody.submissionUID || responseBody.submissionUid || null,
    uuid: acceptedDocument.uuid,
    acceptedDocuments: responseBody.acceptedDocuments ?? [],
    rejectedDocuments: responseBody.rejectedDocuments ?? [],
    rawResponse: responseBody || responseText,
    submittedDocument: invoiceDocument,
  };
}

export async function testLhdnCredentials({
  credentials,
  fetchImpl = fetch,
  config = getLhdnConfig({ credentials }),
}) {
  assertCredentials(config);
  const accessToken = await getAccessToken({ fetchImpl, config });

  return {
    ok: true,
    apiBaseUrl: config.apiBaseUrl,
    identityBaseUrl: config.identityBaseUrl,
    tokenPreview: accessToken.slice(0, 12),
  };
}

export function buildLhdnInvoiceDocument({ invoice, business, config }) {
  const issueDate = invoice.issuedAt.slice(0, 10);
  const issueTime = new Date(invoice.issuedAt).toISOString().slice(11, 19) + 'Z';
  const profile = business.profile;
  const buyerTin = invoice.buyer?.tinNumber || config.defaultBuyerTin;
  const buyerName = invoice.buyer?.name || 'General Public';
  const buyerPhone = invoice.buyer?.phone || 'NA';
  const buyerEmail = invoice.buyer?.email || 'NA';
  const taxPercent = invoice.totals.subtotal > 0 ? Number(((invoice.totals.taxTotal / invoice.totals.subtotal) * 100).toFixed(2)) : 0;

  return {
    _D: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    _A: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    _B: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    Invoice: [
      {
        ID: [{ _: invoice.invoiceNumber }],
        IssueDate: [{ _: issueDate }],
        IssueTime: [{ _: issueTime }],
        InvoiceTypeCode: [{ _: '01', listVersionID: config.documentVersion }],
        DocumentCurrencyCode: [{ _: 'MYR' }],
        TaxCurrencyCode: [{ _: 'MYR' }],
        AccountingSupplierParty: [
          {
            Party: [
              {
                IndustryClassificationCode: [
                  {
                    _: profile.msicCode || invoiceMsic(profile),
                    name: config.supplierMsicName,
                  },
                ],
                PartyIdentification: [
                  { ID: [{ _: profile.tinNumber || 'PENDING_TIN', schemeID: 'TIN' }] },
                  { ID: [{ _: profile.registrationNumber || 'PENDING_BRN', schemeID: 'BRN' }] },
                  { ID: [{ _: profile.sstNumber || 'NA', schemeID: 'SST' }] },
                  { ID: [{ _: 'NA', schemeID: 'TTX' }] },
                ],
                PostalAddress: [
                  {
                    CityName: [{ _: profile.city || config.supplierCity }],
                    PostalZone: [{ _: profile.postcode || config.supplierPostcode }],
                    CountrySubentityCode: [{ _: profile.stateCode || config.supplierStateCode }],
                    AddressLine: [
                      { Line: [{ _: profile.addressLine1 || config.supplierAddressLine1 }] },
                      { Line: [{ _: profile.addressLine2 || config.supplierAddressLine2 }] },
                      { Line: [{ _: profile.addressLine3 || config.supplierAddressLine3 }] },
                    ],
                    Country: [
                      {
                        IdentificationCode: [
                          {
                            _: profile.countryCode || config.supplierCountryCode,
                            listID: 'ISO3166-1',
                            listAgencyID: '6',
                          },
                        ],
                      },
                    ],
                  },
                ],
                PartyLegalEntity: [{ RegistrationName: [{ _: profile.businessName }] }],
                Contact: [
                  {
                    Telephone: [{ _: profile.phone }],
                    ElectronicMail: [{ _: profile.email }],
                  },
                ],
              },
            ],
          },
        ],
        AccountingCustomerParty: [
          {
            Party: [
              {
                PostalAddress: [
                  {
                    CityName: [{ _: '' }],
                    PostalZone: [{ _: '' }],
                    CountrySubentityCode: [{ _: '' }],
                    AddressLine: [{ Line: [{ _: 'NA' }] }, { Line: [{ _: '' }] }, { Line: [{ _: '' }] }],
                    Country: [
                      {
                        IdentificationCode: [{ _: '', listID: 'ISO3166-1', listAgencyID: '6' }],
                      },
                    ],
                  },
                ],
                PartyLegalEntity: [{ RegistrationName: [{ _: buyerName }] }],
                PartyIdentification: [
                  { ID: [{ _: buyerTin, schemeID: 'TIN' }] },
                  { ID: [{ _: 'NA', schemeID: 'BRN' }] },
                  { ID: [{ _: 'NA', schemeID: 'SST' }] },
                  { ID: [{ _: 'NA', schemeID: 'TTX' }] },
                ],
                Contact: [
                  {
                    Telephone: [{ _: buyerPhone }],
                    ElectronicMail: [{ _: buyerEmail }],
                  },
                ],
              },
            ],
          },
        ],
        TaxTotal: [
          {
            TaxAmount: [{ _: invoice.totals.taxTotal, currencyID: 'MYR' }],
            TaxSubtotal: [
              {
                TaxableAmount: [{ _: invoice.totals.subtotal, currencyID: 'MYR' }],
                TaxAmount: [{ _: invoice.totals.taxTotal, currencyID: 'MYR' }],
                TaxCategory: [
                  {
                    ID: [{ _: taxPercent > 0 ? '01' : 'E' }],
                    TaxScheme: [{ ID: [{ _: 'OTH', schemeID: 'UN/ECE 5153', schemeAgencyID: '6' }] }],
                  },
                ],
              },
            ],
          },
        ],
        LegalMonetaryTotal: [
          {
            LineExtensionAmount: [{ _: invoice.totals.subtotal, currencyID: 'MYR' }],
            TaxExclusiveAmount: [{ _: invoice.totals.subtotal, currencyID: 'MYR' }],
            TaxInclusiveAmount: [{ _: invoice.totals.grandTotal, currencyID: 'MYR' }],
            PayableAmount: [{ _: invoice.totals.grandTotal, currencyID: 'MYR' }],
          },
        ],
        InvoiceLine: invoice.items.map((item, index) => ({
          ID: [{ _: String(index + 1) }],
          InvoicedQuantity: [{ _: item.quantity, unitCode: 'C62' }],
          LineExtensionAmount: [{ _: item.subtotal, currencyID: 'MYR' }],
          TaxTotal: [
            {
              TaxAmount: [{ _: Number((item.subtotal * (taxPercent / 100)).toFixed(2)), currencyID: 'MYR' }],
              TaxSubtotal: [
                {
                  TaxableAmount: [{ _: item.subtotal, currencyID: 'MYR' }],
                  TaxAmount: [{ _: Number((item.subtotal * (taxPercent / 100)).toFixed(2)), currencyID: 'MYR' }],
                  Percent: [{ _: taxPercent }],
                  TaxCategory: [
                    {
                      ID: [{ _: taxPercent > 0 ? '01' : 'E' }],
                      TaxScheme: [{ ID: [{ _: 'OTH', schemeID: 'UN/ECE 5153', schemeAgencyID: '6' }] }],
                    },
                  ],
                },
              ],
            },
          ],
          Item: [
            {
              CommodityClassification: [{ ItemClassificationCode: [{ _: '004', listID: 'CLASS' }] }],
              Description: [{ _: item.name }],
              OriginCountry: [{ IdentificationCode: [{ _: 'MYS' }] }],
            },
          ],
          Price: [{ PriceAmount: [{ _: item.unitPrice, currencyID: 'MYR' }] }],
          ItemPriceExtension: [{ Amount: [{ _: item.subtotal, currencyID: 'MYR' }] }],
        })),
      },
    ],
  };
}

async function getAccessToken({ fetchImpl, config }) {
  const cacheKey = `${config.identityBaseUrl}:${config.clientId}`;
  const now = Date.now();
  if (authCache.cacheKey === cacheKey && authCache.accessToken && authCache.expiresAt > now + 30_000) {
    return authCache.accessToken;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'client_credentials',
  });

  if (config.scope) {
    body.set('scope', config.scope);
  }

  const response = await fetchImpl(`${config.identityBaseUrl}/connect/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  const responseText = await response.text();
  const responseBody = parseMaybeJson(responseText);

  if (!response.ok || !responseBody?.access_token) {
    throw createIntegrationError('LHDN authentication failed.', response.status, responseBody || responseText);
  }

  authCache = {
    cacheKey,
    accessToken: responseBody.access_token,
    expiresAt: now + Number(responseBody.expires_in || 3600) * 1000,
  };

  return authCache.accessToken;
}

function assertCredentials(config) {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Missing LHDN sandbox credentials for this business. Validate and save them first.');
  }
}

function invoiceMsic(profile) {
  if (profile.businessType === 'Bakeri / Kek') {
    return '10710';
  }
  if (profile.businessType === 'Catering') {
    return '56210';
  }
  return '56101';
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function parseMaybeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function createIntegrationError(message, status, payload) {
  const error = new Error(message);
  error.status = status;
  error.payload = payload;
  return error;
}
