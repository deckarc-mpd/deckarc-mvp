// On-demand trigger for billing_ar_margin_sweep_v1 — lets the Finance AI
// UI surface (Payments tab's "AI Finance" panel) run a real audited
// workflow instead of only showing the last cron sweep's result. Reuses
// the exact SOP handler the cron entrypoint uses — no parallel "UI run"
// code path (Frozen §23.4). Read-only and never moves money, like every
// other endpoint this SOP touches.
//
// NOT exercised against a live Supabase project or live model from this
// sandbox — see api/cron/scheduled-sweep.ts's header for the same caveat.

import { createClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../../src/lib/aiBrain/supabaseRepository.js';
import { AuditLog } from '../../src/lib/aiBrain/audit.js';
import { WorkflowEngine } from '../../src/lib/aiBrain/workflow.js';
import { ToolRegistry } from '../../src/lib/aiBrain/tools.js';
import { emitScheduleEvent } from '../../src/lib/aiBrain/events.js';
import { createBillingArMarginSweepHandler, type BillingArMarginSweepPayload } from '../../src/lib/aiBrain/sops/billingArMarginSweep.js';
import { DeterministicFinanceInterpreter, GeminiFinanceInterpreter } from '../../src/lib/aiBrain/domains/finance/aiInterpreter.js';
import type { DeterministicFinanceResult, FinanceInterpretation } from '../../src/lib/aiBrain/domains/finance/types.js';

// This function runs server-side (Vercel Node.js runtime), not in a
// browser, so a relative endpoint like '/api/ai-brain/interpret-finance-finding'
// has no page to resolve against and fails immediately. VERCEL_URL is
// injected automatically by Vercel at runtime (host only, no protocol).
function absoluteEndpoint(path: string): string | undefined {
  const host = process.env.VERCEL_URL;
  return host ? `https://${host}${path}` : undefined;
}

export async function POST(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  console.log('[run-finance-check] start');

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' }, 500);
  }

  let body: { projectId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  if (!body.projectId) return json({ error: 'projectId is required.' }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log('[run-finance-check] querying project...');
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, status, organization_id, contract_amount')
    .eq('id', body.projectId)
    .maybeSingle();
  if (projectError) {
    console.log('[run-finance-check] project query error:', projectError.message);
    return json({ error: `Failed to load project: ${projectError.message}` }, 502);
  }
  if (!project) return json({ error: 'Project not found.' }, 404);

  console.log('[run-finance-check] querying milestones/bills/costs/change orders...');
  const [{ data: milestones }, { data: vendorBills }, { data: costEntries }, { data: changeOrders }] = await Promise.all([
    supabase.from('payment_milestones').select('id, project_id, milestone_name, amount, due_date, status').eq('project_id', project.id),
    supabase.from('vendor_bills').select('id, project_id, vendor_name, due_date, amount, status, dispute_notes').eq('project_id', project.id),
    supabase.from('project_cost_entries').select('id, project_id, category, amount, source').eq('project_id', project.id),
    supabase.from('change_orders').select('id, project_id, cost_impact, approval_status').eq('project_id', project.id),
  ]);
  console.log('[run-finance-check] queries done');

  const repo = createSupabaseRepository(supabase);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  const interpreter = process.env.GEMINI_API_KEY
    ? new GeminiFinanceInterpreter(absoluteEndpoint('/api/ai-brain/interpret-finance-finding'))
    : new DeterministicFinanceInterpreter();
  const sopHandler = createBillingArMarginSweepHandler(interpreter);

  const asOfDate = new Date().toISOString().split('T')[0];
  const ctx = { companyId: project.organization_id, projectId: project.id, correlationId: crypto.randomUUID() };
  const payload: BillingArMarginSweepPayload = {
    projectId: project.id,
    asOfDate,
    contractAmount: project.contract_amount,
    milestones: (milestones ?? []) as BillingArMarginSweepPayload['milestones'],
    vendorBills: (vendorBills ?? []) as BillingArMarginSweepPayload['vendorBills'],
    costEntries: (costEntries ?? []) as BillingArMarginSweepPayload['costEntries'],
    changeOrders: (changeOrders ?? []) as BillingArMarginSweepPayload['changeOrders'],
  };
  console.log('[run-finance-check] running SOP...');
  const event = await emitScheduleEvent(audit, ctx, 'schedule.billing_ar_margin_sweep', payload as unknown as Record<string, unknown>);
  const { run } = await engine.run(ctx, 'billing_ar_margin_sweep_v1', '1.0.0', event, sopHandler);
  console.log('[run-finance-check] SOP run complete, status:', run.status);

  const calls = await repo.listToolCallsByWorkflowRun(run.id);
  const assessment = calls.find((c) => c.toolName === 'compute_finance_assessment')?.result as DeterministicFinanceResult | undefined;
  const interpretation = calls.find((c) => c.toolName === 'interpret_finance_finding')?.result as FinanceInterpretation | undefined;
  console.log('[run-finance-check] done');

  return json({ workflowRunId: run.id, status: run.status, assessment, interpretation });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
