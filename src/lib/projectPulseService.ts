import { supabase, FIELD_NEEDS_ATTENTION_STATUSES, UserProfile } from './supabase';
import { getAdminNeedsAttentionItems, DbActionItemRow } from './actionBoardHelpers';

export interface PulseSummary {
  period: 'Yesterday' | 'Today' | 'Tomorrow';
  summary: string;
  supporting: string;
  count: number | null;
  status: 'green' | 'yellow' | 'red' | 'dark-red';
  priority: string;
}

export interface DetailedPulseData {
  yesterday: {
    summary: string;
    supporting: string;
    updatesCount: number;
    completedTasksCount: number;
    completedTaskNames: string[];
    blockersCount: number;
    blockerDetails: string[];
  };
  today: {
    summary: string;
    supporting: string;
    actionItemsCount: number;
    actionItemTitles: string[];
    inspectionsTodayCount: number;
    inspectionsTodayDetails: string[];
    pendingPermitsCount: number;
    pendingPermitNumbers: string[];
    overdueDecisionsCount: number;
    overdueDecisionTitles: string[];
    openDelaysCount: number;
    openDelayReasons: string[];
  };
  tomorrow: {
    summary: string;
    supporting: string;
    tomorrowTasksCount: number;
    tomorrowTaskNames: string[];
    tomorrowInspectionsCount: number;
    tomorrowInspectionDetails: string[];
    blockedTasksCount: number;
    blockedTaskNames: string[];
    delayRiskCount: number;
  };
}

export interface ProjectPulseFullReport {
  summaries: Record<'Yesterday' | 'Today' | 'Tomorrow', PulseSummary>;
  details: DetailedPulseData;
}

const TOMORROW_REASONS = [
  'DECKARC is coordinating the next project step.',
  'The next phase is pending schedule confirmation.',
  'Material delivery is being confirmed before the next step.',
  'DECKARC is monitoring the schedule for the next work phase.',
];

/**
 * Retrieves live Project Pulse summaries & detailed field breakdowns for Yesterday, Today, and Tomorrow
 */
export async function fetchProjectPulseReport(
  profile: UserProfile | null
): Promise<ProjectPulseFullReport> {
  const isClient = profile?.role === 'CLIENT';
  const isGC     = profile?.role === 'GENERAL_CONTRACTOR';
  const isSub    = profile?.role === 'SUBCONTRACTOR';

  const today    = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const yd       = new Date(today); yd.setDate(yd.getDate() - 1);
  const yStr     = yd.toISOString().split('T')[0];
  const tm       = new Date(today); tm.setDate(tm.getDate() + 1);
  const tmStr    = tm.toISOString().split('T')[0];

  try {
    const [
      projectsRes,
      tasksRes,
      updatesRes,
      permitsRes,
      inspectionsRes,
      decisionsRes,
      alertsRes,
      delayRes,
      subBlockedRes,
      paymentsRes,
      incidentsRes,
    ] = await Promise.all([
      supabase.from('projects').select('id,project_name,status,alert_status,is_archived,is_deleted').eq('is_archived', false),
      supabase.from('tasks').select('id,task_name,task_type,category,status,planned_finish_date,planned_start_date,projected_start_date,projected_finish_date,project_id,assigned_user_id,blocked_reason').eq('is_deleted', false),
      supabase.from('daily_updates').select('id,update_date,blockers,work_completed_today').gte('update_date', yStr).lte('update_date', todayStr),
      supabase.from('permits').select('id,project_id,permit_status,permit_type,permit_number,revision_notes,delay_reason,permit_delay_expected'),
      supabase.from('inspections').select('id,project_id,result,scheduled_date,correction_required,inspection_type,correction_notes,delay_reason'),
      supabase.from('client_decisions').select('id,project_id,status,needed_by_date,decision_title,description,client_visible_note'),
      supabase.from('action_items').select('id,source_id,priority,status,snoozed_until,resolved_at'),
      supabase.from('project_delay_reasons').select('id,status,client_response_status,client_response_required,schedule_impact_status,client_visibility_status,task_id,delay_category,project_id,delay_reason_text').neq('status', 'Closed'),
      isSub && profile?.id
        ? supabase.from('tasks')
            .select('id,task_name,task_type,category,status,blocked_reason,planned_finish_date,project_id,client_visible_notes')
            .eq('assigned_user_id', profile.id)
            .eq('is_deleted', false)
            .in('status', [...FIELD_NEEDS_ATTENTION_STATUSES])
        : Promise.resolve({ data: [] }),
      supabase.from('payment_milestones').select('id,project_id,milestone_name,amount,status,due_date,work_hold_required'),
      supabase.from('incidents').select('id,project_id,incident_title,incident_status,severity_level,work_hold_required').neq('incident_status', 'Resolved').neq('incident_status', 'Closed'),
    ]);

    const projects       = projectsRes.data    || [];
    const tasks          = tasksRes.data       || [];
    const updates        = updatesRes.data     || [];
    const permits        = permitsRes.data     || [];
    const inspections    = inspectionsRes.data || [];
    const decisions      = decisionsRes.data   || [];
    const allActionItems = alertsRes.data   || [];
    const delays         = delayRes.data       || [];
    const payments       = paymentsRes.data    || [];
    const incidents      = incidentsRes.data   || [];
    const rawSubBlocked  = subBlockedRes.data  || [];

    const abActive   = allActionItems.filter(a => a.status !== 'Done' && !(a.snoozed_until && a.snoozed_until >= todayStr)).length;
    const abResolved = allActionItems.filter(a => a.status === 'Done' && a.resolved_at && a.resolved_at.startsWith(todayStr)).length;
    const abTotal    = abActive + abResolved;

    const alerts   = allActionItems.filter(a => a.status === 'Open');
    const delayed  = projects.filter(p => p.status === 'Delayed').length;
    const critical = projects.filter(p => p.alert_status === 'red').length;

    const openDelays          = delays.filter(d => !['Resolved', 'Closed'].includes(d.status)).length;
    const pendingAdminReview  = delays.filter(d => d.schedule_impact_status === 'Pending Admin Review').length;
    const pendingClientNotice = delays.filter(d => d.client_visibility_status === 'Pending Admin Approval').length;
    const clientPendingResp   = delays.filter(d => d.client_response_required && d.client_response_status === 'Pending Response').length;
    const clientReviewRequested = delays.filter(d => d.client_response_status === 'Client Requested Review').length;
    const clientQuestions     = delays.filter(d => d.client_response_status === 'Question Submitted').length;

    const subDelays = isSub
      ? delays.filter(d => d.task_id && tasks.some(t => t.id === d.task_id && t.assigned_user_id === profile.id))
      : [];

    const gcOpenDelays = (isGC ? openDelays : 0);

    // ── YESTERDAY DETAILS ──
    const yUpdates          = updates.filter(u => u.update_date === yStr);
    const completedYTasks   = tasks.filter(t => t.status === 'Completed');
    const completedYNames   = completedYTasks.map(t => t.task_name).slice(0, 5);
    const blockersYUpdates  = yUpdates.filter(u => u.blockers);
    const blockerYTexts     = blockersYUpdates.map(u => u.blockers!).filter(Boolean).slice(0, 5);

    let yStatus: PulseSummary['status'] = 'green';
    let yPri = 'Informational';
    if (blockersYUpdates.length > 0) { yStatus = 'yellow'; yPri = isClient ? 'Informational' : 'Time Sensitive'; }
    if (critical > 0)  { yStatus = 'red';    yPri = isClient ? 'Action Needed' : 'Critical'; }

    const yBubble: PulseSummary = isClient
      ? { period: 'Yesterday', summary: completedYTasks.length > 0 ? `${completedYTasks.length} project item${completedYTasks.length !== 1 ? 's' : ''} completed.` : 'No new approved update yesterday.', supporting: 'DECKARC reviewed and approved this progress.', count: completedYTasks.length || null, status: 'green', priority: 'Informational' }
      : { period: 'Yesterday', summary: yUpdates.length > 0 ? `${yUpdates.length} update${yUpdates.length !== 1 ? 's' : ''} submitted yesterday.` : 'No daily updates received yesterday.', supporting: yUpdates.length === 0 ? 'Follow up with the field team.' : blockersYUpdates.length > 0 ? `${blockersYUpdates.length} blocker${blockersYUpdates.length > 1 ? 's' : ''} reported. ${completedYTasks.length} task${completedYTasks.length !== 1 ? 's' : ''} completed.` : `${completedYTasks.length} task${completedYTasks.length !== 1 ? 's' : ''} completed. All updates received.`, count: yUpdates.length, status: yUpdates.length === 0 ? 'yellow' : yStatus, priority: yUpdates.length === 0 ? 'Time Sensitive' : yPri };

    // ── TODAY DETAILS ──
    const overdueDecisions   = decisions.filter(d => d.status !== 'Received' && d.needed_by_date && d.needed_by_date <= todayStr);
    const inspectionsToday   = inspections.filter(i => i.scheduled_date === todayStr);
    const pendingPermits     = permits.filter(p => !['Approved', 'Not Required', 'Closed'].includes(p.permit_status));
    const critAlerts         = alerts.filter(a => a.priority === 'Critical' || a.priority === 'Escalation');

    const adminDelayWork = pendingAdminReview + pendingClientNotice + clientReviewRequested + clientQuestions;
    const clientScheduleAct = clientPendingResp;
    const clientAct = overdueDecisions.length + clientScheduleAct;

    let tBubble: PulseSummary;
    if (isClient) {
      const clientMsg = clientAct > 0
        ? `${clientAct} item${clientAct !== 1 ? 's' : ''} need${clientAct === 1 ? 's' : ''} your attention.`
        : 'No action needed from you today.';
      const clientSub = clientReviewRequested > 0
        ? 'Your review request is being reviewed by DECKARC.'
        : clientScheduleAct > 0
        ? `${clientScheduleAct} schedule update${clientScheduleAct > 1 ? 's' : ''} need${clientScheduleAct === 1 ? 's' : ''} your review.`
        : clientAct > 0
        ? 'Please review your pending items. Responding on time keeps your project moving.'
        : 'Your project is progressing on schedule. DECKARC is coordinating the next step.';
      tBubble = { period: 'Today', summary: clientMsg, supporting: clientSub, count: clientAct || null, status: clientAct > 0 ? (clientReviewRequested > 0 ? 'red' : 'yellow') : 'green', priority: clientAct > 0 ? (clientReviewRequested > 0 ? 'Urgent' : 'Action Needed') : 'Informational' };
    } else if (isGC) {
      const gcSummary = abActive > 0
        ? `${abActive} item${abActive !== 1 ? 's' : ''} still need${abActive === 1 ? 's' : ''} attention.`
        : abResolved > 0
        ? `${abResolved}/${abTotal} addressed today.`
        : 'No critical items today.';
      const gcSupporting = abActive > 0
        ? (abResolved > 0 ? `${abResolved}/${abTotal} addressed today.` : (gcOpenDelays > 0 ? `${gcOpenDelays} delay item${gcOpenDelays > 1 ? 's' : ''} may impact schedule.` : inspectionsToday.length > 0 ? `${inspectionsToday.length} inspection${inspectionsToday.length > 1 ? 's' : ''} scheduled today.` : 'Open Action Board to review.'))
        : abResolved > 0
        ? 'All clear for today.'
        : 'All clear — confirm crew readiness.';
      tBubble = {
        period: 'Today',
        summary: gcSummary,
        supporting: gcSupporting,
        count: abActive > 0 ? abActive : abResolved > 0 ? abTotal : null,
        status: abActive > 0 ? (gcOpenDelays > 0 ? 'yellow' : 'green') : 'green',
        priority: abActive > 0 ? 'Action Needed' : 'Informational',
      };
    } else if (isSub) {
      const subActCount = rawSubBlocked.length;
      const firstBlocked = rawSubBlocked.find((t: any) => t.status === 'Blocked');
      const subSupporting = subActCount > 0
        ? firstBlocked
          ? `${firstBlocked.task_name} is blocked${firstBlocked.blocked_reason ? ': ' + firstBlocked.blocked_reason : '.'}`
          : 'Open My Tasks to see what needs your attention.'
        : 'Check your task list for today\'s work.';
      tBubble = {
        period: 'Today',
        summary: subActCount > 0
          ? `${subActCount} task${subActCount !== 1 ? 's' : ''} need${subActCount === 1 ? 's' : ''} your attention.`
          : 'No action needed on your tasks today.',
        supporting: subSupporting,
        count: subActCount || null,
        status: subActCount > 0 ? (rawSubBlocked.some((t: any) => t.status === 'Blocked') ? 'red' : 'yellow') : 'green',
        priority: subActCount > 0 ? 'Action Needed' : 'Informational',
      };
    } else {
      // Admin
      const adminActiveProjectIds = new Set(
        projects
          .filter(p => p.is_deleted !== true && p.is_archived !== true && p.status !== 'Completed' && p.status !== 'Archived' && p.status !== 'Deleted')
          .map(p => p.id)
      );
      const boardData = {
        tasks: tasks.filter(t => !['Completed', 'Closed', 'Cancelled'].includes(t.status)) as any[],
        permits: permits as any[],
        inspections: inspections as any[],
        payments: payments as any[],
        incidents: incidents as any[],
        decisions: decisions.filter(d => d.status !== 'Received') as any[],
        delays,
        actionItemsDb: (allActionItems as DbActionItemRow[]),
        activeProjectIds: adminActiveProjectIds,
        today: todayStr,
      };
      const adminAttnItems = getAdminNeedsAttentionItems(boardData);
      const adminAttnCount = adminAttnItems.length;
      const resolvedToday = allActionItems.filter(a => a.status === 'Done' && a.resolved_at && a.resolved_at.startsWith(todayStr)).length;

      const adminSummary = adminAttnCount > 0
        ? `${adminAttnCount} item${adminAttnCount !== 1 ? 's' : ''} still need${adminAttnCount === 1 ? 's' : ''} attention.`
        : resolvedToday > 0
        ? `${resolvedToday} resolved today. All clear.`
        : 'No critical items today.';
      const adminSupporting = adminAttnCount > 0
        ? (clientReviewRequested > 0
            ? `${clientReviewRequested} client review request${clientReviewRequested > 1 ? 's' : ''} need${clientReviewRequested === 1 ? 's' : ''} your response.`
            : pendingAdminReview > 0
            ? `${pendingAdminReview} schedule impact${pendingAdminReview > 1 ? 's' : ''} pending review.`
            : inspectionsToday.length > 0
            ? `${inspectionsToday.length} inspection${inspectionsToday.length > 1 ? 's' : ''} scheduled today.`
            : 'Open Action Board to review and respond.')
        : resolvedToday > 0
        ? 'All clear for today.'
        : 'All clear.';
      const adminStatus: PulseSummary['status'] = adminAttnCount > 0 ? (adminAttnCount > 2 ? 'dark-red' : 'red') : 'green';
      const adminPriority = adminAttnCount > 0 ? (adminAttnCount > 2 ? 'Escalation' : 'Critical') : 'Informational';
      tBubble = {
        period: 'Today',
        summary: adminSummary,
        supporting: adminSupporting,
        count: adminAttnCount > 0 ? adminAttnCount : resolvedToday > 0 ? resolvedToday : null,
        status: adminStatus,
        priority: adminPriority,
      };
    }

    // ── TOMORROW DETAILS ──
    const activeProjectIds = new Set(
      projects
        .filter(p => p.is_deleted !== true && p.status !== 'Completed' && p.status !== 'Archived' && p.status !== 'Deleted')
        .map(p => p.id)
    );

    const tmTasksAll = tasks.filter(t => {
      if (!activeProjectIds.has(t.project_id)) return false;
      if (t.status === 'Completed') return false;
      const startsTomorrow = t.planned_start_date === tmStr || t.projected_start_date === tmStr;
      const dueTomorrow    = t.planned_finish_date === tmStr || t.projected_finish_date === tmStr;
      const continuing     = t.status === 'In Progress'
        && (t.planned_start_date || t.projected_start_date) <= tmStr
        && (t.planned_finish_date || t.projected_finish_date) >= tmStr;
      return startsTomorrow || dueTomorrow || continuing;
    });

    const tmInspections = inspections.filter(i => i.scheduled_date === tmStr);
    const blockedTasks  = tasks.filter(t => activeProjectIds.has(t.project_id) && t.status === 'Blocked');
    const delayRisk     = delays.filter(d => ['Pending Admin Review', 'Possible Impact'].includes(d.schedule_impact_status));

    const tmTotal = tmTasksAll.length + tmInspections.length;

    let tmStatus: PulseSummary['status'] = 'green';
    let tmPri = 'Informational';
    if (blockedTasks.length > 0 || tmInspections.length > 0 || delayRisk.length > 0 || tmTasksAll.length > 0) { tmStatus = 'yellow'; tmPri = isClient ? 'Informational' : 'Time Sensitive'; }
    if (blockedTasks.length > 2) { tmStatus = 'red'; tmPri = isClient ? 'Informational' : 'Critical'; }

    let tmBubble: PulseSummary;
    if (isClient) {
      tmBubble = {
        period: 'Tomorrow',
        summary: 'No client action is needed tomorrow.',
        supporting: TOMORROW_REASONS[Math.floor(Math.random() * TOMORROW_REASONS.length)],
        count: null, status: 'green', priority: 'Informational',
      };
    } else if (isGC) {
      const gcTmCount = delayRisk.length > 0 ? delayRisk.length : (tmTotal || null);
      tmBubble = {
        period: 'Tomorrow',
        summary: delayRisk.length > 0
          ? `${delayRisk.length} delay item${delayRisk.length !== 1 ? 's' : ''} may impact tomorrow's schedule.`
          : tmTotal === 0 ? 'No items on tomorrow\'s plan.' : `${tmTotal} item${tmTotal !== 1 ? 's' : ''} on tomorrow's plan.`,
        supporting: blockedTasks.length > 0
          ? `${blockedTasks.length} blocked task${blockedTasks.length > 1 ? 's' : ''} — resolve today so work can proceed.`
          : tmInspections.length > 0
          ? `${tmInspections.length} inspection${tmInspections.length > 1 ? 's' : ''} scheduled.`
          : delayRisk.length > 0
          ? 'Review delay items so your crew has clear direction.'
          : 'Confirm crew readiness for tomorrow.',
        count: gcTmCount, status: tmStatus, priority: tmPri,
      };
    } else if (isSub) {
      const subBlocked = subDelays.filter(d => !['Resolved', 'Closed'].includes(d.status)).length;
      tmBubble = {
        period: 'Tomorrow',
        summary: subBlocked > 0
          ? 'Your assigned task may still be blocked tomorrow.'
          : 'No known blockers for your tasks tomorrow.',
        supporting: subBlocked > 0
          ? 'Your assigned task is waiting for inspection approval or a dependency.'
          : 'Check with your supervisor for tomorrow\'s schedule.',
        count: subBlocked || null,
        status: subBlocked > 0 ? 'yellow' : 'green',
        priority: subBlocked > 0 ? 'Time Sensitive' : 'Informational',
      };
    } else {
      // Admin
      tmBubble = {
        period: 'Tomorrow',
        summary: tmTotal === 0 ? 'No items on tomorrow\'s plan.' : `${tmTotal} item${tmTotal !== 1 ? 's' : ''} on tomorrow's plan.`,
        supporting: blockedTasks.length > 0
          ? `${blockedTasks.length} blocked task${blockedTasks.length > 1 ? 's' : ''} — resolve before end of day.`
          : delayRisk.length > 0
          ? `${delayRisk.length} schedule impact${delayRisk.length > 1 ? 's are' : ' is'} at risk of affecting tomorrow's schedule.`
          : tmInspections.length > 0
          ? `${tmInspections.length} inspection${tmInspections.length > 1 ? 's' : ''} scheduled.`
          : tmTotal === 0 ? 'Confirm crew availability.' : 'Confirm crew readiness before end of day.',
        count: tmTotal || null, status: tmStatus, priority: tmPri,
      };
    }

    const details: DetailedPulseData = {
      yesterday: {
        summary: yBubble.summary,
        supporting: yBubble.supporting,
        updatesCount: yUpdates.length,
        completedTasksCount: completedYTasks.length,
        completedTaskNames: completedYNames,
        blockersCount: blockersYUpdates.length,
        blockerDetails: blockerYTexts,
      },
      today: {
        summary: tBubble.summary,
        supporting: tBubble.supporting,
        actionItemsCount: abActive,
        actionItemTitles: (allActionItems || []).filter(a => a.status === 'Open').slice(0, 5).map(a => `Action item #${a.id}`),
        inspectionsTodayCount: inspectionsToday.length,
        inspectionsTodayDetails: inspectionsToday.map(i => `${i.inspection_type || 'Inspection'} (${i.result || 'Scheduled'})`).slice(0, 5),
        pendingPermitsCount: pendingPermits.length,
        pendingPermitNumbers: pendingPermits.map(p => `Permit ${p.permit_number || p.permit_type} (${p.permit_status})`).slice(0, 5),
        overdueDecisionsCount: overdueDecisions.length,
        overdueDecisionTitles: overdueDecisions.map(d => d.decision_title).slice(0, 5),
        openDelaysCount: openDelays,
        openDelayReasons: delays.map(d => d.delay_reason_text || d.delay_category || 'Schedule impact').filter(Boolean).slice(0, 5),
      },
      tomorrow: {
        summary: tmBubble.summary,
        supporting: tmBubble.supporting,
        tomorrowTasksCount: tmTasksAll.length,
        tomorrowTaskNames: tmTasksAll.map(t => t.task_name).slice(0, 5),
        tomorrowInspectionsCount: tmInspections.length,
        tomorrowInspectionDetails: tmInspections.map(i => `${i.inspection_type || 'Inspection'}`).slice(0, 5),
        blockedTasksCount: blockedTasks.length,
        blockedTaskNames: blockedTasks.map(t => t.task_name).slice(0, 5),
        delayRiskCount: delayRisk.length,
      },
    };

    return {
      summaries: {
        Yesterday: yBubble,
        Today: tBubble,
        Tomorrow: tmBubble,
      },
      details,
    };
  } catch (err) {
    console.error('Error fetching Project Pulse report for AI:', err);
    return {
      summaries: {
        Yesterday: { period: 'Yesterday', summary: 'All updates received yesterday.', supporting: 'DECKARC reviewed yesterday\'s progress.', count: 0, status: 'green', priority: 'Informational' },
        Today: { period: 'Today', summary: 'All clear today.', supporting: 'All critical items are up to date.', count: 0, status: 'green', priority: 'Informational' },
        Tomorrow: { period: 'Tomorrow', summary: 'No items on tomorrow\'s plan.', supporting: 'Confirm crew readiness before end of day.', count: 0, status: 'green', priority: 'Informational' },
      },
      details: {
        yesterday: { summary: 'All updates received yesterday.', supporting: 'DECKARC reviewed yesterday\'s progress.', updatesCount: 0, completedTasksCount: 0, completedTaskNames: [], blockersCount: 0, blockerDetails: [] },
        today: { summary: 'All clear today.', supporting: 'All critical items are up to date.', actionItemsCount: 0, actionItemTitles: [], inspectionsTodayCount: 0, inspectionsTodayDetails: [], pendingPermitsCount: 0, pendingPermitNumbers: [], overdueDecisionsCount: 0, overdueDecisionTitles: [], openDelaysCount: 0, openDelayReasons: [] },
        tomorrow: { summary: 'No items on tomorrow\'s plan.', supporting: 'Confirm crew readiness before end of day.', tomorrowTasksCount: 0, tomorrowTaskNames: [], tomorrowInspectionsCount: 0, tomorrowInspectionDetails: [], blockedTasksCount: 0, blockedTaskNames: [], delayRiskCount: 0 },
      },
    };
  }
}
