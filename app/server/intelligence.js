import crypto from 'node:crypto';

/**
 * Activation Intelligence Engine
 *
 * 5 analysis agents that process event-log data and produce
 * actionable insights + an execution payload for Codex.
 *
 * All agents are pure functions. No side effects, no DB writes.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THRESHOLDS = {
  hesitationMinutes: 15,
  softAbandonmentHours: 4,
  hardAbandonmentHours: 24,
  fastActivationMinutes: 30,
  normalActivationHours: 24,
};

const ONBOARDING_STEP_ORDER = [
  'business_profile',
  'template_generation',
  'data_import',
  'whatsapp_connection',
  'first_invoice',
];

const CREDENTIAL_EVENTS = {
  success: 'CREDENTIAL_TEST_SUCCESS',
  failed: 'CREDENTIAL_TEST_FAILED',
  saved: 'CREDENTIAL_SAVED',
};

const ACTIVATION_EVENTS = {
  lhdnSuccess: 'LHDN_SUBMISSION_SUCCESS',
  lhdnFailed: 'LHDN_SUBMISSION_FAILED',
  whatsappSent: 'WHATSAPP_MESSAGE_SENT',
  whatsappReceived: 'WHATSAPP_MESSAGE_RECEIVED',
  activated: 'activation_qualified',
};

// ---------------------------------------------------------------------------
// Agent 1 — Onboarding Completion
// ---------------------------------------------------------------------------

export function analyzeOnboardingCompletion(state) {
  const businesses = state.businesses ?? [];
  const total = businesses.length;

  if (total === 0) {
    return emptyOnboardingResult();
  }

  // Step-by-step completion
  const stepCounts = {};
  for (const step of ONBOARDING_STEP_ORDER) {
    stepCounts[step] = 0;
  }

  const stepDurations = {};
  for (const step of ONBOARDING_STEP_ORDER) {
    stepDurations[step] = [];
  }

  const credentialStats = {
    testAttempted: 0,
    testSucceeded: 0,
    testFailed: 0,
    saved: 0,
    failedBeforeSave: 0,
  };

  const dropOff = {
    beforeCredentials: 0,
    duringValidation: 0,
    afterValidationBeforeSave: 0,
    afterSave: 0,
  };

  for (const business of businesses) {
    const events = business.events ?? [];
    const completed = new Set(business.completedSteps ?? []);

    // Count step completions
    for (const step of ONBOARDING_STEP_ORDER) {
      if (completed.has(step)) {
        stepCounts[step]++;
      }
    }

    // Compute per-step durations
    const stepEvents = events
      .filter((e) => e.event === 'onboarding_step_completed')
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const signupEvent = events.find((e) => e.event === 'signup_completed');
    let previousTimestamp = signupEvent ? new Date(signupEvent.timestamp) : new Date(business.createdAt);

    for (const stepEvent of stepEvents) {
      const stepName = stepEvent.properties?.step_name;
      if (stepName && stepDurations[stepName]) {
        const duration = new Date(stepEvent.timestamp) - previousTimestamp;
        stepDurations[stepName].push(Math.max(0, duration));
        previousTimestamp = new Date(stepEvent.timestamp);
      }
    }

    // Credential flow analysis
    const hasCredTest = events.some((e) => e.event === CREDENTIAL_EVENTS.success || e.event === CREDENTIAL_EVENTS.failed);
    const hasCredSuccess = events.some((e) => e.event === CREDENTIAL_EVENTS.success);
    const hasCredFailed = events.some((e) => e.event === CREDENTIAL_EVENTS.failed);
    const hasCredSaved = events.some((e) => e.event === CREDENTIAL_EVENTS.saved);

    if (hasCredTest) credentialStats.testAttempted++;
    if (hasCredSuccess) credentialStats.testSucceeded++;
    if (hasCredFailed) credentialStats.testFailed++;
    if (hasCredSaved) credentialStats.saved++;
    if (hasCredFailed && !hasCredSaved) credentialStats.failedBeforeSave++;

    // Drop-off classification (for non-activated businesses)
    if (!business.activationAt) {
      if (!hasCredTest && !completed.has('whatsapp_connection')) {
        dropOff.beforeCredentials++;
      } else if (hasCredTest && !hasCredSuccess) {
        dropOff.duringValidation++;
      } else if (hasCredSuccess && !hasCredSaved) {
        dropOff.afterValidationBeforeSave++;
      } else if (hasCredSaved) {
        dropOff.afterSave++;
      }
    }
  }

  // Compute step rates and median times
  const stepAnalysis = ONBOARDING_STEP_ORDER.map((step) => ({
    step,
    completed: stepCounts[step],
    rate: total > 0 ? round(stepCounts[step] / total, 4) : 0,
    medianTimeMs: median(stepDurations[step]),
    medianTimeFormatted: formatDuration(median(stepDurations[step])),
  }));

  return {
    totalBusinesses: total,
    completionRate: total > 0 ? round(stepCounts.first_invoice / total, 4) : 0,
    stepAnalysis,
    credentialStats,
    dropOff,
  };
}

// ---------------------------------------------------------------------------
// Agent 2 — Activation
// ---------------------------------------------------------------------------

export function analyzeActivation(state) {
  const businesses = state.businesses ?? [];
  const total = businesses.length;

  if (total === 0) {
    return emptyActivationResult();
  }

  const activated = [];
  const blockers = [];
  const now = Date.now();

  for (const business of businesses) {
    const events = business.events ?? [];

    if (business.activationAt) {
      const signupTime = new Date(business.createdAt).getTime();
      const activationTime = new Date(business.activationAt).getTime();
      const timeToActivation = activationTime - signupTime;
      activated.push({
        businessId: business.id,
        businessName: business.profile?.businessName ?? 'Unknown',
        timeToActivationMs: timeToActivation,
      });
    } else {
      // Detect blockers for non-activated businesses
      const lastEvent = events.length > 0
        ? events.reduce((latest, e) => (new Date(e.timestamp) > new Date(latest.timestamp) ? e : latest))
        : null;
      const lastActivity = lastEvent ? new Date(lastEvent.timestamp).getTime() : new Date(business.createdAt).getTime();
      const hoursSinceLastActivity = (now - lastActivity) / (1000 * 60 * 60);

      const hasLhdn = events.some((e) => e.event === ACTIVATION_EVENTS.lhdnSuccess);
      const hasWhatsApp = events.some((e) => e.event === ACTIVATION_EVENTS.whatsappSent);
      const hasLhdnFailed = events.some((e) => e.event === ACTIVATION_EVENTS.lhdnFailed);

      blockers.push({
        businessId: business.id,
        businessName: business.profile?.businessName ?? 'Unknown',
        currentState: business.onboardingState,
        hasLhdnSubmission: hasLhdn,
        hasWhatsAppSent: hasWhatsApp,
        hasLhdnFailure: hasLhdnFailed,
        hoursSinceLastActivity: round(hoursSinceLastActivity, 1),
        status: hoursSinceLastActivity > THRESHOLDS.hardAbandonmentHours
          ? 'hard_abandoned'
          : hoursSinceLastActivity > THRESHOLDS.softAbandonmentHours
            ? 'soft_abandoned'
            : 'active',
      });
    }
  }

  // Time-to-activation distribution
  const times = activated.map((a) => a.timeToActivationMs).sort((a, b) => a - b);
  const distribution = times.length > 0
    ? {
        p25: formatDuration(percentile(times, 25)),
        p50: formatDuration(percentile(times, 50)),
        p75: formatDuration(percentile(times, 75)),
        p95: formatDuration(percentile(times, 95)),
        min: formatDuration(times[0]),
        max: formatDuration(times[times.length - 1]),
        avgMs: round(times.reduce((s, v) => s + v, 0) / times.length, 0),
      }
    : null;

  return {
    totalBusinesses: total,
    activatedCount: activated.length,
    activationRate: total > 0 ? round(activated.length / total, 4) : 0,
    timeToActivation: distribution,
    activatedBusinesses: activated,
    blockers,
  };
}

// ---------------------------------------------------------------------------
// Agent 3 — Friction Detection
// ---------------------------------------------------------------------------

export function detectFriction(state) {
  const businesses = state.businesses ?? [];
  const hotspots = [];
  const now = Date.now();

  for (const business of businesses) {
    const events = business.events ?? [];
    const businessCtx = {
      businessId: business.id,
      businessName: business.profile?.businessName ?? 'Unknown',
    };

    // 3a. Repeated credential failures
    const credFailures = events.filter((e) => e.event === CREDENTIAL_EVENTS.failed);
    if (credFailures.length > 1) {
      hotspots.push({
        type: 'repeated_credential_failure',
        severity: credFailures.length >= 3 ? 'critical' : 'warning',
        interventionType: 'REQUIRE_INLINE_FIX',
        ...businessCtx,
        failureCount: credFailures.length,
        providers: [...new Set(credFailures.map((e) => e.properties?.provider).filter(Boolean))],
        signals: credFailures.map((e) => e.timestamp),
      });
    }

    // 3b. Step dwell time anomalies (hesitation)
    const stepEvents = events
      .filter((e) => e.event === 'onboarding_step_completed')
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const signupEvent = events.find((e) => e.event === 'signup_completed');
    let prevTime = signupEvent ? new Date(signupEvent.timestamp).getTime() : new Date(business.createdAt).getTime();

    for (const stepEvent of stepEvents) {
      const gap = new Date(stepEvent.timestamp).getTime() - prevTime;
      const gapMinutes = gap / (1000 * 60);

      if (gapMinutes > THRESHOLDS.hesitationMinutes) {
        hotspots.push({
          type: 'step_hesitation',
          severity: gapMinutes > THRESHOLDS.softAbandonmentHours * 60 ? 'critical' : 'warning',
          interventionType: 'TRIGGER_INLINE_GUIDANCE',
          ...businessCtx,
          step: stepEvent.properties?.step_name,
          dwellMinutes: round(gapMinutes, 1),
          threshold: THRESHOLDS.hesitationMinutes,
        });
      }

      prevTime = new Date(stepEvent.timestamp).getTime();
    }

    // 3c. Abandoned and At-Risk sessions
    if (!business.activationAt) {
      const lastEvent = events.length > 0
        ? events.reduce((latest, e) => (new Date(e.timestamp) > new Date(latest.timestamp) ? e : latest))
        : null;
      const lastActivity = lastEvent ? new Date(lastEvent.timestamp).getTime() : new Date(business.createdAt).getTime();
      const hoursInactive = (now - lastActivity) / (1000 * 60 * 60);

      if (hoursInactive > 0.25 && hoursInactive <= THRESHOLDS.softAbandonmentHours) {
        hotspots.push({
          type: 'at_risk_of_abandonment',
          severity: 'warning',
          interventionType: 'PRE_EMPTIVE_ASSISTANCE',
          ...businessCtx,
          hoursInactive: round(hoursInactive, 2),
          lastStep: business.onboardingState,
          lastEventName: lastEvent?.event ?? 'none',
        });
      }

      if (hoursInactive > THRESHOLDS.softAbandonmentHours) {
        hotspots.push({
          type: hoursInactive > THRESHOLDS.hardAbandonmentHours ? 'hard_abandonment' : 'soft_abandonment',
          severity: hoursInactive > THRESHOLDS.hardAbandonmentHours ? 'critical' : 'warning',
          interventionType: 'TRIGGER_WHATSAPP_NUDGE',
          ...businessCtx,
          hoursInactive: round(hoursInactive, 1),
          lastStep: business.onboardingState,
          lastEventName: lastEvent?.event ?? 'none',
        });
      }
    }

    // 3d. LHDN submission failures
    const lhdnFailures = events.filter((e) => e.event === ACTIVATION_EVENTS.lhdnFailed);
    if (lhdnFailures.length > 0) {
      hotspots.push({
        type: 'lhdn_submission_failure',
        severity: lhdnFailures.length >= 2 ? 'critical' : 'warning',
        interventionType: 'REQUIRE_INLINE_FIX',
        ...businessCtx,
        failureCount: lhdnFailures.length,
        signals: lhdnFailures.map((e) => ({
          timestamp: e.timestamp,
          payload: e.properties?.payload,
        })),
      });
    }
  }

  // Sort by severity (critical first)
  hotspots.sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1));

  return { hotspots, totalFrictionPoints: hotspots.length };
}

// ---------------------------------------------------------------------------
// Agent 4 — Behavioral Patterns
// ---------------------------------------------------------------------------

export function clusterBehavior(state) {
  const businesses = state.businesses ?? [];

  const clusters = {
    fastActivators: [],
    normalActivators: [],
    slowActivators: [],
    atRisk: [],
    nonActivators: [],
  };

  for (const business of businesses) {
    const events = business.events ?? [];
    const summary = {
      businessId: business.id,
      businessName: business.profile?.businessName ?? 'Unknown',
      createdAt: business.createdAt,
      onboardingState: business.onboardingState,
      completedSteps: business.completedSteps?.length ?? 0,
      credentialFailures: events.filter((e) => e.event === CREDENTIAL_EVENTS.failed).length,
      hasCredentials: events.some((e) => e.event === CREDENTIAL_EVENTS.saved),
      invoiceCount: (business.invoices ?? []).length,
      whatsappMessagesReceived: events.filter((e) => e.event === ACTIVATION_EVENTS.whatsappReceived).length,
    };

    if (business.activationAt) {
      const timeMs = new Date(business.activationAt).getTime() - new Date(business.createdAt).getTime();
      const timeMinutes = timeMs / (1000 * 60);
      summary.timeToActivationMinutes = round(timeMinutes, 1);

      if (timeMinutes <= THRESHOLDS.fastActivationMinutes) {
        clusters.fastActivators.push(summary);
      } else if (timeMinutes <= THRESHOLDS.normalActivationHours * 60) {
        clusters.normalActivators.push(summary);
      } else {
        clusters.slowActivators.push(summary);
      }
    } else {
      const lastEvent = events.length > 0 ? events[events.length - 1] : null;
      const lastActivity = lastEvent ? new Date(lastEvent.timestamp).getTime() : new Date(business.createdAt).getTime();
      const hoursInactive = (Date.now() - lastActivity) / (1000 * 60 * 60);

      if (hoursInactive > 0.25 && hoursInactive <= THRESHOLDS.softAbandonmentHours) {
        clusters.atRisk.push(summary);
      } else {
        clusters.nonActivators.push(summary);
      }
    }
  }

  // Per-cluster summary
  const clusterSummary = {};
  for (const [name, members] of Object.entries(clusters)) {
    clusterSummary[name] = {
      count: members.length,
      avgCompletedSteps: members.length > 0
        ? round(members.reduce((s, m) => s + m.completedSteps, 0) / members.length, 1)
        : 0,
      avgCredentialFailures: members.length > 0
        ? round(members.reduce((s, m) => s + m.credentialFailures, 0) / members.length, 1)
        : 0,
      credentialRate: members.length > 0
        ? round(members.filter((m) => m.hasCredentials).length / members.length, 4)
        : 0,
      avgTimeToActivationMinutes: name !== 'nonActivators' && members.length > 0
        ? round(members.reduce((s, m) => s + (m.timeToActivationMinutes ?? 0), 0) / members.length, 1)
        : null,
    };
  }

  return { clusters, clusterSummary };
}

// ---------------------------------------------------------------------------
// Agent 5 — Outcome Tracking
// ---------------------------------------------------------------------------

export function measureOptimizationImpact(state) {
  const appliedOptimizations = normalizeAppliedOptimizations(state.appliedOptimizations);
  const impacts = [];
  const optimizations = state.logs?.filter((log) => log.action === 'optimization_applied') ?? [];

  for (const opt of optimizations) {
    const appliedAt = new Date(opt.timestamp).getTime();
    const optId = opt.details?.optimizationId ?? 'unknown';

    const beforeCohort = state.businesses.filter((b) => new Date(b.createdAt).getTime() < appliedAt);
    const afterCohort = state.businesses.filter((b) => new Date(b.createdAt).getTime() >= appliedAt);

    const beforeActivated = beforeCohort.filter((b) => b.activationAt).length;
    const afterActivated = afterCohort.filter((b) => b.activationAt).length;

    const beforeRate = beforeCohort.length ? beforeActivated / beforeCohort.length : 0;
    const afterRate = afterCohort.length ? afterActivated / afterCohort.length : 0;
    const relativeImprovement = beforeRate > 0 ? (afterRate - beforeRate) / beforeRate : 0;

    // Phase 5: Confidence adjustment & Automated Rollback
    const appliedOpt = appliedOptimizations.find((o) => o.id === optId);
    let lifecycleState = appliedOpt?.state || 'applied';
    let confidence = appliedOpt?.confidence ?? 0.5;

    // Auto-evaluate when we have a minimum sample (e.g. 20 users)
    if (beforeCohort.length >= 20 && afterCohort.length >= 20 && appliedOpt && lifecycleState === 'applied') {
      if (relativeImprovement < 0) {
        lifecycleState = 'deprecated'; // Rollback on negative impact
      } else if (relativeImprovement > 0.1) {
        lifecycleState = 'reinforced';
      } else {
        lifecycleState = 'validated';
      }

      // confidence = baseConfidence * outcomeScore * sampleWeight
      const outcomeScore =
        lifecycleState === 'deprecated' ? 0.5 : lifecycleState === 'reinforced' ? 1.2 : 1.0;
      const sampleWeight = Math.min(afterCohort.length / 5, 1.5);
      confidence = Math.min((appliedOpt.baseConfidence ?? 0.5) * outcomeScore * sampleWeight, 1.0);
    }

    impacts.push({
      optimizationId: optId,
      state: lifecycleState,
      confidence,
      appliedAt: opt.timestamp,
      before: {
        total: beforeCohort.length,
        activationRate: beforeRate,
      },
      after: {
        total: afterCohort.length,
        activationRate: afterRate,
      },
      relativeImprovement,
      absoluteImprovement: afterRate - beforeRate,
    });
  }

  return impacts;
}

export function deriveOptimizationLearningUpdates(state, impacts = measureOptimizationImpact(state)) {
  return impacts
    .filter((impact) => impact.optimizationId && impact.optimizationId !== 'unknown')
    .map((impact) => ({
      id: impact.optimizationId,
      state: impact.state,
      confidence: impact.confidence,
      lastEvaluatedAt: new Date().toISOString(),
      impact: {
        deltaActivation: Number(impact.absoluteImprovement.toFixed(4)),
        sampleSize: impact.after.total,
        observedAt: impact.appliedAt,
        beforeRate: Number(impact.before.activationRate.toFixed(4)),
        afterRate: Number(impact.after.activationRate.toFixed(4)),
      },
      context: {
        cohort: `before:${impact.before.total}|after:${impact.after.total}`,
      },
    }));
}

// ---------------------------------------------------------------------------
// Agent 6 — Optimization + Execution Payload
// ---------------------------------------------------------------------------

export function generateOptimizations(insights) {
  const { onboarding, activation, friction, behavior } = insights;
  const recommendations = [];
  const codexTasks = [];
  const priorityFixes = [];
  const uxAdjustments = [];
  const instrumentationGaps = [];

  function addCodexTask(task) {
    task.id = task.id || crypto.createHash('md5').update(task.title + task.change).digest('hex').substring(0, 8);
    
    // Lifecycle parsing
    const appliedOpt = normalizeAppliedOptimizations(insights.state?.appliedOptimizations).find((o) => o.id === task.id);
    task.status = appliedOpt ? (appliedOpt.state || 'applied') : 'pending';
    
    // Inherit historical confidence if available
    if (appliedOpt && typeof appliedOpt === 'object' && appliedOpt.confidence) {
      task.confidence = appliedOpt.confidence;
    } else if (!task.confidence) {
      task.confidence = 0.8;
    }

    // Phase 5 Ranking: calculate priority Score = expectedImpact * confidence * reach
    const impactVal = task.priority === 'P0' ? 1.0 : (task.priority === 'P1' ? 0.6 : 0.3);
    const reach = 1.0; // Base simplification
    task.priorityScore = Number((impactVal * task.confidence * reach).toFixed(2));

    codexTasks.push(task);
  }

  const total = onboarding?.totalBusinesses ?? 0;

  // --- Credential drop-off ---
  if (onboarding?.credentialStats?.failedBeforeSave > 0) {
    const failRate = total > 0
      ? onboarding.credentialStats.failedBeforeSave / total
      : 0;

    recommendations.push({
      action: 'Surface inline error messages during credential validation to reduce abandonment',
      priority: 'P0',
      category: 'ux',
      expectedImpact: `Recover up to ${onboarding.credentialStats.failedBeforeSave} users stuck at credential step`,
      confidence: clamp(0.5 + failRate, 0, 1),
      basedOn: [
        `${onboarding.credentialStats.failedBeforeSave} users failed credentials without saving`,
        `n=${total}`,
      ],
    });

    addCodexTask({
      title: 'Surface LHDN/WhatsApp error messages in credential UI',
      files: ['src/App.jsx'],
      change: 'Display API error response body inline below credential inputs when CREDENTIAL_TEST_FAILED fires',
      priority: 'P0',
    });
  }

  // --- LHDN submission failures ---
  const lhdnFriction = (friction?.hotspots ?? []).filter((h) => h.type === 'lhdn_submission_failure');
  if (lhdnFriction.length > 0) {
    const totalFailures = lhdnFriction.reduce((s, h) => s + h.failureCount, 0);

    recommendations.push({
      action: 'Add LHDN error auto-diagnosis with fix suggestions per error code',
      priority: 'P0',
      category: 'ux',
      expectedImpact: `Resolve ${totalFailures} LHDN submission failures across ${lhdnFriction.length} businesses`,
      confidence: 0.85,
      basedOn: [
        `${totalFailures} LHDN_SUBMISSION_FAILED events`,
        `${lhdnFriction.length} affected businesses`,
      ],
    });

    addCodexTask({
      title: 'Add LHDN error code parser with actionable fix messages',
      files: ['server/integrations/lhdn.js', 'src/App.jsx'],
      change: 'Parse LHDN rejection codes into human-readable messages. Show specific fix instructions in the invoice creation UI.',
      priority: 'P0',
    });

    priorityFixes.push({
      issue: 'LHDN submission failures block activation',
      impact: `${totalFailures} failed submissions prevent users from reaching activated state`,
      fix: 'Parse LHDN error response codes and surface actionable fix instructions in UI',
    });
  }

  // --- Step hesitation patterns ---
  const hesitations = (friction?.hotspots ?? []).filter((h) => h.type === 'step_hesitation');
  if (hesitations.length > 0) {
    const mostCommonStep = mode(hesitations.map((h) => h.step));
    const avgDwell = round(hesitations.reduce((s, h) => s + h.dwellMinutes, 0) / hesitations.length, 1);

    recommendations.push({
      action: `Add contextual help tooltip at the "${mostCommonStep}" step to reduce ${round(avgDwell, 0)}min average hesitation`,
      priority: 'P1',
      category: 'ux',
      expectedImpact: `Reduce dwell time at ${mostCommonStep} step for ${hesitations.length} hesitation instances`,
      confidence: clamp(0.4 + hesitations.length * 0.05, 0, 0.95),
      basedOn: [
        `${hesitations.length} hesitation events at >${THRESHOLDS.hesitationMinutes}min`,
        `most common step: ${mostCommonStep}`,
        `avg dwell: ${avgDwell}min`,
      ],
    });

    uxAdjustments.push({
      insight: `Users hesitate at "${mostCommonStep}" step (avg ${avgDwell}min dwell time)`,
      adjustment: 'Add inline guidance or pre-fill examples at this step',
      expectedImpact: 'Reduce median step completion time by ~40%',
    });
  }

  // --- Abandoned sessions ---
  const abandonments = (friction?.hotspots ?? []).filter(
    (h) => h.type === 'soft_abandonment' || h.type === 'hard_abandonment',
  );
  if (abandonments.length > 0) {
    const hardAbandoned = abandonments.filter((h) => h.type === 'hard_abandonment');
    const commonDropStep = mode(abandonments.map((h) => h.lastStep));

    recommendations.push({
      action: 'Implement WhatsApp re-engagement nudge for abandoned sessions',
      priority: hardAbandoned.length > 2 ? 'P0' : 'P1',
      category: 'messaging',
      expectedImpact: `Re-engage up to ${abandonments.length} abandoned users`,
      confidence: clamp(0.3 + abandonments.length * 0.08, 0, 0.9),
      basedOn: [
        `${abandonments.length} abandoned sessions`,
        `${hardAbandoned.length} hard abandoned (>${THRESHOLDS.hardAbandonmentHours}h)`,
        `most common drop-off state: ${commonDropStep}`,
      ],
    });

    addCodexTask({
      title: 'Add automated WhatsApp nudge for abandoned onboarding',
      files: ['server/app.js', 'server/integrations/whatsapp.js'],
      change: `Check for businesses inactive >${THRESHOLDS.softAbandonmentHours}h. Send WhatsApp template re-engaging them with a direct link to resume onboarding.`,
      priority: hardAbandoned.length > 2 ? 'P0' : 'P1',
    });
  }

  // --- Activation rate warning ---
  if (activation && activation.activationRate < 0.5 && total >= 3) {
    recommendations.push({
      action: 'Restructure onboarding to front-load value demonstration before credential setup',
      priority: 'P1',
      category: 'flow',
      expectedImpact: `Current activation rate is ${round(activation.activationRate * 100, 1)}% — restructuring could recover ${activation.blockers.length} blocked users`,
      confidence: clamp(0.5 + (1 - activation.activationRate) * 0.3, 0, 0.95),
      basedOn: [
        `activation rate: ${round(activation.activationRate * 100, 1)}%`,
        `${activation.blockers.length} blocked businesses`,
        `n=${total}`,
      ],
    });

    priorityFixes.push({
      issue: `Activation rate below 50% (${round(activation.activationRate * 100, 1)}%)`,
      impact: `${activation.blockers.length} businesses signed up but never activated`,
      fix: 'Show simulated invoice success before requiring credential setup to build confidence',
    });
  }

  // --- Non-activator cluster analysis ---
  const nonActivators = behavior?.clusters?.nonActivators ?? [];
  if (nonActivators.length > 0 && total >= 2) {
    const avgSteps = behavior.clusterSummary.nonActivators.avgCompletedSteps;
    const avgFailures = behavior.clusterSummary.nonActivators.avgCredentialFailures;

    if (avgFailures > 1) {
      recommendations.push({
        action: 'Add credential setup wizard with step-by-step LHDN + WhatsApp configuration guide',
        priority: 'P1',
        category: 'ux',
        expectedImpact: `Non-activators average ${avgFailures} credential failures - a guided wizard could prevent most`,
        confidence: clamp(0.5 + avgFailures * 0.1, 0, 0.95),
        basedOn: [
          `${nonActivators.length} non-activated businesses`,
          `avg credential failures: ${avgFailures}`,
          `avg completed steps: ${avgSteps}`,
        ],
      });

      addCodexTask({
        title: 'Build credential setup wizard component',
        files: ['src/App.jsx'],
        change: 'Replace inline credential fields with a multi-step wizard that validates each credential individually and shows progress.',
        priority: 'P1',
      });
    }

    if (avgSteps < 3) {
      uxAdjustments.push({
        insight: `Non-activators complete only ${avgSteps} steps on average (out of 5)`,
        adjustment: 'Add a progress indicator with estimated time remaining to encourage completion',
        expectedImpact: 'Increase step completion by showing proximity to value',
      });
    }
  }

  // --- Instrumentation gaps ---
  const hasRetentionEvents = (state) => {
    const allEvents = (state?.businesses ?? []).flatMap((b) => b.events ?? []);
    return allEvents.some((e) => e.event === 'session_started' || e.event === 'return_visit');
  };

  instrumentationGaps.push({
    missingEvent: 'session_started',
    reason: 'Cannot measure return visits or D1/D7/D30 retention without session tracking',
    priority: 'P1',
  });

  instrumentationGaps.push({
    missingEvent: 'credential_step_viewed',
    reason: 'Cannot distinguish users who never saw credential UI from those who saw it and abandoned',
    priority: 'P2',
  });

  instrumentationGaps.push({
    missingEvent: 'invoice_draft_started',
    reason: 'Cannot detect users who begin invoice creation but abandon before submission',
    priority: 'P2',
  });

  instrumentationGaps.push({
    missingEvent: 'nps_response',
    reason: 'No user satisfaction signal - cannot correlate satisfaction with activation speed',
    priority: 'P3',
  });

  // --- TTV Compression ---
  if (activation?.timeToActivation?.p50 > 5 || activation?.activationRate < 0.6) {
    recommendations.push({
      action: 'Dynamically skip WhatsApp setup to compress Time-to-Value',
      priority: 'P0',
      category: 'flow',
      expectedImpact: 'Decrease median TTV and boost activation rates by removing a high-friction step.',
      confidence: 0.85,
      basedOn: [
        `P50 time to activate: ${activation.timeToActivation?.p50}m`,
        `activation rate: ${(activation.activationRate * 100).toFixed(0)}%`,
      ],
    });

    addCodexTask({
      id: 'ttv_whatsapp_skip',
      title: 'Implement dynamic TTV compression',
      files: ['src/App.jsx'],
      change: 'Hide the WhatsApp setup step and push users straight to invoice creation if ttv_whatsapp_skip optimization is applied.',
      priority: 'P0',
    });
  }

  // Sort recommendations by confidence, tasks by ROI (priorityScore)
  recommendations.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  codexTasks.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));

  return {
    recommendations,
    executionPayload: {
      codexTasks,
      priorityFixes,
      uxAdjustments,
      instrumentationGaps,
    },
  };
}

// ---------------------------------------------------------------------------
// Orchestrator — Full report
// ---------------------------------------------------------------------------

export function generateIntelligenceReport(state) {
  const onboarding = analyzeOnboardingCompletion(state);
  const activation = analyzeActivation(state);
  const friction = detectFriction(state);
  const behavior = clusterBehavior(state);
  const impacts = measureOptimizationImpact(state);
  const optimizations = generateOptimizations({
    onboarding,
    activation,
    friction,
    behavior,
    state,
  });

  return {
    generatedAt: new Date().toISOString(),
    funnel: {
      totalBusinesses: onboarding.totalBusinesses,
      completionRate: onboarding.completionRate,
      steps: onboarding.stepAnalysis,
    },
    dropOffMap: {
      credentialDropOff: onboarding.dropOff,
      credentialStats: onboarding.credentialStats,
    },
    timeToActivation: activation.timeToActivation,
    activationSummary: {
      total: activation.totalBusinesses,
      activated: activation.activatedCount,
      rate: activation.activationRate,
      blockers: activation.blockers,
    },
    frictionHotspots: friction.hotspots,
    behavioralClusters: behavior.clusterSummary,
    impacts,
    optimizations: optimizations.recommendations,
    executionPayload: optimizations.executionPayload,
  };
}

function normalizeAppliedOptimizations(appliedOptimizations = []) {
  return (Array.isArray(appliedOptimizations) ? appliedOptimizations : []).map((optimization) =>
    typeof optimization === 'string'
      ? {
          id: optimization,
          state: 'applied',
          baseConfidence: 0.5,
          confidence: 0.5,
          impact: {},
          context: {},
        }
      : optimization,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyOnboardingResult() {
  return {
    totalBusinesses: 0,
    completionRate: 0,
    stepAnalysis: ONBOARDING_STEP_ORDER.map((step) => ({
      step,
      completed: 0,
      rate: 0,
      medianTimeMs: 0,
      medianTimeFormatted: '0s',
    })),
    credentialStats: {
      testAttempted: 0,
      testSucceeded: 0,
      testFailed: 0,
      saved: 0,
      failedBeforeSave: 0,
    },
    dropOff: {
      beforeCredentials: 0,
      duringValidation: 0,
      afterValidationBeforeSave: 0,
      afterSave: 0,
    },
  };
}

function emptyActivationResult() {
  return {
    totalBusinesses: 0,
    activatedCount: 0,
    activationRate: 0,
    timeToActivation: null,
    activatedBusinesses: [],
    blockers: [],
  };
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, round(value, 2)));
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

function mode(values) {
  if (values.length === 0) return null;
  const counts = {};
  for (const v of values) {
    counts[v] = (counts[v] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
