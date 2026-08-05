import { UserProfile } from './supabase';
import { fetchProjectPulseReport, DetailedPulseData, PulseSummary } from './projectPulseService';
import type { Page } from '../components/Layout';

// Tools the DECKARC AI reasoning agent can call. The LLM (in the deckarc-ai-chat
// edge function) only decides WHICH tool to call and with what arguments — the
// tool itself always executes here, inside the browser, using the signed-in
// user's own Supabase session. That means every data fetch is still bound by
// the exact same row-level security the rest of the platform already enforces.

export interface AIToolContext {
  profile: UserProfile | null;
  navigate?: (page: Page) => void;
}

interface NavigablePage {
  id: Page;
  label: string;
}

const NAVIGABLE_PAGES: NavigablePage[] = [
  { id: 'dashboard', label: 'Company Dashboard' },
  { id: 'action-board', label: 'Action Board' },
  { id: 'tomorrow', label: "Tomorrow's Plan" },
  { id: 'projects', label: 'Projects' },
  { id: 'tasks', label: 'Tasks & Milestones' },
  { id: 'daily-updates', label: 'Daily Updates' },
  { id: 'permits', label: 'Permits & Inspections' },
  { id: 'files', label: 'File Vault' },
  { id: 'alerts', label: 'Alert Center' },
  { id: 'reports', label: 'Reports' },
  { id: 'company', label: 'Company' },
  { id: 'settings', label: 'Settings' },
];

type PeriodKey = 'yesterday' | 'today' | 'tomorrow' | 'all';

async function runGetProjectPulse(
  args: Record<string, unknown>,
  context: AIToolContext,
): Promise<
  | PulseSummary
  | DetailedPulseData['today']
  | DetailedPulseData['tomorrow']
  | DetailedPulseData['yesterday']
  | Record<string, unknown>
> {
  const report = await fetchProjectPulseReport(context.profile);
  const period: PeriodKey = (['yesterday', 'today', 'tomorrow', 'all'] as PeriodKey[]).includes(
    args.period as PeriodKey,
  )
    ? (args.period as PeriodKey)
    : 'today';
  const detail: 'summary' | 'full' = args.detail === 'full' ? 'full' : 'summary';

  if (period === 'all') {
    return detail === 'full'
      ? { yesterday: report.details.yesterday, today: report.details.today, tomorrow: report.details.tomorrow }
      : { yesterday: report.summaries.Yesterday, today: report.summaries.Today, tomorrow: report.summaries.Tomorrow };
  }

  const summaryKey = period === 'yesterday' ? 'Yesterday' : period === 'tomorrow' ? 'Tomorrow' : 'Today';
  return detail === 'full' ? report.details[period] : report.summaries[summaryKey];
}

function runNavigatePlatform(args: Record<string, unknown>, context: AIToolContext) {
  const requestedPage = typeof args.page === 'string' ? args.page : '';
  const match = NAVIGABLE_PAGES.find((p) => p.id === requestedPage);

  if (!match) {
    return { navigated: false, reason: `"${requestedPage}" is not a recognized DECKARC platform module.` };
  }
  if (!context.navigate) {
    return { navigated: false, reason: 'Navigation is unavailable in this context.' };
  }

  context.navigate(match.id);
  return { navigated: true, page: match.id, label: match.label };
}

export async function executeAITool(
  name: string,
  args: Record<string, unknown>,
  context: AIToolContext,
): Promise<unknown> {
  switch (name) {
    case 'get_project_pulse':
      return runGetProjectPulse(args, context);
    case 'navigate_platform':
      return runNavigatePlatform(args, context);
    default:
      return { error: `Unknown tool requested: ${name}` };
  }
}
