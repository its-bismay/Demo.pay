import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone,
  PhoneOff,
  PhoneCall,
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  CheckCircle2,
  Clock,
  Send,
  Tag,
} from 'lucide-react';
import { useVoiceCallStore, useLiveFeedStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

class RingtonePlayer {
  constructor() {
    this.ctx = null;
    this.intervalId = null;
    this.activeNodes = [];
  }
  start() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      const playBurst = () => {
        if (!this.ctx || this.ctx.state === 'closed') return;
        const now = this.ctx.currentTime;
        const o1 = this.ctx.createOscillator();
        const o2 = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o1.type = 'sine'; o1.frequency.setValueAtTime(440, now);
        o2.type = 'sine'; o2.frequency.setValueAtTime(480, now);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.15, now + 0.05);
        g.gain.setValueAtTime(0.15, now + 1.8);
        g.gain.linearRampToValueAtTime(0, now + 2.0);
        o1.connect(g); o2.connect(g); g.connect(this.ctx.destination);
        o1.start(now); o2.start(now); o1.stop(now + 2.0); o2.stop(now + 2.0);
        this.activeNodes.push(o1, o2, g);
      };
      playBurst();
      this.intervalId = setInterval(playBurst, 4000);
    } catch (e) {}
  }
  stop() {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    this.activeNodes.forEach(n => { try { n.disconnect(); } catch (e) {} });
    this.activeNodes = [];
    if (this.ctx && this.ctx.state !== 'closed') {
      try { this.ctx.close(); } catch (e) {}
      this.ctx = null;
    }
  }
}

export function VoiceCallModal() {
  const {
    isOpen, callState, isMuted, isSpeaking, callData,
    transcript, promiseResult,
    acceptCall, declineCall, endCall, closeModal,
    addTranscript, updateTranscriptText,
    setMuted, setSpeaking, setListening, setPromiseResult,
  } = useVoiceCallStore();

  const addEvent = useLiveFeedStore(s => s.addEvent);
  const updateKpis = useLiveFeedStore(s => s.updateKpis);

  const [callDuration, setCallDuration] = useState(0);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentDiscount, setCurrentDiscount] = useState(0);
  const [micDenied, setMicDenied] = useState(false);
  const [recordingState, setRecordingState] = useState('idle');
  const [volumeLevel, setVolumeLevel] = useState(0);

  const ringtoneRef = useRef(null);
  const transcriptContainerRef = useRef(null);
  const audioRef = useRef(null);

  const micStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const freqDataRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const isRecordingRef = useRef(false);

  const callStateRef = useRef(callState);
  const isMutedRef = useRef(isMuted);
  const isSpeakingRef = useRef(isSpeaking);
  const isProcessingRef = useRef(isProcessing);

  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

  const voiceLower = (callData?.voiceType || '').toLowerCase();
  const isFemale = voiceLower.includes('female') || voiceLower.includes('ritu') || voiceLower.includes('priya') || voiceLower.includes('aditi');
  const isMale = !isFemale && (voiceLower.includes('male') || voiceLower.includes('shubh') || voiceLower.includes('arun') || voiceLower.includes('aarav'));
  const agentName = callData?.agentName || (isMale ? 'Aarav' : 'Aditi');
  const agentGender = callData?.agentGender || (isMale ? 'male' : 'female');

  useEffect(() => {
    if (callData?.discountPct !== undefined) setCurrentDiscount(callData.discountPct);
  }, [callData]);

  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcript, isProcessing]);

  useEffect(() => {
    if (isOpen && callState === 'ringing') {
      ringtoneRef.current = new RingtonePlayer();
      ringtoneRef.current.start();
    } else {
      ringtoneRef.current?.stop();
      ringtoneRef.current = null;
    }
    return () => { ringtoneRef.current?.stop(); ringtoneRef.current = null; };
  }, [isOpen, callState]);

  useEffect(() => {
    let t;
    if (callState === 'connected') t = setInterval(() => setCallDuration(d => d + 1), 1000);
    else setCallDuration(0);
    return () => clearInterval(t);
  }, [callState]);

  const drawWave = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const canvas = canvasRef.current;
      const analyser = analyserRef.current;
      const data = freqDataRef.current;
      if (!canvas || !analyser || !data) { rafRef.current = requestAnimationFrame(tick); return; }
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) { rafRef.current = requestAnimationFrame(tick); return; }
      const W = canvas.width; const H = canvas.height;
      analyser.getByteFrequencyData(data);
      ctx2d.clearRect(0, 0, W, H);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / (data.length || 1);
      setVolumeLevel(Math.round((avg / 255) * 100));
      const n = 26; const bw = 4;
      const gap = Math.max(3, (W - n * bw) / (n + 1));
      for (let i = 0; i < n; i++) {
        const di = Math.floor((i / n) * (data.length / 2));
        const val = data[di] || 0;
        let bh;
        if (isMutedRef.current) {
          bh = 3;
        } else if (isSpeakingRef.current) {
          bh = Math.max(4, Math.sin(Date.now() / 150 + i * 0.45) * 9 + 12);
        } else {
          bh = Math.max(4, Math.min(H - 4, (val / 255) * (H - 4)));
        }
        const x = gap + i * (bw + gap); const y = (H - bh) / 2;
        if (isMutedRef.current) {
          ctx2d.fillStyle = 'rgba(239,68,68,0.4)';
        } else if (isSpeakingRef.current) {
          ctx2d.fillStyle = 'rgba(161,161,170,0.55)';
        } else if (isRecordingRef.current && val > 18) {
          ctx2d.fillStyle = '#10b981';
        } else {
          ctx2d.fillStyle = 'rgba(16,185,129,0.35)';
        }
        ctx2d.beginPath();
        if (ctx2d.roundRect) ctx2d.roundRect(x, y, bw, bh, 2);
        else ctx2d.rect(x, y, bw, bh);
        ctx2d.fill();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const stopWave = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const c = canvasRef.current;
    if (c) { const ctx2d = c.getContext('2d'); if (ctx2d) ctx2d.clearRect(0, 0, c.width, c.height); }
  };

  const stopRecording = () => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    isRecordingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const sendAudioToSTT = async (blob) => {
    if (!blob || blob.size < 1000) {
      startRecording();
      return;
    }
    setRecordingState('processing');
    setListening(false);
    try {
      const form = new FormData();
      form.append('audio', blob, 'recording.webm');
      const res = await fetch(`${BASE_URL}/api/voice/stt`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      const transcript = (data.transcript || '').trim();
      if (transcript) {
        await handleUserReply(transcript);
      } else {
        startRecording();
      }
    } catch (err) {
      startRecording();
    }
  };

  const startRecording = () => {
    if (
      isMutedRef.current ||
      callStateRef.current !== 'connected' ||
      isSpeakingRef.current ||
      isProcessingRef.current ||
      !micStreamRef.current
    ) return;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') return;

    chunksRef.current = [];
    isRecordingRef.current = true;
    setRecordingState('recording');
    setListening(true);

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';

    try {
      const recorder = new MediaRecorder(micStreamRef.current, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        isRecordingRef.current = false;
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        chunksRef.current = [];
        await sendAudioToSTT(blob);
      };

      recorder.onerror = () => {
        isRecordingRef.current = false;
        setRecordingState('idle');
      };

      recorder.start(100);

      let silenceSamples = 0;
      const vadInterval = setInterval(() => {
        if (!isRecordingRef.current || !analyserRef.current || !freqDataRef.current) {
          clearInterval(vadInterval);
          return;
        }
        analyserRef.current.getByteFrequencyData(freqDataRef.current);
        let s = 0;
        for (let i = 0; i < freqDataRef.current.length; i++) s += freqDataRef.current[i];
        const avg = s / (freqDataRef.current.length || 1);
        if (avg < 12) {
          silenceSamples++;
          if (silenceSamples >= 12) {
            clearInterval(vadInterval);
            if (isRecordingRef.current && mediaRecorderRef.current?.state === 'recording') {
              stopRecording();
            }
          }
        } else {
          silenceSamples = 0;
        }
      }, 150);

      silenceTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current && mediaRecorderRef.current?.state === 'recording') {
          stopRecording();
        }
      }, 15000);

    } catch (err) {
      isRecordingRef.current = false;
      setRecordingState('idle');
    }
  };

  const handleAcceptCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') await ctx.resume();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        analyserRef.current = analyser;
        freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
        drawWave();
      }
    } catch (err) {
      setMicDenied(true);
    }
    acceptCall();
  };

  const streamWordsIntoTranscript = (text, durationSec = 3) => {
    const words = text.split(' ');
    if (!words.length) return;
    const msgId = Date.now().toString();
    addTranscript('agent', words[0], msgId);
    const safeDur = Math.max(1.5, Math.min(8, durationSec));
    const interval = Math.max(70, Math.min(220, (safeDur * 1000) / words.length));
    let idx = 1;
    const t = setInterval(() => {
      if (idx < words.length) {
        idx++;
        updateTranscriptText(msgId, words.slice(0, idx).join(' '));
      } else {
        clearInterval(t);
      }
    }, interval);
  };

  const speakText = async (text) => {
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.currentTime = 0; } catch (e) {}
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    stopRecording();
    setListening(false);
    setRecordingState('idle');
    isSpeakingRef.current = true;
    setSpeaking(true);

    const onDone = () => {
      isSpeakingRef.current = false;
      setSpeaking(false);
      audioRef.current = null;
      setTimeout(() => {
        if (callStateRef.current === 'connected' && !isMutedRef.current) {
          startRecording();
        }
      }, 200);
    };

    try {
      const ttsRes = await fetch(`${BASE_URL}/api/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceType: callData?.voiceType || (isMale ? 'shubh' : 'ritu'),
          languageMode: callData?.languageMode || 'Hinglish',
        }),
      });

      if (ttsRes.ok && ttsRes.headers.get('content-type')?.includes('audio')) {
        const blob = await ttsRes.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onplay = () => {
          isSpeakingRef.current = true;
          setSpeaking(true);
          streamWordsIntoTranscript(text, audio.duration || 3);
        };
        audio.onended = () => { URL.revokeObjectURL(url); onDone(); };
        audio.onerror = () => { URL.revokeObjectURL(url); onDone(); };
        await audio.play();
        return;
      }
    } catch (err) {}

    addTranscript('agent', text);
    onDone();
  };

  useEffect(() => {
    if (callState === 'connected' && callData) {
      const greeting = callData.script ||
        `Namaste ${callData.customerName || 'Customer'}! Main Demo.pay recovery desk se ${agentName} baat kar ${agentGender === 'male' ? 'raha' : 'rahi'} hoon. Maine dekha aapka payment checkout par ruk gaya tha. Kya payment mein koi takleef aayi thi?`;
      setTimeout(() => speakText(greeting), 450);
    }
    return () => {
      if (audioRef.current) { try { audioRef.current.pause(); } catch (e) {} audioRef.current = null; }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      stopRecording();
      stopWave();
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try { audioCtxRef.current.close(); } catch (e) {}
        audioCtxRef.current = null;
      }
    };
  }, [callState]);

  const handleUserReply = async (userText) => {
    if (!userText?.trim()) return;
    stopRecording();
    setRecordingState('idle');
    setListening(false);
    isProcessingRef.current = true;
    setIsProcessing(true);
    addTranscript('user', userText);

    try {
      const res = await fetch(`${BASE_URL}/api/voice/interact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: callData?.caseId,
          orderId: callData?.orderId,
          userSpeech: userText,
          conversationHistory: transcript,
          currentDiscount,
        }),
      });
      const data = await res.json();
      isProcessingRef.current = false;
      setIsProcessing(false);
      if (data.success && data.aiReply) {
        if (data.discountAppliedPct && data.discountAppliedPct > currentDiscount) {
          setCurrentDiscount(data.discountAppliedPct);
        }
        speakText(data.aiReply);
        if (data.promiseRecorded) {
          const hours = data.hoursAhead || 24;
          const label = hours === 24 ? 'Tomorrow (+24h)' : hours === 48 ? 'Monday (+48h)' : 'Later today (+6h)';
          setPromiseResult({ isPromise: true, hoursAhead: hours, label });
          addEvent({
            id: Date.now().toString(),
            type: 'promise_created',
            message: `Voice Agent (${agentName}) secured promise to pay from ${callData?.customerName || 'customer'} (${label}).`,
          });
          updateKpis({ activeInterventions: 1 });
        }
      }
    } catch (err) {
      isProcessingRef.current = false;
      setIsProcessing(false);
      speakText('Maine aapka request note kar liya hai. Thank you!');
    }
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setMuted(next);
    isMutedRef.current = next;
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
    }
    if (next) {
      stopRecording();
      setListening(false);
      setRecordingState('idle');
    } else {
      if (callStateRef.current === 'connected' && !isSpeakingRef.current && !isProcessingRef.current) {
        startRecording();
      }
    }
  };

  const handleMainButtonClick = () => {
    if (isSpeaking || isProcessing) return;
    if (isMuted) { handleToggleMute(); return; }
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const t = inputText;
    setInputText('');
    handleUserReply(t);
  };

  const formatSeconds = (s) => {
    const m = Math.floor(s / 60); const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  const isRecordingActive = recordingState === 'recording';
  const isTranscribing = recordingState === 'processing';

  const btnClass = isSpeaking || isProcessing || isTranscribing
    ? 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 cursor-not-allowed'
    : isMuted
    ? 'bg-muted text-muted-foreground border border-dashed border-border'
    : isRecordingActive && volumeLevel > 8
    ? 'bg-emerald-500 text-white ring-4 ring-emerald-500/40 shadow-lg shadow-emerald-500/40 animate-pulse'
    : isRecordingActive
    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">

        {callState === 'ringing' && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-sm rounded-2xl border bg-card/95 shadow-2xl p-6 text-center space-y-6 relative overflow-hidden backdrop-blur-md"
          >
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-primary/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-primary/20 rounded-full blur-2xl pointer-events-none" />
            <div className="space-y-1">
              <Badge variant="outline" className="text-xs px-3 py-1 font-semibold uppercase tracking-wider text-primary border-primary/40 bg-primary/10 animate-pulse">
                Incoming AI Voice Call
              </Badge>
              <h3 className="text-xl font-bold mt-2">Demo.pay Recovery AI</h3>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" /> {agentName}
              </p>
            </div>
            <div className="relative flex items-center justify-center my-6">
              <div className="absolute w-24 h-24 rounded-full bg-primary/20 animate-ping opacity-75" />
              <div className="absolute w-28 h-28 rounded-full bg-primary/10 animate-pulse" />
              <div className={`relative w-20 h-20 rounded-full ${isMale ? 'bg-gradient-to-tr from-sky-600 to-indigo-500' : 'bg-gradient-to-tr from-primary to-primary/60'} flex items-center justify-center shadow-lg border-2 border-background`}>
                <PhoneCall className="h-9 w-9 text-white animate-bounce" />
              </div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1 border">
              <div className="flex justify-between text-muted-foreground">
                <span>Order</span>
                <span className="font-semibold text-foreground">{callData?.productName || 'Cart Items'}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Amount</span>
                <span className="font-semibold text-foreground">₹{(callData?.amountInRs || 2499).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-8 pt-2">
              <div className="flex flex-col items-center gap-1">
                <Button size="icon" variant="destructive" className="h-14 w-14 rounded-full shadow-lg" onClick={declineCall}>
                  <PhoneOff className="h-6 w-6" />
                </Button>
                <span className="text-xs text-muted-foreground">Decline</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Button size="icon" className="h-14 w-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg animate-pulse" onClick={handleAcceptCall}>
                  <Phone className="h-6 w-6" />
                </Button>
                <span className="text-xs font-semibold text-foreground">Accept</span>
              </div>
            </div>
          </motion.div>
        )}

        {(callState === 'connected' || callState === 'ended') && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl flex flex-col overflow-hidden"
            style={{ height: '640px', maxHeight: '94vh' }}
          >
            <div className="flex-none h-14 px-4 border-b flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${isMale ? 'bg-sky-500/20 text-sky-500' : 'bg-primary/20 text-primary'}`}>
                    {agentName[0]}
                  </div>
                  {isSpeaking && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-card animate-pulse" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{agentName}</span>
                    <Badge variant="outline" className="text-[10px] text-primary border-primary/30">{callData?.languageMode || 'Hinglish'}</Badge>
                    {currentDiscount > 0 && (
                      <Badge className="bg-emerald-600 text-white text-[10px] gap-1 py-0 h-4">
                        <Tag className="h-2.5 w-2.5" />{currentDiscount}% Off
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{formatSeconds(callDuration)}</span>
                  </div>
                </div>
              </div>
              {callState === 'connected' ? (
                <Button size="sm" variant="destructive" className="rounded-full px-4 h-8 gap-1"
                  onClick={() => { stopRecording(); endCall(); }}>
                  <PhoneOff className="h-3.5 w-3.5" />
                  <span className="text-xs">End Call</span>
                </Button>
              ) : (
                <Button size="sm" variant="secondary" className="rounded-full px-4 h-8 text-xs" onClick={closeModal}>
                  Close
                </Button>
              )}
            </div>

            {micDenied && (
              <div className="flex-none px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-xs text-amber-600 dark:text-amber-400 text-center">
                Microphone access blocked — please allow microphone access in your browser settings.
              </div>
            )}

            {promiseResult && (
              <div className="flex-none bg-emerald-500/10 border-b border-emerald-500/30 px-4 py-2 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="font-semibold">Promise Recorded:</span>
                <span>{promiseResult.label}. Outreach paused.</span>
              </div>
            )}

            <div ref={transcriptContainerRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-background">
              {transcript.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <Sparkles className="h-8 w-8 opacity-30" />
                  <p className="text-xs">Call connected. {agentName} will speak first...</p>
                </div>
              )}
              {transcript.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-sm ${
                    msg.sender === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-muted/80 text-foreground border rounded-tl-none'
                  }`}>
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 px-1">
                    {msg.sender === 'user' ? 'You' : agentName} · {msg.time}
                  </span>
                </div>
              ))}
              {isProcessing && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
                  <Sparkles className="h-3 w-3 animate-spin text-primary" />
                  <span>{agentName} is thinking...</span>
                </div>
              )}
            </div>

            {callState === 'connected' && (
              <div className="flex-none border-t bg-muted/20 px-4 py-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {isSpeaking ? (
                      <><Volume2 className="h-4 w-4 text-zinc-400 shrink-0 animate-pulse" /><span className="text-xs font-semibold text-zinc-400 truncate">{agentName} is speaking...</span></>
                    ) : isProcessing || isTranscribing ? (
                      <><Sparkles className="h-4 w-4 text-primary shrink-0 animate-spin" /><span className="text-xs font-semibold text-primary truncate">{isTranscribing ? 'Transcribing your voice...' : 'Thinking...'}</span></>
                    ) : isMuted ? (
                      <><MicOff className="h-4 w-4 text-destructive shrink-0" /><span className="text-xs font-semibold text-destructive truncate">Microphone muted</span></>
                    ) : isRecordingActive && volumeLevel > 8 ? (
                      <><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" /><span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 truncate">Recording your voice... ({volumeLevel}%)</span></>
                    ) : isRecordingActive ? (
                      <><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" /><span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 truncate">Recording — speak now</span></>
                    ) : (
                      <><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" /><span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 truncate">Ready — speak now</span></>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider shrink-0">
                    {isSpeaking ? 'AI' : isTranscribing ? 'STT' : isProcessing ? 'AI' : isMuted ? 'Muted' : isRecordingActive ? 'REC' : 'Ready'}
                  </span>
                </div>
                <div className="h-10 w-full bg-background/60 rounded-xl border flex items-center justify-center px-2 overflow-hidden shadow-inner">
                  <canvas ref={canvasRef} width={340} height={36} className="w-full h-9 block" />
                </div>
              </div>
            )}

            {callState === 'connected' && (
              <div className="flex-none border-t bg-muted/40 p-3 space-y-2.5">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleMainButtonClick}
                    disabled={isSpeaking || isProcessing || isTranscribing}
                    className={`flex-1 h-14 rounded-2xl flex items-center justify-center gap-3 font-semibold text-sm transition-all focus:outline-none select-none ${btnClass}`}
                  >
                    {isSpeaking ? (
                      <><Volume2 className="h-6 w-6 text-zinc-400 animate-pulse" /><span>AI Speaking...</span></>
                    ) : isTranscribing ? (
                      <><Sparkles className="h-6 w-6 text-primary animate-spin" /><span>Transcribing Voice...</span></>
                    ) : isProcessing ? (
                      <><Sparkles className="h-6 w-6 text-primary animate-spin" /><span>Processing...</span></>
                    ) : isMuted ? (
                      <><MicOff className="h-5 w-5 text-muted-foreground" /><span>Muted</span></>
                    ) : isRecordingActive && volumeLevel > 8 ? (
                      <><Mic className="h-6 w-6 text-white animate-bounce" /><span>Hearing You — Will Auto-send</span></>
                    ) : isRecordingActive ? (
                      <><Mic className="h-6 w-6 text-white" /><span>Recording... Speak Now</span></>
                    ) : (
                      <><Mic className="h-6 w-6 text-white" /><span>Speak Now</span></>
                    )}
                  </button>

                  <Button
                    type="button"
                    variant={isMuted ? 'destructive' : 'outline'}
                    onClick={handleToggleMute}
                    className={`h-14 px-5 rounded-2xl flex items-center gap-2 font-semibold text-xs shrink-0 transition-all ${
                      isMuted ? 'bg-destructive hover:bg-destructive/90 text-white shadow-md' : 'border-border text-foreground hover:bg-muted'
                    }`}
                  >
                    {isMuted ? <><MicOff className="h-4 w-4" /><span>Unmute</span></> : <><Mic className="h-4 w-4 text-emerald-500" /><span>Mute</span></>}
                  </Button>
                </div>

                {!promiseResult && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {[
                      ['📅 Kal pay karunga', 'Main kal payment karunga'],
                      ['🎁 Discount milega?', 'Thoda discount mil sakta hai kya?'],
                      ['⏰ Shaam ko remind karna', 'Shaam ko reminder bhej dena'],
                      ['📉 Aur kam karo', 'Budget kam hai, aur discount do'],
                    ].map(([label, reply]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => handleUserReply(reply)}
                        className="text-[11px] h-6 px-2.5 rounded-full border bg-background/80 hover:border-primary hover:bg-primary/5 transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <form onSubmit={handleManualSubmit} className="flex gap-2">
                  <Input
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    placeholder="Or type your reply here..."
                    className="text-xs h-8 bg-background"
                  />
                  <Button type="submit" size="sm" className="h-8 px-3 shrink-0" disabled={!inputText.trim() || isProcessing}>
                    <Send className="h-3 w-3" />
                  </Button>
                </form>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  );
}
