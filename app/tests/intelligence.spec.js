import { describe, expect, it } from 'vitest';
import {
  analyzeActivation,
  analyzeOnboardingCompletion,
  clusterBehavior,
  deriveOptimizationLearningUpdates,
  detectFriction,
  generateIntelligenceReport,
  generateOptimizations,
  measureOptimizationImpact
} from '../server/intelligence.js';

const NOW = '2026-03-27T10:00:00.000Z';

function buildMockState() {
  const businesses = [
    // Fast activator — completed everything in 10 minutes
    buildBusiness({
      id: 'biz-fast',
      name: 'Kedai Cepat',
      createdAt: '2026-03-27T08:00:00.000Z',
      activationAt: '2026-03-27T08:10:00.000Z',
      onboardingState: 'ACTIVATED',
      completedSteps: ['business_profile', 'template_generation', 'data_import', 'whatsapp_connection', 'first_invoice'],
      events: [
        { event: 'signup_completed', timestamp: '2026-03-27T08:00:00.000Z' },
        { event: 'onboarding_started', timestamp: '2026-03-27T08:00:01.000Z' },
        { event: 'onboarding_step_completed', timestamp: '2026-03-27T08:01:00.000Z', properties: { step_name: 'business_profile' } },
        { event: 'CREDENTIAL_TEST_SUCCESS', timestamp: '2026-03-27T08:02:00.000Z', properties: { provider: 'lhdn' } },
        { event: 'CREDENTIAL_TEST_SUCCESS', timestamp: '2026-03-27T08:03:00.000Z', properties: { provider: 'whatsapp' } },
        { event: 'CREDENTIAL_SAVED', timestamp: '2026-03-27T08:03:30.000Z', properties: { providers: ['lhdn', 'whatsapp'] } },
        { event: 'onboarding_step_completed', timestamp: '2026-03-27T08:04:00.000Z', properties: { step_name: 'template_generation' } },
        { event: 'onboarding_step_completed', timestamp: '2026-03-27T08:06:00.000Z', properties: { step_name: 'data_import' } },
        { event: 'onboarding_step_completed', timestamp: '2026-03-27T08:07:00.000Z', properties: { step_name: 'whatsapp_connection' } },
        { event: 'LHDN_SUBMISSION_SUCCESS', timestamp: '2026-03-27T08:09:30.000Z', properties: { uuid: 'uuid-1' } },
        { event: 'WHATSAPP_MESSAGE_SENT', timestamp: '2026-03-27T08:09:45.000Z', properties: { to: '60123456789' } },
        { event: 'onboarding_step_completed', timestamp: '2026-03-27T08:10:00.000Z', properties: { step_name: 'first_invoice' } },
        { event: 'activation_qualified', timestamp: '2026-03-27T08:10:00.000Z', properties: {} },
      ],
      invoices: [{ id: 'inv-1', invoiceNumber: 'INV-001' }],
    }),

    // Non-activator with credential failures — dropped off during credential validation
    buildBusiness({
      id: 'biz-stuck',
      name: 'Gerai Lambat',
      createdAt: '2026-03-27T06:00:00.000Z',
      activationAt: null,
      onboardingState: 'BUSINESS_PROFILE_COMPLETED',
      completedSteps: ['business_profile'],
      events: [
        { event: 'signup_completed', timestamp: '2026-03-27T06:00:00.000Z' },
        { event: 'onboarding_started', timestamp: '2026-03-27T06:00:01.000Z' },
        { event: 'onboarding_step_completed', timestamp: '2026-03-27T06:05:00.000Z', properties: { step_name: 'business_profile' } },
        { event: 'CREDENTIAL_TEST_FAILED', timestamp: '2026-03-27T06:10:00.000Z', properties: { provider: 'lhdn' } },
        { event: 'CREDENTIAL_TEST_FAILED', timestamp: '2026-03-27T06:12:00.000Z', properties: { provider: 'lhdn' } },
        { event: 'CREDENTIAL_TEST_FAILED', timestamp: '2026-03-27T06:14:00.000Z', properties: { provider: 'lhdn' } },
      ],
      invoices: [],
    }),

    // Slow activator with LHDN failure then success — activated in 3 hours
    buildBusiness({
      id: 'biz-slow',
      name: 'Restoran Sabar',
      createdAt: '2026-03-26T06:00:00.000Z',
      activationAt: '2026-03-26T09:00:00.000Z',
      onboardingState: 'ACTIVATED',
      completedSteps: ['business_profile', 'template_generation', 'data_import', 'whatsapp_connection', 'first_invoice'],
      events: [
        { event: 'signup_completed', timestamp: '2026-03-26T06:00:00.000Z' },
        { event: 'onboarding_started', timestamp: '2026-03-26T06:00:01.000Z' },
        { event: 'onboarding_step_completed', timestamp: '2026-03-26T06:30:00.000Z', properties: { step_name: 'business_profile' } },
        { event: 'CREDENTIAL_TEST_SUCCESS', timestamp: '2026-03-26T07:00:00.000Z', properties: { provider: 'lhdn' } },
        { event: 'CREDENTIAL_TEST_SUCCESS', timestamp: '2026-03-26T07:05:00.000Z', properties: { provider: 'whatsapp' } },
        { event: 'CREDENTIAL_SAVED', timestamp: '2026-03-26T07:06:00.000Z', properties: { providers: ['lhdn', 'whatsapp'] } },
        { event: 'onboarding_step_completed', timestamp: '2026-03-26T07:10:00.000Z', properties: { step_name: 'template_generation' } },
        { event: 'onboarding_step_completed', timestamp: '2026-03-26T07:40:00.000Z', properties: { step_name: 'data_import' } },
        { event: 'onboarding_step_completed', timestamp: '2026-03-26T07:50:00.000Z', properties: { step_name: 'whatsapp_connection' } },
        { event: 'LHDN_SUBMISSION_FAILED', timestamp: '2026-03-26T08:00:00.000Z', properties: { payload: 'invalid TIN' } },
        { event: 'LHDN_SUBMISSION_SUCCESS', timestamp: '2026-03-26T08:55:00.000Z', properties: { uuid: 'uuid-2' } },
        { event: 'WHATSAPP_MESSAGE_SENT', timestamp: '2026-03-26T08:56:00.000Z', properties: { to: '60199887766' } },
        { event: 'onboarding_step_completed', timestamp: '2026-03-26T09:00:00.000Z', properties: { step_name: 'first_invoice' } },
        { event: 'activation_qualified', timestamp: '2026-03-26T09:00:00.000Z', properties: {} },
      ],
      invoices: [{ id: 'inv-2', invoiceNumber: 'INV-002' }],
    }),
  ];

  return {
    version: 1,
    activeBusinessId: 'biz-fast',
    acquisitionHooks: [],
    logs: [
      {
        id: 'log-opt',
        action: 'optimization_applied',
        timestamp: '2026-03-26T05:00:00.000Z',
        details: {
          optimizationId: 'ttv_whatsapp_skip',
          baseConfidence: 0.7,
        },
      },
    ],
    appliedOptimizations: [
      {
        id: 'ttv_whatsapp_skip',
        state: 'applied',
        appliedAt: '2026-03-26T05:00:00.000Z',
        baseConfidence: 0.7,
        confidence: 0.7,
        impact: {},
        context: {},
      },
    ],
    interventions: [],
    businesses,
  };
}

function buildBusiness({ id, name, createdAt, activationAt, onboardingState, completedSteps, events, invoices }) {
  return {
    id,
    createdAt,
    updatedAt: createdAt,
    activationAt,
    onboardingState,
    completedSteps,
    profile: { businessName: name, ownerName: 'Test', phone: '60100000000', email: 'test@test.com', businessType: 'Restoran / Kafe' },
    templates: {},
    menuItems: [],
    whatsapp: {},
    workflows: [],
    invoices,
    events: events.map((e, i) => ({
      id: `evt-${id}-${i}`,
      event: e.event,
      timestamp: e.timestamp,
      properties: e.properties ?? {},
    })),
  };
}

describe('Activation Intelligence Engine', () => {
  const state = buildMockState();

  describe('Agent 1: analyzeOnboardingCompletion', () => {
    it('produces correct step completion rates', () => {
      const result = analyzeOnboardingCompletion(state);

      expect(result.totalBusinesses).toBe(3);
      // business_profile completed by all 3
      expect(result.stepAnalysis[0].completed).toBe(3);
      expect(result.stepAnalysis[0].rate).toBe(1);
      // first_invoice completed by 2 (fast + slow)
      expect(result.stepAnalysis[4].completed).toBe(2);
      expect(result.completionRate).toBeCloseTo(2 / 3, 3);
    });

    it('detects credential drop-off', () => {
      const result = analyzeOnboardingCompletion(state);

      expect(result.credentialStats.testFailed).toBe(1);
      expect(result.credentialStats.failedBeforeSave).toBe(1);
      expect(result.dropOff.duringValidation).toBe(1);
    });

    it('returns empty result for no businesses', () => {
      const result = analyzeOnboardingCompletion({ businesses: [] });
      expect(result.totalBusinesses).toBe(0);
      expect(result.completionRate).toBe(0);
    });
  });

  describe('Agent 2: analyzeActivation', () => {
    it('correctly counts activated businesses', () => {
      const result = analyzeActivation(state);

      expect(result.totalBusinesses).toBe(3);
      expect(result.activatedCount).toBe(2);
      expect(result.activationRate).toBeCloseTo(2 / 3, 3);
    });

    it('produces time-to-activation distribution', () => {
      const result = analyzeActivation(state);

      expect(result.timeToActivation).toBeTruthy();
      expect(result.timeToActivation.p50).toBeTruthy();
      expect(result.timeToActivation.p95).toBeTruthy();
    });

    it('identifies blockers for non-activated businesses', () => {
      const result = analyzeActivation(state);

      expect(result.blockers).toHaveLength(1);
      expect(result.blockers[0].businessId).toBe('biz-stuck');
      expect(result.blockers[0].hasLhdnSubmission).toBe(false);
    });

    it('computes retention cohorts from session_started events', () => {
      const retentionState = buildMockState();
      retentionState.businesses[0].events.push({
        id: 'evt-retention-d1',
        event: 'session_started',
        timestamp: '2026-03-28T07:00:00.000Z',
        properties: {},
      });
      retentionState.businesses[1].activationAt = null;
      retentionState.businesses[2].events.push({
        id: 'evt-retention-d3',
        event: 'session_started',
        timestamp: '2026-03-29T08:30:00.000Z',
        properties: {},
      });

      const result = analyzeActivation(retentionState);

      expect(result.retention).toBeTruthy();
      expect(result.retention.sampleSize).toBe(2);
      expect(result.retention.d1).toBeGreaterThan(0);
      expect(result.retention.d3).toBeGreaterThan(0);
    });
  });

  describe('Agent 3: detectFriction', () => {
    it('detects repeated credential failures', () => {
      const result = detectFriction(state);
      const credentialFriction = result.hotspots.filter((h) => h.type === 'repeated_credential_failure');

      expect(credentialFriction).toHaveLength(1);
      expect(credentialFriction[0].failureCount).toBe(3);
      expect(credentialFriction[0].severity).toBe('critical');
    });

    it('detects LHDN submission failures', () => {
      const result = detectFriction(state);
      const lhdnFriction = result.hotspots.filter((h) => h.type === 'lhdn_submission_failure');

      expect(lhdnFriction).toHaveLength(1);
      expect(lhdnFriction[0].businessId).toBe('biz-slow');
    });
  });

  describe('Agent 4: clusterBehavior', () => {
    it('classifies businesses into correct clusters', () => {
      const result = clusterBehavior(state);

      expect(result.clusters.fastActivators).toHaveLength(1);
      expect(result.clusters.fastActivators[0].businessId).toBe('biz-fast');

      expect(result.clusters.slowActivators.length + result.clusters.normalActivators.length).toBe(1);

      expect(result.clusters.nonActivators).toHaveLength(1);
      expect(result.clusters.nonActivators[0].businessId).toBe('biz-stuck');
    });

    it('produces cluster summary with stats', () => {
      const result = clusterBehavior(state);

      expect(result.clusterSummary.fastActivators.count).toBe(1);
      expect(result.clusterSummary.nonActivators.count).toBe(1);
      expect(result.clusterSummary.nonActivators.avgCredentialFailures).toBeGreaterThan(0);
    });
  });

  describe('Agent 5: generateOptimizations', () => {
    it('produces recommendations with confidence and basedOn', () => {
      const onboarding = analyzeOnboardingCompletion(state);
      const activation = analyzeActivation(state);
      const friction = detectFriction(state);
      const behavior = clusterBehavior(state);

      const result = generateOptimizations({ onboarding, activation, friction, behavior, state });

      expect(result.recommendations.length).toBeGreaterThan(0);

      for (const rec of result.recommendations) {
        expect(rec).toHaveProperty('confidence');
        expect(rec.confidence).toBeGreaterThanOrEqual(0);
        expect(rec.confidence).toBeLessThanOrEqual(1);
        expect(rec).toHaveProperty('basedOn');
        expect(Array.isArray(rec.basedOn)).toBe(true);
        expect(rec.basedOn.length).toBeGreaterThan(0);
        expect(rec).toHaveProperty('priority');
        expect(['P0', 'P1', 'P2', 'P3']).toContain(rec.priority);
      }
    });

    it('produces valid execution payload', () => {
      const onboarding = analyzeOnboardingCompletion(state);
      const activation = analyzeActivation(state);
      const friction = detectFriction(state);
      const behavior = clusterBehavior(state);

      const result = generateOptimizations({ onboarding, activation, friction, behavior, state });

      expect(result.executionPayload).toBeTruthy();
      expect(result.executionPayload).toHaveProperty('codexTasks');
      expect(result.executionPayload).toHaveProperty('priorityFixes');
      expect(result.executionPayload).toHaveProperty('uxAdjustments');
      expect(result.executionPayload).toHaveProperty('instrumentationGaps');

      // Codex tasks must have required fields
      for (const task of result.executionPayload.codexTasks) {
        expect(task).toHaveProperty('title');
        expect(task).toHaveProperty('files');
        expect(task).toHaveProperty('change');
        expect(task).toHaveProperty('priority');
        expect(Array.isArray(task.files)).toBe(true);
      }

      // Must have instrumentation gaps
      expect(result.executionPayload.instrumentationGaps.length).toBeGreaterThan(0);
      for (const gap of result.executionPayload.instrumentationGaps) {
        expect(gap).toHaveProperty('missingEvent');
        expect(gap).toHaveProperty('reason');
        expect(gap).toHaveProperty('priority');
      }
    });
    it('handles Phase 5 lifecycle state and auto-rollback (System Shaping)', () => {
      const mockState = buildMockState();
      mockState.logs = [];
      mockState.appliedOptimizations = [
        { id: 'bad_optimization', state: 'applied', appliedAt: new Date('2026-03-26T00:00:00Z').getTime(), baseConfidence: 0.8, confidence: 0.8 }
      ];
      
      // Log must use `details` key (matches store.js schema)
      mockState.logs.push({
        action: 'optimization_applied',
        timestamp: '2026-03-26T00:00:00.000Z',
        details: { optimizationId: 'bad_optimization' }
      });

      // Before cohort: 25 businesses created 2026-03-25 (all activated) = 100% rate
      for (let i = 0; i < 25; i++) {
        mockState.businesses.push({
          id: `biz-old-success-${i}`,
          createdAt: '2026-03-25T00:00:00.000Z',
          activationAt: '2026-03-25T01:00:00.000Z',
          events: []
        });
      }

      // After cohort: biz-fast, biz-slow, biz-stuck are already there (3 total).
      // We need 17+ to hit N>=20. Let's add 20 failing ones.
      for (let i = 0; i < 20; i++) {
        mockState.businesses.push({
          id: `biz-new-fail-${i}`,
          createdAt: '2026-03-26T02:00:00.000Z',
          activationAt: null,
          events: []
        });
      }

      const impacts = measureOptimizationImpact(mockState);
      
      expect(impacts.length).toBe(1);
      expect(impacts[0].state).toBe('deprecated');
      expect(impacts[0].relativeImprovement).toBeLessThan(0);
      // measureOptimizationImpact returns immutable impact records; state mutation is handled by updateOptimizationLearning
      expect(impacts[0].confidence).toBeLessThan(0.8);
    });
  });

  describe('Outcome learning', () => {
    it('measures optimization impacts from persisted logs and emits lifecycle updates', () => {
      const impacts = measureOptimizationImpact(state);
      const updates = deriveOptimizationLearningUpdates(state, impacts);

      expect(impacts).toHaveLength(1);
      expect(impacts[0].optimizationId).toBe('ttv_whatsapp_skip');
      expect(updates).toHaveLength(1);
      expect(updates[0].id).toBe('ttv_whatsapp_skip');
      expect(updates[0].impact.sampleSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Full report: generateIntelligenceReport', () => {
    it('produces complete report with all required fields', () => {
      const report = generateIntelligenceReport(state);

      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('funnel');
      expect(report).toHaveProperty('dropOffMap');
      expect(report).toHaveProperty('timeToActivation');
      expect(report).toHaveProperty('retention');
      expect(report).toHaveProperty('activationSummary');
      expect(report).toHaveProperty('frictionHotspots');
      expect(report).toHaveProperty('behavioralClusters');
      expect(report).toHaveProperty('optimizations');
      expect(report).toHaveProperty('executionPayload');

      // Execution payload is REQUIRED
      expect(report.executionPayload).toBeTruthy();
      expect(report.executionPayload.codexTasks).toBeDefined();
    });

    it('passes on empty state without errors', () => {
      const emptyReport = generateIntelligenceReport({ businesses: [] });

      expect(emptyReport.funnel.totalBusinesses).toBe(0);
      expect(emptyReport.activationSummary.activated).toBe(0);
      expect(emptyReport.frictionHotspots).toHaveLength(0);
      expect(emptyReport.executionPayload).toBeTruthy();
    });
  });
});
