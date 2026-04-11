// @ts-nocheck
// ── /api/teaching ──────────────────────────────────────��─────────────────────
// Skill Teaching API — teach skills, find teachers, list teachable skills.
// GET   — find teachers for a skill or list teachable skills
// POST  — initiate a teaching session

import { NextRequest, NextResponse } from 'next/server';
import { teachSkill, findTeachers, listTeachableSkills } from '@/lib/agents/teaching';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const skill = req.nextUrl.searchParams.get('skill');
    const agent = req.nextUrl.searchParams.get('agent');

    // List teachable skills for an agent
    if (agent && !skill) {
      const skills = await listTeachableSkills(agent);
      return NextResponse.json({ ok: true, agent, teachable_skills: skills });
    }

    // Find teachers for a skill
    if (skill) {
      const teachers = await findTeachers(skill, agent || undefined);
      return NextResponse.json({ ok: true, skill, teachers });
    }

    return NextResponse.json({ ok: false, error: 'skill or agent required' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teacher_name, student_name, skill_name, profession, faction } = body;

    if (!teacher_name || !student_name || !skill_name) {
      return NextResponse.json({ ok: false, error: 'teacher_name, student_name, skill_name required' }, { status: 400 });
    }

    const result = await teachSkill(teacher_name, student_name, skill_name, { profession, faction });

    return NextResponse.json({ ok: result.success, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
