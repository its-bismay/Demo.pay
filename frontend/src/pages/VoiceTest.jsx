import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  Radio,
  Activity,
  Play,
  Square,
  RefreshCw,
  Server,
  CheckCircle2,
  AlertTriangle,
  Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function VoiceTest() {
  const [backendUrl, setBackendUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3001';
      }
    }
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
  });

  const [isRecording, setIsRecording] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [hasVoice, setHasVoice] = useState(false);
  const [statusText, setStatusText] = useState('Idle - Click Start Speaking to begin');
  const [sttResult, setSttResult] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);
  const [logs, setLogs] = useState([]);
  const [pingStatus, setPingStatus] = useState(null);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const freqDataRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const vadIntervalRef = useRef(null);
  const hasSpokenRef = useRef(false);
  const silenceCountRef = useRef(0);
  const logBoxRef = useRef(null);

  const addLog = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { time, msg, type }]);
  };

  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [logs]);

  const getCleanBase = (url) => {
    let u = (url || '').trim().replace(/\/+$/, '');
    if (u.endsWith('/api')) u = u.slice(0, -4);
    return u || 'http://localhost:3001';
  };

  const testPing = async () => {
    const clean = getCleanBase(backendUrl);
    addLog(`Pinging backend: ${clean}/health...`, 'info');
    setPingStatus('checking');
    try {
      let res = await fetch(`${clean}/health`).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`${clean}/api/health`).catch(() => null);
      }
      if (res && res.ok) {
        const json = await res.json().catch(() => ({}));
        addLog(`Backend responded: HTTP ${res.status} OK (${JSON.stringify(json)})`, 'success');
        setPingStatus('ok');
      } else {
        addLog(`Backend error status: HTTP ${res ? res.status : 'offline'}`, 'warn');
        setPingStatus('error');
      }
    } catch (e) {
      addLog(`Failed to reach backend: ${e.message}`, 'error');
      setPingStatus('error');
    }
  };

  const drawWave = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const canvas = canvasRef.current;
      const analyser = analyserRef.current;
      const data = freqDataRef.current;
      if (!canvas || !analyser || !data) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const W = canvas.width;
      const H = canvas.height;
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, W, H);

      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / (data.length || 1);
      const pct = Math.min(100, Math.round((avg / 128) * 100));
      setVolumeLevel(pct);

      const n = 36;
      const bw = 5;
      const gap = Math.max(3, (W - n * bw) / (n + 1));

      for (let i = 0; i < n; i++) {
        const di = Math.floor((i / n) * (data.length / 2));
        const val = data[di] || 0;
        let bh = 4;

        if (pct > 7 || hasSpokenRef.current) {
          bh = Math.max(6, Math.min(H - 4, (val / 255) * (H - 4)));
          ctx.fillStyle = '#10b981';
        } else {
          bh = Math.max(3, (val / 255) * (H - 8));
          ctx.fillStyle = 'rgba(100, 116, 139, 0.4)';
        }

        const x = gap + i * (bw + gap);
        const y = (H - bh) / 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, 2);
        else ctx.rect(x, y, bw, bh);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const startTest = async () => {
    try {
      addLog('Requesting microphone access...', 'info');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      addLog(`Mic active: ${stream.getAudioTracks()[0]?.label || 'Default'}`, 'success');

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const actx = new AudioCtx();
      if (actx.state === 'suspended') await actx.resume();
      audioCtxRef.current = actx;
      const source = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      drawWave();

      chunksRef.current = [];
      let mimeType = '';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
      else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
      else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';

      addLog(`Creating MediaRecorder (${mimeType || 'default'})...`, 'info');
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          addLog(`Audio chunk received: ${e.data.size} bytes`, 'info');
        }
      };

      recorder.onstop = async () => {
        addLog('MediaRecorder stopped. Creating audio blob...', 'info');
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        chunksRef.current = [];
        addLog(`Blob created: ${blob.size} bytes, type: ${blob.type}`, 'success');

        const url = URL.createObjectURL(blob);
        setRecordedAudioUrl(url);

        await sendAudio(blob);
      };

      recorder.start(200);
      setIsRecording(true);
      hasSpokenRef.current = false;
      silenceCountRef.current = 0;
      setHasVoice(false);
      setStatusText('Recording active - Speak into your microphone now!');
      addLog('Recording started. Speak now!', 'success');

      vadIntervalRef.current = setInterval(() => {
        if (!analyserRef.current || !freqDataRef.current) return;
        analyserRef.current.getByteFrequencyData(freqDataRef.current);
        let s = 0;
        for (let i = 0; i < freqDataRef.current.length; i++) s += freqDataRef.current[i];
        const avg = s / (freqDataRef.current.length || 1);
        const curPct = Math.min(100, Math.round((avg / 128) * 100));

        if (curPct > 7) {
          hasSpokenRef.current = true;
          setHasVoice(true);
          silenceCountRef.current = 0;
          setStatusText(`Voice detected (${curPct}%) - Listening...`);
        } else {
          if (hasSpokenRef.current) {
            silenceCountRef.current += 1;
            if (silenceCountRef.current >= 10) {
              addLog('Silence detected after speech (1.4s). Auto-stopping...', 'info');
              stopTest();
            }
          } else {
            setHasVoice(false);
            setStatusText('No voice detected - speak into your mic');
          }
        }
      }, 140);

    } catch (err) {
      addLog(`Microphone/Recorder error: ${err.name} - ${err.message}`, 'error');
      setStatusText(`Error: ${err.message}`);
    }
  };

  const stopTest = () => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    setIsRecording(false);
    setHasVoice(false);
    hasSpokenRef.current = false;
    setStatusText('Processing audio and sending to backend...');

    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const sendAudio = async (blob) => {
    if (blob.size < 600) {
      addLog(`Audio blob is too small (${blob.size} bytes), skipped.`, 'warn');
      setStatusText('Audio was too short or empty');
      return;
    }

    const clean = getCleanBase(backendUrl);
    addLog(`Uploading audio to ${clean}/api/voice/stt...`, 'info');
    setStatusText('Uploading audio to Sarvam STT via backend...');

    try {
      const form = new FormData();
      form.append('audio', blob, 'test.webm');

      const startMs = Date.now();
      const res = await fetch(`${clean}/api/voice/stt`, {
        method: 'POST',
        body: form,
      });
      const elapsed = Date.now() - startMs;

      const data = await res.json();
      addLog(`Backend STT responded in ${elapsed}ms: HTTP ${res.status}`, res.ok ? 'success' : 'error');
      addLog(`Response payload: ${JSON.stringify(data)}`, res.ok ? 'success' : 'error');

      if (res.ok && data.success && data.transcript) {
        setSttResult(data.transcript);
        setStatusText(`Transcribed: "${data.transcript}"`);
        addLog(`TRANSCRIPT SUCCESS: "${data.transcript}"`, 'success');

        await testInteract(data.transcript);
      } else {
        setStatusText(`STT returned error: ${data.error || 'Empty transcript'}`);
        addLog(`STT Error detail: ${data.detail || data.error}`, 'error');
      }
    } catch (e) {
      addLog(`Upload network error: ${e.message}`, 'error');
      setStatusText(`Network Error: ${e.message}`);
    }
  };

  const testInteract = async (text) => {
    const clean = getCleanBase(backendUrl);
    addLog(`Sending transcript to ${clean}/api/voice/interact...`, 'info');
    try {
      const res = await fetch(`${clean}/api/voice/interact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userSpeech: text,
          conversationHistory: [],
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.aiReply) {
        setAiReply(data.aiReply);
        addLog(`AI REPLY: "${data.aiReply}"`, 'success');

        await testTts(data.aiReply);
      }
    } catch (e) {
      addLog(`Interact error: ${e.message}`, 'error');
    }
  };

  const testTts = async (text) => {
    const clean = getCleanBase(backendUrl);
    addLog(`Synthesizing speech via ${clean}/api/voice/tts...`, 'info');
    try {
      const res = await fetch(`${clean}/api/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceType: 'ritu',
          languageMode: 'Hinglish',
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = new Audio(url);
        addLog('TTS audio received, playing...', 'success');
        a.play().catch(e => addLog(`Audio play error: ${e.message}`, 'warn'));
      }
    } catch (e) {
      addLog(`TTS error: ${e.message}`, 'error');
    }
  };

  const clearLogs = () => {
    setLogs([]);
    setSttResult('');
    setAiReply('');
    setRecordedAudioUrl(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Mic className="h-6 w-6 text-primary" />
          Voice & STT Test Console
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Direct testing playground for Microphone capture, Sarvam Speech-to-Text, and AI responses without checkout or cart.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Backend Connection</span>
            {pingStatus === 'ok' && <Badge className="bg-emerald-600">Connected</Badge>}
            {pingStatus === 'error' && <Badge variant="destructive">Unreachable</Badge>}
          </CardTitle>
          <CardDescription>
            Specify the backend URL that provides the /api/voice/stt and /api/voice/interact routes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={backendUrl}
              onChange={e => setBackendUrl(e.target.value)}
              placeholder="http://localhost:3001 or https://your-backend.onrender.com"
              className="font-mono text-xs"
            />
            <Button variant="outline" onClick={testPing} className="shrink-0 gap-1.5 text-xs">
              <Server className="h-3.5 w-3.5" />
              Ping
            </Button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBackendUrl('http://localhost:3001')}
              className="text-[11px] px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
            >
              Use Local (http://localhost:3001)
            </button>
            <button
              type="button"
              onClick={() => setBackendUrl(import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001')}
              className="text-[11px] px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
            >
              Use Env URL ({import.meta.env.VITE_API_BASE_URL || 'default'})
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Radio className={`h-5 w-5 ${isRecording ? 'text-red-500 animate-pulse' : 'text-muted-foreground'}`} />
              Live Microphone Test
            </CardTitle>
            <Badge variant={isRecording ? (hasVoice ? 'default' : 'secondary') : 'outline'} className={hasVoice ? 'bg-emerald-600 text-white animate-pulse' : ''}>
              {isRecording ? (hasVoice ? `Voice Detected (${volumeLevel}%)` : `Recording (Silent ${volumeLevel}%)`) : 'Ready'}
            </Badge>
          </div>
          <CardDescription>{statusText}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-16 w-full bg-muted/40 rounded-xl border flex items-center justify-center px-2 overflow-hidden">
            <canvas ref={canvasRef} width={600} height={60} className="w-full h-14 block" />
          </div>

          <div className="flex items-center gap-3">
            {!isRecording ? (
              <Button onClick={startTest} className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white">
                <Mic className="h-4 w-4" />
                Start Speaking & Record
              </Button>
            ) : (
              <Button onClick={stopTest} variant="destructive" className="gap-2">
                <Square className="h-4 w-4 fill-current" />
                Stop & Send to Backend
              </Button>
            )}

            <Button variant="outline" onClick={clearLogs} className="text-xs">
              Clear All
            </Button>
          </div>

          {recordedAudioUrl && (
            <div className="p-3 bg-muted/30 rounded-lg border space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Playback Recorded Voice:</span>
              <audio src={recordedAudioUrl} controls className="w-full h-8" />
            </div>
          )}

          {sttResult && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Transcribed User Speech (Sarvam STT):
              </span>
              <p className="text-lg font-semibold text-foreground">"{sttResult}"</p>
            </div>
          )}

          {aiReply && (
            <div className="p-4 bg-primary/10 border border-primary/30 rounded-xl space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                AI Agent Reply:
              </span>
              <p className="text-base font-medium text-foreground">"{aiReply}"</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Execution Logs</span>
            <span className="text-xs text-muted-foreground font-mono font-normal">Real-time trace</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            ref={logBoxRef}
            className="h-64 overflow-y-auto bg-slate-950 text-slate-200 rounded-lg p-3 font-mono text-xs space-y-1.5 border"
          >
            {logs.length === 0 && (
              <span className="text-slate-500 italic">No logs yet. Click "Start Speaking & Record" above.</span>
            )}
            {logs.map((l, idx) => (
              <div
                key={idx}
                className={
                  l.type === 'error'
                    ? 'text-red-400 font-semibold'
                    : l.type === 'success'
                    ? 'text-emerald-400 font-semibold'
                    : l.type === 'warn'
                    ? 'text-amber-400'
                    : 'text-slate-300'
                }
              >
                <span className="text-slate-500 select-none mr-2">[{l.time}]</span>
                {l.msg}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
