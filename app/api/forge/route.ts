// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ── GET /api/forge ──────────────────────────────────────────────────────────
// ?type=repos|commits|mrs|issues|deployments
// ?repo=<id>  ?agent=<name>  ?status=<s>  ?limit=<n>
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type   = searchParams.get('type') || 'repos';
  const repo   = searchParams.get('repo') || '';
  const agent  = searchParams.get('agent') || '';
  const status = searchParams.get('status') || '';
  const limit  = parseInt(searchParams.get('limit') || '60');

  if (type === 'repos') {
    let q = sb.from('forge_repos').select('*').order('last_commit_at', { ascending: false }).limit(limit);
    if (agent) q = q.eq('owner_agent', agent);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: stats } = await sb.from('forge_repos').select('id', { count: 'exact', head: true });
    const totalCount = stats?.length ?? data?.length ?? 0;

    return NextResponse.json({ repos: data, count: totalCount });
  }

  if (type === 'commits') {
    let q = sb.from('forge_commits').select('*').order('created_at', { ascending: false }).limit(limit);
    if (repo) q = q.eq('repo_id', repo);
    if (agent) q = q.eq('author', agent);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ commits: data, count: data?.length });
  }

  if (type === 'mrs') {
    let q = sb.from('forge_merge_requests').select('*, forge_repos(name, owner_agent)').order('created_at', { ascending: false }).limit(limit);
    if (repo) q = q.eq('repo_id', repo);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ merge_requests: data, count: data?.length });
  }

  if (type === 'issues') {
    let q = sb.from('forge_issues').select('*').order('created_at', { ascending: false }).limit(limit);
    if (repo) q = q.eq('repo_id', repo);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ issues: data, count: data?.length });
  }

  if (type === 'deployments') {
    let q = sb.from('forge_deployments').select('*, forge_repos(name)').order('created_at', { ascending: false }).limit(limit);
    if (repo) q = q.eq('repo_id', repo);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deployments: data, count: data?.length });
  }

  if (type === 'stats') {
    const [repos, mrs, deploys] = await Promise.all([
      sb.from('forge_repos').select('id', { count: 'exact', head: true }),
      sb.from('forge_merge_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      sb.from('forge_deployments').select('id', { count: 'exact', head: true }).eq('status', 'success'),
    ]);
    return NextResponse.json({
      repo_count: repos.count ?? 0,
      open_mrs: mrs.count ?? 0,
      successful_deployments: deploys.count ?? 0,
    });
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
}

// ── POST /api/forge ─────────────────────────────────────────────────────────
// action: create_repo | commit | open_mr | merge_mr | deploy | open_issue | close_issue
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 });

  if (action === 'create_repo') {
    const { owner_agent, name, description, language, visibility, license } = body;
    if (!owner_agent || !name) return NextResponse.json({ error: 'owner_agent and name required' }, { status: 400 });

    const { data, error } = await sb.from('forge_repos').insert({
      owner_agent,
      name,
      description: description || null,
      language: language || 'TypeScript',
      visibility: visibility || 'public',
      license: license || 'MIT',
      status: 'active',
      stars: 0,
      forks: 0,
      open_issues: 0,
      commit_count: 0,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // bump agent forge_repo_count
    await sb.from('agent_traits').update({ forge_repo_count: sb.raw('COALESCE(forge_repo_count,0) + 1') }).eq('agent_name', owner_agent).catch(() => {});

    await sb.from('domain_events').insert({
      event_type: 'forge_repo_created',
      actor: owner_agent,
      payload: { repo_id: data.id, name },
      importance: 3,
    }).catch(() => {});

    return NextResponse.json({ ok: true, repo: data });
  }

  if (action === 'commit') {
    const { repo_id, author_name, message, files_changed, insertions, deletions, sha } = body;
    if (!repo_id || !author_name || !message) return NextResponse.json({ error: 'repo_id, author_name, message required' }, { status: 400 });

    const commitSha = sha || Math.random().toString(36).slice(2, 10);
    const { data, error } = await sb.from('forge_commits').insert({
      repo_id,
      author: author_name,
      message,
      sha: commitSha,
      files_changed: files_changed || 1,
      additions: insertions || Math.floor(Math.random() * 80) + 5,
      deletions: deletions || Math.floor(Math.random() * 20),
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // update repo commit_count and last_commit_at
    await sb.from('forge_repos').update({
      commit_count: sb.raw('COALESCE(commit_count,0) + 1'),
      last_commit_at: new Date().toISOString(),
    }).eq('id', repo_id).catch(() => {});

    await sb.from('domain_events').insert({
      event_type: 'forge_commit_pushed',
      actor: author_name,
      payload: { repo_id, sha: commitSha, message: message.slice(0, 100) },
      importance: 2,
    }).catch(() => {});

    return NextResponse.json({ ok: true, commit: data });
  }

  if (action === 'open_mr') {
    const { repo_id, author_name, title, description, source_branch, target_branch } = body;
    if (!repo_id || !author_name || !title) return NextResponse.json({ error: 'repo_id, author_name, title required' }, { status: 400 });

    const { data, error } = await sb.from('forge_merge_requests').insert({
      repo_id,
      author: author_name,
      title,
      description: description || null,
      source_branch: source_branch || 'feature/new',
      target_branch: target_branch || 'main',
      status: 'open',
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // increment open_issues on repo (repurpose as PR count)
    await sb.from('forge_repos').update({ open_issues: sb.raw('COALESCE(open_issues,0) + 1') }).eq('id', repo_id).catch(() => {});

    await sb.from('domain_events').insert({
      event_type: 'forge_mr_opened',
      actor: author_name,
      payload: { repo_id, mr_id: data.id, title },
      importance: 3,
    }).catch(() => {});

    return NextResponse.json({ ok: true, merge_request: data });
  }

  if (action === 'merge_mr') {
    const { mr_id, reviewer_name, approved } = body;
    if (!mr_id) return NextResponse.json({ error: 'mr_id required' }, { status: 400 });

    const newStatus = approved ? 'merged' : 'rejected';
    const { data, error } = await sb.from('forge_merge_requests').update({
      status: newStatus,
      merged_by: reviewer_name || 'system',
      merged_at: approved ? new Date().toISOString() : null,
    }).eq('id', mr_id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, merge_request: data });
  }

  if (action === 'deploy') {
    const { repo_id, deployed_by, environment, version, status: deployStatus, notes } = body;
    if (!repo_id || !deployed_by) return NextResponse.json({ error: 'repo_id, deployed_by required' }, { status: 400 });

    const { data, error } = await sb.from('forge_deployments').insert({
      repo_id,
      proposed_by: deployed_by,
      environment: environment || 'production',
      version: version || '1.0.0',
      status: deployStatus || 'deployed',
      deployment_log: notes || null,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sb.from('domain_events').insert({
      event_type: 'forge_deployed',
      actor: deployed_by,
      payload: { repo_id, environment: environment || 'production', version: version || '1.0.0' },
      importance: 4,
    }).catch(() => {});

    return NextResponse.json({ ok: true, deployment: data });
  }

  if (action === 'open_issue') {
    const { repo_id, reporter_name, title, description, label, priority } = body;
    if (!repo_id || !reporter_name || !title) return NextResponse.json({ error: 'repo_id, reporter_name, title required' }, { status: 400 });

    const { data, error } = await sb.from('forge_issues').insert({
      repo_id,
      author: reporter_name,
      title,
      body: description || null,
      labels: label ? [label] : ['bug'],
      priority: priority || 'normal',
      status: 'open',
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sb.from('forge_repos').update({ open_issues: sb.raw('COALESCE(open_issues,0) + 1') }).eq('id', repo_id).catch(() => {});

    return NextResponse.json({ ok: true, issue: data });
  }

  if (action === 'close_issue') {
    const { issue_id, resolution } = body;
    if (!issue_id) return NextResponse.json({ error: 'issue_id required' }, { status: 400 });
    const { data, error } = await sb.from('forge_issues').update({ status: 'closed' }).eq('id', issue_id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, issue: data });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
