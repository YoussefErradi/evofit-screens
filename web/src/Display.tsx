import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CircleAlert, Maximize2, Minimize2, MonitorPlay, RefreshCw, RotateCcw } from 'lucide-react';
import { api, type PlayerContent } from './api';

const tokenKey = 'evofit-display-token';
const rotationKey = 'evofit-display-rotation';
const cachedContentKey = 'evofit-display-content';

function localOperatingNow(content: PlayerContent | null, now: Date): boolean {
  if (!content) return false;
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Casablanca', weekday: 'long' }).format(now).toUpperCase();
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return date === content.today && content.openDays.includes(weekday) && time >= content.opensAt && time < content.closesAt;
}

type VideoTileProps = { src: string; label: string; title: string; instructions: string };

function VideoTile({ src, label, title, instructions }: VideoTileProps) {
  const [videoError, setVideoError] = useState(false);
  return <section className="display-video">
    <div className="display-video-media">
      <video src={src} autoPlay muted loop playsInline preload="auto" onError={() => setVideoError(true)} />
    </div>
    <div className="display-video-info">
      <span>{label}</span>
      <h2>{title}</h2>
      <p>{videoError ? 'Video could not play on this device.' : instructions}</p>
    </div>
  </section>;
}

export default function Display() {
  const demoPreview = new URLSearchParams(window.location.search).has('preview');
  const [token, setToken] = useState(() => localStorage.getItem(tokenKey) || '');
  const [code, setCode] = useState('');
  const [content, setContent] = useState<PlayerContent | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [landscape, setLandscape] = useState(() => window.innerWidth > window.innerHeight);
  const [rotateOnLandscape, setRotateOnLandscape] = useState(() => localStorage.getItem(rotationKey) !== 'off');
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const rotated = landscape && rotateOnLandscape;

  useEffect(() => {
    const syncOrientation = () => setLandscape(window.innerWidth > window.innerHeight);
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener('resize', syncOrientation);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => {
      window.removeEventListener('resize', syncOrientation);
      document.removeEventListener('fullscreenchange', syncFullscreen);
    };
  }, []);

  useEffect(() => { const timer = window.setInterval(() => setClock(new Date()), 15_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {}); }, []);

  function toggleRotation() {
    const next = !rotateOnLandscape;
    localStorage.setItem(rotationKey, next ? 'on' : 'off');
    setRotateOnLandscape(next);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setError('Use the TV browser menu to enter fullscreen.');
    } catch {
      setError('Use the TV browser menu to enter fullscreen.');
    }
  }

  const load = useCallback(async () => {
    if (!token || demoPreview) return;
    try {
      const next = await api.playerContent(token);
      setContent(next);
      localStorage.setItem(cachedContentKey, JSON.stringify(next));
      const urls = [next.content?.upper.videoUrl, next.content?.lower.videoUrl].filter((url): url is string => Boolean(url));
      if (urls.length && 'serviceWorker' in navigator) {
        void navigator.serviceWorker.ready.then(registration => registration.active?.postMessage({ type: 'CACHE_MEDIA', urls }));
      }
      setError('');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not load display';
      if (message.includes('401') || message.toLowerCase().includes('unauthorized')) {
        localStorage.removeItem(tokenKey);
        localStorage.removeItem(cachedContentKey);
        setToken('');
        setContent(null);
        setError('This screen needs to be paired again.');
      } else {
        try {
          const cached = JSON.parse(localStorage.getItem(cachedContentKey) || 'null') as PlayerContent | null;
          if (cached?.today === new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())) setContent(cached);
          else setContent(null);
        } catch { setContent(null); }
        setError('Cannot reach the EvoFit server. Today’s cached videos may continue until it reconnects.');
      }
    }
  }, [token, demoPreview]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function pair(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.pairPlayer(code);
      localStorage.setItem(tokenKey, result.token);
      setToken(result.token);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pairing failed');
    } finally { setBusy(false); }
  }

  if (!token && !demoPreview) return <div className={`display-stage${rotated ? ' is-rotated' : ''}`}><div className="display-pair"><div className="display-pair-card">
    <div className="brand pair-brand"><div className="brand-mark">E</div><div><strong>EVOFIT</strong><span>SCREENS</span></div></div>
    <div className="pair-illustration"><MonitorPlay size={52}/></div>
    <span className="eyebrow">CONNECT THIS DISPLAY</span><h1>Pair your screen.</h1>
    <p>Generate a code in the admin Screens page, then enter it here on the portrait display.</p>
    <form onSubmit={pair}><label>Six-digit pairing code
      <input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required />
    </label><button className="button primary" disabled={busy || code.length !== 6}>Pair display <ArrowRight size={18}/></button></form>
    {error && <div className="pair-error"><CircleAlert size={17}/>{error}</div>}
    <div className="pair-player-controls"><button className="button secondary" type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={18}/> : <Maximize2 size={18}/>} {fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}</button><button className="button ghost" type="button" onClick={toggleRotation}><RotateCcw size={18}/> {rotateOnLandscape ? 'Rotation −90°' : 'Rotation off'}</button></div>
    <small>On a sideways mounted TV, the player rotates automatically. Fullscreen hides the browser bar where supported.</small>
  </div></div></div>;

  const item = content?.content;
  const preview = demoPreview;
  const active = Boolean(item && localOperatingNow(content, clock));
  const pending = !demoPreview && !item && localOperatingNow(content, clock);

  return <div className={`display-stage${rotated ? ' is-rotated' : ''}`}><div className="display-screen">
    <div className="display-header"><div className="display-brand">EVO<span>FIT</span></div><div className="display-round"><small>ROUND</small><b>{String(content?.roundId || (demoPreview ? 1 : 0)).padStart(2, '0')}</b></div></div>
    <div className="display-title"><span>{content?.roundName || (demoPreview ? 'Power Start' : 'Loading round')}</span><strong>{preview ? 'VIDEO PREVIEW' : active ? 'TODAY’S CIRCUIT' : pending ? 'CONTENT PENDING' : 'GYM CLOSED'}</strong></div>
    {preview ? <div className="display-videos">
      <VideoTile src="/placeholders/upper.mp4" label="SAMPLE VIDEO 01" title="Punch combo" instructions="Preview clip · Upload this round’s exercises to replace it." />
      <VideoTile src="/placeholders/lower.mp4" label="SAMPLE VIDEO 02" title="Squat motion" instructions="Preview clip · Both videos play at the same time." />
    </div> : active && item ? <div className="display-videos">
      <VideoTile key={item.upper.videoUrl} src={item.upper.videoUrl} label="EXERCISE 01" title={item.upper.title} instructions={item.upper.instructions} />
      <VideoTile key={item.lower.videoUrl} src={item.lower.videoUrl} label="EXERCISE 02" title={item.lower.title} instructions={item.lower.instructions} />
    </div> : <div className="display-closed"><div className="display-closed-ring"><MonitorPlay size={56}/></div><h2>{pending ? 'Content is being prepared' : 'See you at the next session'}</h2><p>{pending ? 'Upload all 16 videos for this round to start its rotation.' : `Operating hours: ${content?.opensAt || '06:00'}–${content?.closesAt || '22:00'} · Africa/Casablanca`}</p></div>}
    <div className="display-footer"><span><i className={active ? 'live-dot' : ''}/>{demoPreview ? 'DEMO PREVIEW' : pending ? 'CONTENT PENDING' : active ? `DAY ${item?.dayNumber} · CYCLE ${item?.cycleNumber}` : 'DISPLAY STANDBY'}</span><span>{content?.today || ''} · {content?.screenName || ''}</span><button title="Refresh" aria-label="Refresh display" onClick={() => void load()}><RefreshCw size={18}/></button><button className="display-action" title="Rotate the player for a portrait-mounted TV" aria-label={rotateOnLandscape ? 'Turn rotation off' : 'Rotate player minus ninety degrees'} onClick={toggleRotation}><RotateCcw size={18}/><b className="display-control-label">{rotateOnLandscape ? '−90°' : 'Rotate'}</b></button><button className="display-action" title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen and hide the browser bar'} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}<b className="display-control-label">{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</b></button></div>
    {error && <div className="display-error">{error}</div>}
  </div></div>;
}
