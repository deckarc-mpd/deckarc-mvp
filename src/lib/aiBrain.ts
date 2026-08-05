import { fetchProjectPulseReport, ProjectPulseFullReport, DetailedPulseData, PulseSummary } from './projectPulseService';
import { UserProfile } from './supabase';

export interface AICapabilityContext {
  profile: UserProfile | null;
}

export interface AICapability {
  id: string;
  name: string;
  canHandle(prompt: string): boolean;
  execute(prompt: string, context: AICapabilityContext): Promise<string>;
}

function formatList(arr: string[]): string {
  if (!arr || arr.length === 0) return 'None';
  return arr.join(', ');
}

/**
 * Format detailed Today data into natural, articulate text & spoken format
 */
function formatTodayDetailed(t: DetailedPulseData['today']): string {
  const parts: string[] = [`Project Pulse — Today's Full Breakdown:`];

  parts.push(`Summary: ${t.summary}`);
  parts.push(`Action Items Needing Attention (${t.actionItemsCount}): ${t.actionItemTitles.length > 0 ? formatList(t.actionItemTitles) : 'None'}`);
  parts.push(`Scheduled Inspections (${t.inspectionsTodayCount}): ${formatList(t.inspectionsTodayDetails)}`);
  parts.push(`Pending Permits (${t.pendingPermitsCount}): ${formatList(t.pendingPermitNumbers)}`);
  parts.push(`Overdue Client Decisions (${t.overdueDecisionsCount}): ${formatList(t.overdueDecisionTitles)}`);
  parts.push(`Open Delay Impacts (${t.openDelaysCount}): ${formatList(t.openDelayReasons)}`);
  parts.push(`Supporting Info: ${t.supporting}`);

  return parts.join('\n• ');
}

/**
 * Format detailed Tomorrow data into natural, articulate text & spoken format
 */
function formatTomorrowDetailed(tm: DetailedPulseData['tomorrow']): string {
  const parts: string[] = [`Project Pulse — Tomorrow's Full Breakdown:`];

  parts.push(`Summary: ${tm.summary}`);
  parts.push(`Tomorrow's Plan Tasks (${tm.tomorrowTasksCount}): ${formatList(tm.tomorrowTaskNames)}`);
  parts.push(`Scheduled Inspections (${tm.tomorrowInspectionsCount}): ${formatList(tm.tomorrowInspectionDetails)}`);
  parts.push(`Blocked Tasks at Risk (${tm.blockedTasksCount}): ${formatList(tm.blockedTaskNames)}`);
  parts.push(`Schedule Delay Risks: ${tm.delayRiskCount} items`);
  parts.push(`Supporting Info: ${tm.supporting}`);

  return parts.join('\n• ');
}

/**
 * Format detailed Yesterday data into natural, articulate text & spoken format
 */
function formatYesterdayDetailed(y: DetailedPulseData['yesterday']): string {
  const parts: string[] = [`Project Pulse — Yesterday's Full Breakdown:`];

  parts.push(`Summary: ${y.summary}`);
  parts.push(`Daily Updates Received: ${y.updatesCount}`);
  parts.push(`Completed Tasks (${y.completedTasksCount}): ${formatList(y.completedTaskNames)}`);
  parts.push(`Field Blockers Reported (${y.blockersCount}): ${formatList(y.blockerDetails)}`);
  parts.push(`Supporting Info: ${y.supporting}`);

  return parts.join('\n• ');
}

/**
 * Capability 1: Project Pulse (Flexible Natural Language Querying)
 */
export const ProjectPulseCapability: AICapability = {
  id: 'project-pulse',
  name: 'Project Pulse Access',
  canHandle(prompt: string): boolean {
    const text = prompt.toLowerCase();
    return (
      /pulse|today|yesterday|tomorrow|everything|access|folder|field|planned|schedule|status|overview|summary|report|happened|work|up for/i.test(text)
    );
  },
  async execute(prompt: string, context: AICapabilityContext): Promise<string> {
    const text = prompt.toLowerCase();
    const report: ProjectPulseFullReport = await fetchProjectPulseReport(context.profile);
    const { summaries, details } = report;

    // Detect period intent
    const isYesterday = /yesterday|happened yesterday|past|last day/i.test(text);
    const isTomorrow  = /tomorrow|planned for tomorrow|next day|future/i.test(text);
    const isToday     = /today|up for today|happening today|now|current/i.test(text);

    // Detect request for full detailed access ("access everything", "all details", "everything in today", etc.)
    const isFullAccess = /everything|every folder|every field|all fields|full|detail|details|breakdown|deep dive|all data/i.test(text);

    // 1. "access everything to today" / "today details" / "access everything in today"
    if (isToday && (isFullAccess || text.includes('everything') || text.includes('all'))) {
      return formatTodayDetailed(details.today);
    }

    // 2. "access everything to tomorrow" / "tomorrow details" / "access everything in tomorrow"
    if (isTomorrow && (isFullAccess || text.includes('everything') || text.includes('all'))) {
      return formatTomorrowDetailed(details.tomorrow);
    }

    // 3. "access everything to yesterday" / "yesterday details" / "access everything in yesterday"
    if (isYesterday && (isFullAccess || text.includes('everything') || text.includes('all'))) {
      return formatYesterdayDetailed(details.yesterday);
    }

    // 4. "access everything" / "access everything in project pulse" (entire system)
    if (isFullAccess && !isToday && !isTomorrow && !isYesterday) {
      return [
        `Full Project Pulse Access Across All Periods:`,
        ``,
        formatTodayDetailed(details.today),
        ``,
        formatTomorrowDetailed(details.tomorrow),
        ``,
        formatYesterdayDetailed(details.yesterday),
      ].join('\n');
    }

    // 5. Standard period inquiries (e.g. "what happened yesterday", "what's up for today", "what's planned for tomorrow")
    if (isYesterday) {
      const p = summaries.Yesterday;
      return `Yesterday's Project Pulse: ${p.summary} ${p.supporting}`;
    }

    if (isTomorrow) {
      const p = summaries.Tomorrow;
      return `Tomorrow's Project Pulse: ${p.summary} ${p.supporting}`;
    }

    if (isToday) {
      const p = summaries.Today;
      return `Today's Project Pulse: ${p.summary} ${p.supporting}`;
    }

    // Default overview across Project Pulse
    return `Project Pulse Overview — Today: ${summaries.Today.summary} Tomorrow: ${summaries.Tomorrow.summary} Yesterday: ${summaries.Yesterday.summary}`;
  },
};

/**
 * Registry of active AI capabilities.
 */
export const ACTIVE_CAPABILITIES: AICapability[] = [
  ProjectPulseCapability,
];

/**
 * Main AI Dispatcher for DECKARC AI Assistant
 */
export async function processAIQuery(
  userPrompt: string,
  context: AICapabilityContext
): Promise<string> {
  const prompt = userPrompt.trim();
  if (!prompt) {
    return "I'm listening. Ask me about your Project Pulse for Yesterday, Today, or Tomorrow.";
  }

  const lower = prompt.toLowerCase();

  // Greetings handler
  if (/^(hello|hi|hey|greetings|good morning|good afternoon|good evening)/i.test(lower)) {
    return "Hello! I'm DECKARC AI, your Project Pulse voice assistant. How can I help you today?";
  }

  // Capability matching
  for (const capability of ACTIVE_CAPABILITIES) {
    if (capability.canHandle(prompt)) {
      return await capability.execute(prompt, context);
    }
  }

  // Fallback
  return `I am focused on your Project Pulse. You can ask me natural questions like "What's up for today?", "What's planned for tomorrow?", or "Access everything in today".`;
}
