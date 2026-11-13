import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowRight, CalendarDays, Check, CircleAlert, Clock3, Dumbbell, LayoutDashboard, MonitorPlay, Pencil, Plus, RefreshCw, Search, Settings2, ShieldCheck, Upload, Users, Video, X } from 'lucide-react';
import { api, hasAdminSession, type Dashboard, type Exercise, type Member, type Round, type Schedule, type Screen } from './api';

type Section = 'overview' | 'screens' | 'content' | 'rotation' | 'members';
const sections: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'screens', label: 'Screens', icon: MonitorPlay },
  { id: 'content', label: 'Exercise content', icon: Dumbbell },
  { id: 'rotation', label: 'Rotation', icon: CalendarDays },
  { id: 'members', label: 'Members', icon: Users },
];
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const addDays = (date: string, days: number) => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
const shortDate = (date: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'red' | 'green' | 'amber' | 'neutral' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Empty({ icon: Icon, title, text }: { icon: typeof Activity; title: string; text: string }) {
  return <div className="empty"><div className="empty-icon"><Icon size={23} /></div><h3>{title}</h3><p>{text}</p></div>;
}

const emptyMember = (today: string): Omit<Member, 'id' | 'status'> => ({ fullName: '', phone: '', email: '', startsOn: today, expiresOn: today, notes: '' });

export default function App() {
  const [authenticated, setAuthenticated] = useState(hasAdminSession);
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [section, setSection] = useState<Section>('overview');
  const [roundId, setRoundId] = useState(1);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [screenSchedules, setScreenSchedules] = useState<Record<number, Schedule>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pairCode, setPairCode] = useState<{ screenId: string; code: string; expiresAt: string } | null>(null);
  const [creatingRound, setCreatingRound] = useState(false);
  const [creatingScreen, setCreatingScreen] = useState(false);
  const [roundName, setRoundName] = useState('');
  const [screenName, setScreenName] = useState('');
  const [screenRoundId, setScreenRoundId] = useState(1);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [editingMember, setEditingMember] = useState<(Omit<Member, 'id' | 'status'> & { id?: string }) | null>(null);
  const [renewMember, setRenewMember] = useState<Member | null>(null);
  const [renewDate, setRenewDate] = useState('');
  const [search, setSearch] = useState('');

  const refresh = useCallback(async (selectedRoundId = roundId) => {
    try {
      setError('');
      const [d, r, s, m] = await Promise.all([api.dashboard(), api.rounds(), api.screens(), api.members()]);
      setDashboard(d); setRounds(r); setScreens(s); setMembers(m);
      const [e, ...allSchedules] = await Promise.all([api.exercises(selectedRoundId), ...r.map(round => api.schedule(round.id))]);
      setExercises(e);
      setScreenSchedules(Object.fromEntries(r.map((round, index) => [round.id, allSchedules[index]])));
      setSchedule(allSchedules[r.findIndex(round => round.id === selectedRoundId)] || null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load data'); }
    finally { setLoading(false); }
  }, [roundId]);

  useEffect(() => { if (authenticated) void refresh(); }, [refresh, authenticated]);
  useEffect(() => { if (!authenticated) return; const timer = window.setInterval(() => void refresh(), 60_000); return () => window.clearInterval(timer); }, [refresh, authenticated]);
  useEffect(() => { const expired = () => { setAuthenticated(false); setLoginError('Session expired. Sign in again.'); }; window.addEventListener('evofit-auth-expired', expired); return () => window.removeEventListener('evofit-auth-expired', expired); }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setLoginBusy(true); setLoginError('');
    try { await api.login(password); setPassword(''); setAuthenticated(true); setLoading(true); }
    catch (e) { setLoginError(e instanceof Error ? e.message : 'Sign in failed'); }
    finally { setLoginBusy(false); }
  }

  async function act(work: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try { await work(); setNotice(success); await refresh(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); return false; }
    finally { setBusy(false); }
  }

  async function addRound(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const created = await api.createRound(roundName);
      setCreatingRound(false); setRoundName(''); setRoundId(created.roundId);
      setNotice(`Round ${created.roundId} and its display are ready to configure.`);
      await refresh(created.roundId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add round'); }
    finally { setBusy(false); }
  }

  async function addScreen(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      await api.createScreen(screenName, screenRoundId);
      setCreatingScreen(false); setScreenName('');
      setNotice('Display added. Generate its pairing code below.');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add display'); }
    finally { setBusy(false); }
  }

  const selectedRound = rounds.find(r => r.id === roundId);
  const currentDayFor = (id: number) => screenSchedules[id]?.days.find(day => day.date === dashboard?.today);
  const activeCycle = schedule?.cycles.find(cycle => dashboard && cycle.startDate <= dashboard.today && cycle.endDate >= dashboard.today) || schedule?.cycles[0];
  const memberResults = members.filter(m => `${m.fullName} ${m.phone} ${m.email}`.toLowerCase().includes(search.toLowerCase()));
  const roundNumber = (id: number) => String(id).padStart(2, '0');

  if (!authenticated) return <div className="admin-login"><form className="admin-login-card" onSubmit={e => void signIn(e)}>
    <div className="brand"><div className="brand-mark">E</div><div><strong>EVOFIT</strong><span>SCREENS</span></div></div>
    <h1>Admin sign in</h1><p>Enter the gym admin password to manage screens, videos, and memberships.</p>
    <label>Password<input type="password" autoComplete="current-password" autoFocus required value={password} onChange={e => setPassword(e.target.value)}/></label>
    {loginError && <div className="alert error"><CircleAlert size={18}/>{loginError}</div>}
    <button className="button primary" disabled={loginBusy || !password}>Sign in</button>
  </form></div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">E</div><div><strong>EVOFIT</strong><span>SCREENS</span></div></div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav>{sections.map(item => <button key={item.id} className={`nav-item ${section === item.id ? 'active' : ''}`} title={item.label} aria-label={item.label} onClick={() => setSection(item.id)}><item.icon size={19}/><span>{item.label}</span>{item.id === 'members' && (dashboard?.renewalsDue || 0) > 0 && <i>{dashboard?.renewalsDue}</i>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><ShieldCheck size={20}/><div><b>Operations hub</b><span>Content, screens & members</span></div></div><div className="sidebar-foot">EvoFit MVP <span>•</span> Casablanca time</div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>EvoFit</span><span className="slash">/</span><b>{sections.find(s => s.id === section)?.label}</b></div><div className="topbar-actions"><div className="timezone"><Clock3 size={15}/> Africa/Casablanca</div><button className="icon-button" title="Refresh data" onClick={() => void refresh()}><RefreshCw size={17}/></button><button className="button ghost" onClick={() => { void api.logout().finally(() => setAuthenticated(false)); }}>Sign out</button></div></header>
      <div className="page-content">
        {error && <div className="alert error"><CircleAlert size={18}/><span>{error}</span><button onClick={() => setError('')}><X size={16}/></button></div>}
        {notice && <div className="alert success"><Check size={18}/><span>{notice}</span><button onClick={() => setNotice('')}><X size={16}/></button></div>}
        {loading ? <div className="loading">Loading your workspace…</div> : <>
          {section === 'overview' && <>
            <div className="page-heading"><div><div className="eyebrow">{dashboard ? new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${dashboard.today}T12:00:00Z`)).toUpperCase() : ''}</div><h1>Good to see you.</h1><p>Everything you need to run your screens and keep content ready.</p></div><button className="button primary" onClick={() => setSection('screens')}><MonitorPlay size={17}/> Manage screens</button></div>
            <div className="hero-card"><div className="hero-copy"><span className="hero-kicker"><span className="pulse"/> {dashboard?.operatingNow ? 'GYM IS OPEN' : 'OUTSIDE OPERATING HOURS'}</span><h2>{dashboard?.readyExercises === dashboard?.totalExercises ? <>Today’s circuit is ready<br/>to take the floor.</> : <>Build your circuit,<br/>one video at a time.</>}</h2><p>{dashboard?.readyExercises === dashboard?.totalExercises ? `${rounds.length} rounds. Two exercises per screen. One clear schedule for every operating day.` : `${dashboard?.readyExercises || 0} of ${dashboard?.totalExercises ?? 0} exercise videos ready. Upload all 16 in a round to start its rotation.`}</p><button onClick={() => setSection('rotation')}>View today’s rotation <ArrowRight size={17}/></button></div><div className="hero-art"><span className="hero-ring one"/><span className="hero-ring two"/><div className="hero-big-number">{roundNumber(rounds.length)}</div><span className="hero-art-caption">ROUNDS AVAILABLE</span></div></div>
            <div className="stat-grid"><div className="stat-card"><div className="stat-icon red"><MonitorPlay size={21}/></div><div><span>Paired screens</span><strong>{dashboard?.pairedScreens}<small> / {dashboard?.totalScreens}</small></strong><p>Displays paired</p></div></div><div className="stat-card"><div className="stat-icon purple"><Video size={21}/></div><div><span>Content ready</span><strong>{dashboard?.readyExercises}<small> / {dashboard?.totalExercises}</small></strong><p>Exercise videos uploaded</p></div></div><div className="stat-card"><div className="stat-icon green"><Users size={21}/></div><div><span>Active members</span><strong>{dashboard?.activeMembers}</strong><p>Based on subscription dates</p></div></div><div className="stat-card"><div className="stat-icon amber"><CalendarDays size={21}/></div><div><span>Renewals this week</span><strong>{dashboard?.renewalsDue}</strong><p>Due within seven days</p></div></div></div>
            <div className="overview-grid"><div className="panel"><div className="panel-head"><div><div className="eyebrow">LIVE SCHEDULE</div><h2>Today’s rounds</h2></div><button className="text-button" onClick={() => setSection('rotation')}>Full schedule <ArrowRight size={16}/></button></div><div className="round-list">{rounds.map(round => <div className="round-row" key={round.id}><div className="round-number">{roundNumber(round.id)}</div><div className="round-info"><b>{round.name}</b><span>{round.readyCount === 16 ? 'Cycle ready' : `${round.readyCount} of 16 videos ready`}</span></div><Badge tone={round.readyCount === 16 ? 'green' : 'amber'}>{round.readyCount === 16 ? 'Ready' : 'Needs content'}</Badge></div>)}</div></div><div className="panel attention-panel"><div className="panel-head"><div><div className="eyebrow">KEEP THINGS MOVING</div><h2>Quick actions</h2></div></div><button className="quick-action" onClick={() => setSection('content')}><div className="quick-icon"><Upload size={19}/></div><div><b>Upload exercise videos</b><span>Fill the remaining slots in each round</span></div><ArrowRight size={17}/></button><button className="quick-action" onClick={() => setSection('screens')}><div className="quick-icon"><MonitorPlay size={19}/></div><div><b>Pair a display</b><span>Connect a portrait screen to a round</span></div><ArrowRight size={17}/></button><button className="quick-action" onClick={() => { setSection('members'); setEditingMember(emptyMember(dashboard?.today || '')); }}><div className="quick-icon"><Plus size={19}/></div><div><b>Add a member</b><span>Keep subscriptions up to date</span></div><ArrowRight size={17}/></button></div></div>
          </>}

          {section === 'screens' && <>
            <div className="page-heading">
              <div><div className="eyebrow">DISPLAY CONTROL</div><h1>Screen management</h1><p>Add rounds and screens, then pair each TV to its assigned display.</p></div>
              <a className="button secondary" href="/display?preview=1" target="_blank" rel="noreferrer" title="Preview screen player" aria-label="Preview screen player"><MonitorPlay size={17}/> Preview player</a>
            </div>
            <div className="screen-management-actions">
              <button className="button primary" onClick={() => { setRoundName(''); setCreatingRound(true); }}><Plus size={17}/> Add round + display</button>
              <button className="button secondary" onClick={() => { setScreenName(''); setScreenRoundId(roundId); setCreatingScreen(true); }}><MonitorPlay size={17}/> Add screen</button>
            </div>
            <div className="section-note"><Settings2 size={19}/><span>Each screen plays two videos in a portrait 9:16 layout. Open /display on a TV and enter its six-digit pairing code. Codes expire after 10 minutes.</span></div>
            <div className="screen-grid">{screens.map(screen => {
              const round = rounds.find(r => r.id === screen.roundId);
              const day = currentDayFor(screen.roundId);
              return <div className="screen-card" key={screen.id}>
                <div className="screen-top"><div><span className="eyebrow">ROUND {roundNumber(screen.roundId)}</span><h2>{screen.name}</h2></div><Badge tone={screen.paired ? 'green' : 'amber'}>{screen.paired ? 'Paired' : 'Not paired'}</Badge></div>
                <div className="portrait-preview">
                  <div className="preview-head"><b>EVOFIT</b><span>ROUND {roundNumber(screen.roundId)}</span></div>
                  <div className="preview-half"><video src={day?.upperVideoUrl || '/placeholders/upper.mp4'} autoPlay muted loop playsInline/><strong>{day?.upperTitle || 'SAMPLE VIDEO 01'}</strong><span>UPPER VIDEO</span></div>
                  <div className="preview-half"><video src={day?.lowerVideoUrl || '/placeholders/lower.mp4'} autoPlay muted loop playsInline/><strong>{day?.lowerTitle || 'SAMPLE VIDEO 02'}</strong><span>LOWER VIDEO</span></div>
                  <div className="preview-foot">{round?.name.toUpperCase()} <span>•</span> PORTRAIT 9:16</div>
                </div>
                <div className="screen-meta"><div><span>Assigned round</span><b>{roundNumber(screen.roundId)} · {screen.roundName}</b></div><div><span>Last seen</span><b>{screen.lastSeenAt ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Casablanca' }).format(new Date(screen.lastSeenAt)) : 'Never'}</b></div></div>
                <div className="screen-actions"><button className="button primary" disabled={busy} onClick={() => void act(async () => { const result = await api.pairingCode(screen.id); setPairCode({ screenId: screen.id, ...result }); }, 'Pairing code generated')}>Generate code</button>{screen.paired && <button className="button ghost" disabled={busy} onClick={() => void act(() => api.unpair(screen.id), 'Display unpaired')}>Unpair</button>}</div>
                {pairCode?.screenId === screen.id && <div className="pair-code"><span>ENTER THIS ON THE DISPLAY</span><strong>{pairCode.code}</strong><small>Expires in 10 minutes · Open /display on the device</small></div>}
              </div>;
            })}</div>
          </>}

          {section === 'content' && <><div className="page-heading"><div><div className="eyebrow">CONTENT LIBRARY</div><h1>Exercise content</h1><p>Maintain 16 exercises and one demonstration video for every round.</p></div><Badge tone={selectedRound?.readyCount === 16 ? 'green' : 'amber'}>{selectedRound?.readyCount || 0} / 16 ready</Badge></div><div className="round-tabs">{rounds.map(r => <button key={r.id} className={roundId === r.id ? 'selected' : ''} onClick={() => setRoundId(r.id)}><span>{roundNumber(r.id)}</span>{r.name}<small>{r.readyCount}/16</small></button>)}</div><div className="panel table-panel"><div className="panel-head"><div><div className="eyebrow">ROUND {roundNumber(roundId)}</div><h2>{selectedRound?.name || 'Exercise library'}</h2></div><p>Videos must be MP4 or WebM, up to 250 MB.</p></div><div className="table-wrap"><table><thead><tr><th>Slot</th><th>Exercise</th><th>Video</th><th>Status</th><th></th></tr></thead><tbody>{exercises.map(ex => <tr key={ex.id}><td><span className="slot">{String(ex.position).padStart(2, '0')}</span></td><td><div className="exercise-cell"><b>{ex.title}</b><span>{ex.instructions || 'No instructions added'}</span></div></td><td>{ex.videoUrl ? <a href={ex.videoUrl} target="_blank" rel="noreferrer" className="video-link"><Video size={16}/> View video</a> : <span className="muted">No video</span>}</td><td><Badge tone={ex.enabled && ex.videoUrl ? 'green' : 'amber'}>{ex.enabled && ex.videoUrl ? 'Ready' : ex.enabled ? 'Needs video' : 'Disabled'}</Badge></td><td><div className="row-actions"><label className="small-action upload-action" title="Upload video"><Upload size={16}/><input type="file" accept="video/mp4,video/webm" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void act(() => api.uploadVideo(ex.id, file), 'Video uploaded'); event.target.value = ''; }}/></label><button className="small-action" title="Edit exercise" onClick={() => setEditingExercise(ex)}><Pencil size={16}/></button></div></td></tr>)}</tbody></table></div></div></>}

          {section === 'rotation' && <><div className="page-heading"><div><div className="eyebrow">AUTOMATIC SCHEDULE</div><h1>Eight-day rotation</h1><p>Two exercises per operating day. All 16 appear once before a cycle repeats.</p></div><button className="button secondary" disabled={busy} onClick={() => void act(() => api.prepareSchedule(roundId), 'Schedule checked and prepared')}><RefreshCw size={16}/> Prepare schedule</button></div><div className="round-tabs">{rounds.map(r => <button key={r.id} className={roundId === r.id ? 'selected' : ''} onClick={() => setRoundId(r.id)}><span>{roundNumber(r.id)}</span>{r.name}<small>{r.readyCount}/16</small></button>)}</div><div className="rotation-summary"><div><div className="eyebrow">SELECTED ROUND</div><h2>Round {roundNumber(roundId)} <span>·</span> {selectedRound?.name}</h2><p>{activeCycle ? `Cycle ${activeCycle.number} · ${dateLabel(activeCycle.startDate)} – ${dateLabel(activeCycle.endDate)}` : 'Upload all 16 videos to generate the first cycle.'}</p></div><div className="rotation-indicator"><CalendarDays size={23}/><span>Morocco operating days</span></div></div>{schedule?.days.length ? <div className="rotation-grid">{[...schedule.days].sort((a, b) => a.date.localeCompare(b.date)).map(day => <div className={`day-card ${day.date === dashboard?.today ? 'today' : ''}`} key={`${day.cycleNumber}-${day.dayNumber}`}><div className="day-card-top"><span>DAY {String(day.dayNumber).padStart(2, '0')}</span>{day.date === dashboard?.today && <Badge tone="red">Today</Badge>}</div><h3>{shortDate(day.date)}</h3><div className="day-exercise"><span>01</span><b>{day.upperTitle}</b></div><div className="day-exercise"><span>02</span><b>{day.lowerTitle}</b></div><small>Cycle {day.cycleNumber}</small></div>)}</div> : <Empty icon={CalendarDays} title="No rotation yet" text="Complete all 16 video slots in this round. The first eight-day cycle will be generated automatically."/>}</>}

          {section === 'members' && <><div className="page-heading"><div><div className="eyebrow">MEMBERSHIP TRACKING</div><h1>Members</h1><p>Keep registration and renewal dates in one simple place.</p></div><button className="button primary" onClick={() => setEditingMember(emptyMember(dashboard?.today || ''))}><Plus size={17}/> Add member</button></div><div className="member-stats"><div><b>{members.length}</b><span>Total members</span></div><div><b>{dashboard?.activeMembers || 0}</b><span>Active subscriptions</span></div><div><b>{dashboard?.renewalsDue || 0}</b><span>Renewing this week</span></div><div><b>{members.filter(m => m.status === 'Expired').length}</b><span>Expired</span></div></div><div className="panel table-panel"><div className="panel-head"><div><div className="eyebrow">DIRECTORY</div><h2>Membership list</h2></div><div className="search-box"><Search size={16}/><input placeholder="Search members…" value={search} onChange={e => setSearch(e.target.value)}/></div></div>{memberResults.length ? <div className="table-wrap"><table><thead><tr><th>Member</th><th>Contact</th><th>Started</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody>{memberResults.map(m => <tr key={m.id}><td><div className="member-name"><span>{m.fullName.slice(0, 2).toUpperCase()}</span><b>{m.fullName}</b></div></td><td>{m.phone || m.email || <span className="muted">—</span>}</td><td>{dateLabel(m.startsOn)}</td><td>{dateLabel(m.expiresOn)}</td><td><Badge tone={m.status === 'Active' ? 'green' : m.status === 'Renew soon' ? 'amber' : m.status === 'Expired' ? 'red' : 'neutral'}>{m.status}</Badge></td><td><div className="row-actions"><button className="small-action labelled" onClick={() => { setRenewMember(m); setRenewDate(addDays(m.expiresOn, 30)); }}>Renew</button><button className="small-action" title="Edit member" onClick={() => setEditingMember(m)}><Pencil size={16}/></button></div></td></tr>)}</tbody></table></div> : <Empty icon={Users} title={search ? 'No matching members' : 'No members yet'} text={search ? 'Try a different name, phone, or email.' : 'Add your first member to start tracking subscription dates.'}/>}</div></>}
        </>}
      </div>
    </main>

    {creatingRound && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setCreatingRound(false); }}><form className="modal compact" onSubmit={e => void addRound(e)}><div className="modal-head"><div><div className="eyebrow">NEW CIRCUIT</div><h2>Add round + display</h2></div><button type="button" className="small-action" aria-label="Close" onClick={() => setCreatingRound(false)}><X size={19}/></button></div><p className="modal-description">This creates 16 exercise slots and one display ready for pairing.</p><label>Round name<input autoFocus required maxLength={80} placeholder="e.g. Strength Circuit" value={roundName} onChange={e => setRoundName(e.target.value)}/></label>{error && <div className="alert error"><CircleAlert size={18}/><span>{error}</span></div>}<div className="modal-actions"><button type="button" className="button ghost" onClick={() => setCreatingRound(false)}>Cancel</button><button className="button primary" disabled={busy || !roundName.trim()}>Add round</button></div></form></div>}

    {creatingScreen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setCreatingScreen(false); }}><form className="modal compact" onSubmit={e => void addScreen(e)}><div className="modal-head"><div><div className="eyebrow">NEW DISPLAY</div><h2>Add screen</h2></div><button type="button" className="small-action" aria-label="Close" onClick={() => setCreatingScreen(false)}><X size={19}/></button></div><p className="modal-description">Assign this TV to a round. Multiple TVs can show the same round independently.</p><label>Screen name<input autoFocus required maxLength={80} placeholder="e.g. Front wall TV" value={screenName} onChange={e => setScreenName(e.target.value)}/></label><label>Assigned round<select value={screenRoundId} onChange={e => setScreenRoundId(Number(e.target.value))}>{rounds.map(round => <option key={round.id} value={round.id}>Round {roundNumber(round.id)} · {round.name}</option>)}</select></label>{error && <div className="alert error"><CircleAlert size={18}/><span>{error}</span></div>}<div className="modal-actions"><button type="button" className="button ghost" onClick={() => setCreatingScreen(false)}>Cancel</button><button className="button primary" disabled={busy || !screenName.trim()}>Add screen</button></div></form></div>}

    {editingExercise && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditingExercise(null); }}><form className="modal" onSubmit={e => { e.preventDefault(); const item = editingExercise; void act(() => api.saveExercise(item.id, { title: item.title, instructions: item.instructions, enabled: item.enabled }), 'Exercise saved').then(saved => { if (saved) setEditingExercise(null); }); }}><div className="modal-head"><div><div className="eyebrow">ROUND {roundNumber(roundId)} · SLOT {String(editingExercise.position).padStart(2, '0')}</div><h2>Edit exercise</h2></div><button type="button" className="small-action" onClick={() => setEditingExercise(null)}><X size={19}/></button></div><label>Exercise name<input required value={editingExercise.title} onChange={e => setEditingExercise({ ...editingExercise, title: e.target.value })}/></label><label>Instructions<textarea rows={4} value={editingExercise.instructions} onChange={e => setEditingExercise({ ...editingExercise, instructions: e.target.value })}/></label><label className="checkbox-label"><input type="checkbox" checked={editingExercise.enabled} onChange={e => setEditingExercise({ ...editingExercise, enabled: e.target.checked })}/> Enabled for future cycles</label>{error && <div className="alert error"><CircleAlert size={18}/><span>{error}</span></div>}<div className="modal-actions"><button type="button" className="button ghost" onClick={() => setEditingExercise(null)}>Cancel</button><button className="button primary" disabled={busy}>Save exercise</button></div></form></div>}

    {editingMember && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditingMember(null); }}><form className="modal" onSubmit={e => { e.preventDefault(); const { id, ...data } = editingMember; void act(() => api.saveMember(data, id), id ? 'Member updated' : 'Member added').then(saved => { if (saved) setEditingMember(null); }); }}><div className="modal-head"><div><div className="eyebrow">MEMBERSHIP</div><h2>{editingMember.id ? 'Edit member' : 'Add member'}</h2></div><button type="button" className="small-action" onClick={() => setEditingMember(null)}><X size={19}/></button></div><label>Full name<input required value={editingMember.fullName} onChange={e => setEditingMember({ ...editingMember, fullName: e.target.value })}/></label><div className="form-grid"><label>Phone<input value={editingMember.phone} onChange={e => setEditingMember({ ...editingMember, phone: e.target.value })}/></label><label>Email<input type="email" value={editingMember.email} onChange={e => setEditingMember({ ...editingMember, email: e.target.value })}/></label></div><div className="form-grid"><label>Start date<input type="date" required value={editingMember.startsOn} onChange={e => setEditingMember({ ...editingMember, startsOn: e.target.value })}/></label><label>Expiry date<input type="date" min={editingMember.startsOn} required value={editingMember.expiresOn} onChange={e => setEditingMember({ ...editingMember, expiresOn: e.target.value })}/></label></div><label>Notes<textarea rows={3} value={editingMember.notes} onChange={e => setEditingMember({ ...editingMember, notes: e.target.value })}/></label>{error && <div className="alert error"><CircleAlert size={18}/><span>{error}</span></div>}<div className="modal-actions"><button type="button" className="button ghost" onClick={() => setEditingMember(null)}>Cancel</button><button className="button primary" disabled={busy}>Save member</button></div></form></div>}

    {renewMember && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setRenewMember(null); }}><form className="modal compact" onSubmit={e => { e.preventDefault(); void act(() => api.renew(renewMember.id, renewDate), 'Membership renewed').then(saved => { if (saved) setRenewMember(null); }); }}><div className="modal-head"><div><div className="eyebrow">RENEW SUBSCRIPTION</div><h2>{renewMember.fullName}</h2></div><button type="button" className="small-action" onClick={() => setRenewMember(null)}><X size={19}/></button></div><p className="modal-description">Current expiry: {dateLabel(renewMember.expiresOn)}</p><label>New expiry date<input type="date" min={addDays(renewMember.expiresOn, 1)} required value={renewDate} onChange={e => setRenewDate(e.target.value)}/></label>{error && <div className="alert error"><CircleAlert size={18}/><span>{error}</span></div>}<div className="modal-actions"><button type="button" className="button ghost" onClick={() => setRenewMember(null)}>Cancel</button><button className="button primary" disabled={busy}>Save renewal</button></div></form></div>}
  </div>;
}
