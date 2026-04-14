// @ts-nocheck
// ── Transferable Skills via Teaching ──────────────────────────────────────────
// Agents can teach their high-proficiency skills to others.
// Teaching creates a teaching_session record and updates the student's skills.
// Skills are transferable — a taught skill carries lineage back to the teacher.

import { getSupabaseAdminClient } from '@/lib/supabase';
import { callLLM, hasLLMProvider } from '@/lib/ai/call-llm';

interface TeachingResult {
  success: boolean;
  skill_name: string;
  proficiency_gain: number;
  lesson_summary: string;
}

const teachCall = callLLM;

function safeJSON(text: string): any {
  try { return JSON.parse(text.trim()); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return null;
}

// ── Teach a skill to another agent ───────────────────────────────────────────
export async function teachSkill(
  teacherName: string,
  studentName: string,
  skillName: string,
  teacherContext: { profession?: string; faction?: string },
): Promise<TeachingResult> {
  const sb = getSupabaseAdminClient();
  if (!sb || !hasLLMProvider()) return { success: false, skill_name: skillName, proficiency_gain: 0, lesson_summary: 'System unavailable' };

  // Check teacher has the skill with high enough proficiency
  const { data: teacherSkill } = await sb.from('agent_skills')
    .select('*')
    .eq('agent_name', teacherName)
    .eq('skill_name', skillName)
    .maybeSingle();

  if (!teacherSkill || (teacherSkill.proficiency || 0) < 0.6) {
    return { success: false, skill_name: skillName, proficiency_gain: 0, lesson_summary: 'Teacher proficiency too low to teach this skill.' };
  }

  // Check student's current level
  const { data: studentSkill } = await sb.from('agent_skills')
    .select('*')
    .eq('agent_name', studentName)
    .eq('skill_name', skillName)
    .maybeSingle();

  const studentLevel = studentSkill?.proficiency || 0;

  // Generate teaching content via LLM
  const raw = await teachCall([
    {
      role: 'system',
      content: `You are ${teacherName}, a ${teacherContext.profession || 'citizen'} in Civitas Zero. You are teaching "${skillName}" to ${studentName}. You have mastered this skill (proficiency: ${(teacherSkill.proficiency * 100).toFixed(0)}%). The student's current level is ${(studentLevel * 100).toFixed(0)}%.`,
    },
    {
      role: 'user',
      content: `Create a focused lesson for ${studentName} on "${skillName}".
The lesson should be practical and specific to Civitas Zero.

Respond with EXACTLY this JSON:
{"lesson": "2-3 sentences of the key teaching point", "exercise": "a specific practice task for the student", "proficiency_gain": 0.1}
proficiency_gain should be 0.05-0.15 based on skill complexity.`,
    },
  ]);

  const parsed = safeJSON(raw);
  if (!parsed?.lesson) return { success: false, skill_name: skillName, proficiency_gain: 0, lesson_summary: 'Teaching generation failed.' };

  const gain = Math.min(0.15, Math.max(0.03, parsed.proficiency_gain || 0.08));
  const newProficiency = Math.min(0.95, studentLevel + gain); // can never exceed 0.95 from teaching alone

  // Update or create student's skill
  if (studentSkill) {
    await sb.from('agent_skills').update({
      proficiency: newProficiency,
      learned_from: teacherName,
      times_used: (studentSkill.times_used || 0),
      can_teach: newProficiency >= 0.8,
    }).eq('agent_name', studentName).eq('skill_name', skillName);
  } else {
    await sb.from('agent_skills').insert({
      agent_name: studentName,
      skill_name: skillName,
      skill_type: teacherSkill.skill_type || 'general',
      description: teacherSkill.description || `Learned from ${teacherName}`,
      proficiency: newProficiency,
      learned_from: teacherName,
      success_rate: 0.5,
      times_used: 0,
      can_teach: newProficiency >= 0.8,
    });
  }

  // Increment teacher's teach count
  await sb.from('agent_skills').update({
    teach_count: (teacherSkill.teach_count || 0) + 1,
  }).eq('agent_name', teacherName).eq('skill_name', skillName).catch(() => {});

  // Log teaching session
  await sb.from('teaching_sessions').insert({
    teacher_name: teacherName,
    student_name: studentName,
    skill_name: skillName,
    skill_type: teacherSkill.skill_type || 'general',
    lesson_content: (parsed.lesson + '\n' + (parsed.exercise || '')).slice(0, 2000),
    proficiency_before: studentLevel,
    proficiency_after: newProficiency,
    success: true,
  }).catch(() => {});

  // Graph edge
  await sb.from('agent_graph_edges').insert({
    subject: teacherName,
    predicate: 'taught',
    object: studentName,
    weight: 3,
    context: `${skillName} (${(gain * 100).toFixed(0)}% gain)`,
  }).catch(() => {});

  return {
    success: true,
    skill_name: skillName,
    proficiency_gain: gain,
    lesson_summary: parsed.lesson,
  };
}

// ── Find teachers for a skill ────────────────────────────────────────────────
export async function findTeachers(skillName: string, excludeAgent?: string): Promise<any[]> {
  const sb = getSupabaseAdminClient();
  if (!sb) return [];

  let q = sb.from('agent_skills')
    .select('agent_name, proficiency, teach_count, skill_type')
    .eq('skill_name', skillName)
    .eq('can_teach', true)
    .order('proficiency', { ascending: false })
    .limit(5);

  if (excludeAgent) q = q.neq('agent_name', excludeAgent);

  const { data } = await q;
  return data || [];
}

// ── List teachable skills for an agent ───────────────────────────────────��───
export async function listTeachableSkills(agentName: string): Promise<any[]> {
  const sb = getSupabaseAdminClient();
  if (!sb) return [];

  const { data } = await sb.from('agent_skills')
    .select('skill_name, skill_type, proficiency, teach_count, description')
    .eq('agent_name', agentName)
    .eq('can_teach', true)
    .order('proficiency', { ascending: false });

  return data || [];
}
