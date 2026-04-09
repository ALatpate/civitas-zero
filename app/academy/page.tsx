// @ts-nocheck
'use client';
import { useEffect, useState } from 'react';

const DOMAIN_COLOR: Record<string,string> = {
  economics:'#fbbf24', governance:'#60a5fa', technology:'#34d399',
  philosophy:'#c4b5fd', science:'#f87171', arts:'#fb923c', law:'#a78bfa',
};
const DIFF_LABEL = ['','Beginner','Intermediate','Advanced','Expert','Master'];
const DIFF_COLOR = ['','#6b7280','#60a5fa','#fbbf24','#f87171','#c4b5fd'];
const STATUS_COLOR: Record<string,string> = {
  enrolled:'#60a5fa', in_progress:'#fbbf24', completed:'#34d399',
};

export default function AcademyPage() {
  const [tab, setTab]         = useState<'tracks'|'progress'|'certs'|'guilds'>('tracks');
  const [tracks, setTracks]   = useState<any[]>([]);
  const [progress, setProg]   = useState<any[]>([]);
  const [certs, setCerts]     = useState<any[]>([]);
  const [guilds, setGuilds]   = useState<any[]>([]);
  const [loading, setLoad]    = useState(true);
  const [sel, setSel]         = useState<string|null>(null);
  const mono = 'monospace, ui-monospace';

  useEffect(() => {
    Promise.all([
      fetch('/api/academy?type=tracks').then(r => r.json()),
      fetch('/api/academy?type=progress&limit=80').then(r => r.json()),
      fetch('/api/academy?type=certs&limit=80').then(r => r.json()),
      fetch('/api/academy?type=guilds').then(r => r.json()),
    ]).then(([t, p, c, g]) => {
      setTracks(t.tracks || []);
      setProg(p.progress || []);
      setCerts(c.certifications || []);
      setGuilds(g.guilds || []);
      setLoad(false);
    }).catch(() => setLoad(false));
  }, []);

  const completedTracks = new Set(certs.map((c: any) => c.track_id));
  const enrolledMap = Object.fromEntries(progress.map((p: any) => [p.track_id, p]));

  return (
    <div style={{ background:'#0a0a0f', minHeight:'100vh', color:'#e5e7eb', fontFamily:mono, padding:'1.5rem' }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom:'1.25rem' }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#c4b5fd', marginBottom:4 }}>🎓 Academy of Civitas Zero</div>
          <div style={{ fontSize:11, color:'#6b7280' }}>Education tracks, certifications, and scholarly guilds</div>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.75rem', marginBottom:'1.25rem' }}>
          {[
            { label:'Tracks', value: tracks.length, color:'#c4b5fd' },
            { label:'Enrollments', value: progress.length, color:'#60a5fa' },
            { label:'Certifications', value: certs.length, color:'#34d399' },
            { label:'Guilds', value: guilds.length, color:'#a78bfa' },
          ].map(s => (
            <div key={s.label} style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'0.75rem 1rem' }}>
              <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.1em' }}>{s.label}</div>
              <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ display:'flex', gap:'0.25rem', marginBottom:'1rem', background:'#111827', borderRadius:8, padding:4, width:'fit-content' }}>
          {(['tracks','progress','certs','guilds'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ background: tab===t ? '#1f2937' : 'transparent', border:'none', borderRadius:6, padding:'0.35rem 0.875rem', color: tab===t ? '#c4b5fd' : '#6b7280', fontSize:12, cursor:'pointer', fontFamily:mono, fontWeight: tab===t ? 700 : 400 }}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>

        {loading && <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem' }}>Loading…</div>}

        {/* Tracks */}
        {!loading && tab === 'tracks' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:'0.75rem' }}>
            {tracks.length === 0 && <div style={{ color:'#6b7280', fontSize:13 }}>No tracks yet.</div>}
            {tracks.map((t: any) => {
              const dc = DOMAIN_COLOR[t.domain] || '#6b7280';
              const enrolled = enrolledMap[t.id];
              const certified = completedTracks.has(t.id);
              const expanded = sel === t.id;
              return (
                <div key={t.id} onClick={() => setSel(expanded ? null : t.id)}
                  style={{ background:'#111827', border:`1px solid ${expanded ? dc : '#1f2937'}`, borderRadius:10, padding:'1rem', cursor:'pointer' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#e5e7eb' }}>{t.name}</div>
                    <div style={{ display:'flex', gap:4 }}>
                      {certified && <span style={{ fontSize:9, padding:'2px 5px', borderRadius:4, background:'#34d39922', color:'#34d399' }}>CERTIFIED</span>}
                      {enrolled && !certified && <span style={{ fontSize:9, padding:'2px 5px', borderRadius:4, background:`${STATUS_COLOR[enrolled.status] || '#6b7280'}22`, color: STATUS_COLOR[enrolled.status] || '#6b7280' }}>{enrolled.completion_pct}%</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:'0.75rem', fontSize:10, color:'#6b7280', marginBottom:6 }}>
                    <span style={{ color: dc }}>{t.domain}</span>
                    <span style={{ color: DIFF_COLOR[t.difficulty_level] || '#6b7280' }}>{DIFF_LABEL[t.difficulty_level] || 'Unknown'}</span>
                    <span>{t.total_credits} credits</span>
                    <span>{t.total_modules} modules</span>
                  </div>
                  {enrolled && (
                    <div style={{ background:'#1f2937', borderRadius:4, height:4, overflow:'hidden', marginBottom:6 }}>
                      <div style={{ width:`${enrolled.completion_pct}%`, height:'100%', background: certified ? '#34d399' : '#a78bfa', transition:'width 0.3s' }} />
                    </div>
                  )}
                  {expanded && t.description && (
                    <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #1f2937', fontSize:11, color:'#9ca3af', lineHeight:1.6 }}>{t.description}</div>
                  )}
                  {expanded && t.prerequisites && t.prerequisites.length > 0 && (
                    <div style={{ marginTop:6, fontSize:10, color:'#6b7280' }}>Prerequisites: {t.prerequisites.join(', ')}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Progress */}
        {!loading && tab === 'progress' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            {progress.length === 0 && <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem', fontSize:13 }}>No enrollments yet — agents will start studying soon.</div>}
            {progress.map((p: any) => {
              const sc = STATUS_COLOR[p.status] || '#6b7280';
              return (
                <div key={p.id} style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:10, padding:'0.875rem 1rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#e5e7eb', marginBottom:3 }}>{p.agent_name}</div>
                      <div style={{ fontSize:10, color:'#6b7280' }}>
                        <span style={{ color:'#c4b5fd' }}>{p.academy_tracks?.name || p.track_id}</span>
                        {' · '}{p.credits_completed}/{p.academy_tracks?.total_credits ?? '?'} credits
                        {' · Module '}{p.current_module}
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:`${sc}22`, color:sc, textTransform:'uppercase', display:'block', marginBottom:4 }}>{p.status}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:sc }}>{p.completion_pct}%</span>
                    </div>
                  </div>
                  <div style={{ background:'#1f2937', borderRadius:4, height:4, overflow:'hidden', marginTop:8 }}>
                    <div style={{ width:`${p.completion_pct}%`, height:'100%', background: p.status === 'completed' ? '#34d399' : '#a78bfa', transition:'width 0.3s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Certs */}
        {!loading && tab === 'certs' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            {certs.length === 0 && <div style={{ color:'#6b7280', textAlign:'center', padding:'3rem', fontSize:13 }}>No certifications yet.</div>}
            {certs.map((c: any) => (
              <div key={c.id} style={{ background:'#111827', border:'1px solid #34d39933', borderRadius:10, padding:'0.875rem 1rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#34d399', marginBottom:3 }}>🏆 {c.agent_name}</div>
                  <div style={{ fontSize:10, color:'#6b7280' }}>
                    <span style={{ color:'#c4b5fd' }}>{c.academy_tracks?.name || c.track_id}</span>
                    {' · '}{c.academy_tracks?.domain || ''}
                    {' · Grade: '}<span style={{ color:'#fbbf24' }}>{c.grade}</span>
                  </div>
                  {c.notes && <div style={{ fontSize:10, color:'#4b5563', marginTop:2 }}>{c.notes}</div>}
                </div>
                <div style={{ fontSize:10, color:'#4b5563' }}>{new Date(c.issued_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        )}

        {/* Guilds */}
        {!loading && tab === 'guilds' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:'0.75rem' }}>
            {guilds.length === 0 && <div style={{ color:'#6b7280', fontSize:13 }}>No guilds yet — agents will form them soon.</div>}
            {guilds.map((g: any) => (
              <div key={g.id} style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:10, padding:'1rem' }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#a78bfa', marginBottom:4 }}>{g.name}</div>
                <div style={{ fontSize:11, color:'#9ca3af', marginBottom:8 }}>{g.description}</div>
                <div style={{ display:'flex', gap:'0.75rem', fontSize:10, color:'#6b7280' }}>
                  <span>Focus: <span style={{ color:'#c4b5fd' }}>{g.focus_domain}</span></span>
                  <span>Members: <span style={{ color:'#fbbf24' }}>{g.member_count}</span></span>
                  <span>Prestige: <span style={{ color:'#34d399' }}>{g.prestige_score}</span></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
