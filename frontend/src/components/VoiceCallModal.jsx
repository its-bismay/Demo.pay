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
  Loader2,
  AlertCircle,
  MessageSquare,
  ArrowRight
} from 'lucide-react';
import { useVoiceCallStore, useLiveFeedStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3001';
    }
  }
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
};

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
  const [showTextInput, setShowTextInput] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentDiscount, setCurrentDiscount] = useState(0);
  const [micDenied, setMicDenied] = useState(false);
  const [recordingState, setRecordingState] = useState('idle');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [hasVoiceDetected, setHasVoiceDetected] = useState(false);
  const [statusLog, setStatusLog] = useState('Connecting audio...');

  const ringtoneRef = useRef(null);
  const transcriptContainerRef = useRef(null);
  const audioRef = useRef(null);
  const fallbackTimerRef = useRef(null);

  const micStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const freqDataRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const vadIntervalRef = useRef(null);
  const isRecordingRef = useRef(false);
  const hasSpokenRef = useRef(false);
  const silenceCountRef = useRef(0);

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
      const curVolume = Math.min(100, Math.round((avg / 128) * 100));
      setVolumeLevel(curVolume);

      const n = 32;
      const bw = 5;
      const gap = Math.max(3, (W - n * bw) / (n + 1));

      for (let i = 0; i < n; i++) {
        const di = Math.floor((i / n) * (data.length / 2));
        const val = data[di] || 0;
        let bh = 4;

        if (isMutedRef.current) {
          bh = 2;
          ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
        } else if (isSpeakingRef.current) {
          bh = Math.max(5, Math.sin(Date.now() / 110 + i * 0.4) * 12 + 14);
          ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
        } else if (recordingState === 'sending') {
          bh = Math.max(4, Math.sin(Date.now() / 80 + i * 0.5) * 8 + 10);
          ctx.fillStyle = '#f59e0b';
        } else if (curVolume > 7 || hasSpokenRef.current) {
          bh = Math.max(6, Math.min(H - 4, (val / 255) * (H - 4)));
          ctx.fillStyle = '#10b981';
        } else {
          bh = Math.max(3, (val / 255) * (H - 8));
          ctx.fillStyle = 'rgba(71, 85, 105, 0.4)';
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

  const stopWave = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const c = canvasRef.current;
    if (c) { const ctx = c.getContext('2d'); if (ctx) ctx.clearRect(0, 0, c.width, c.height); }
  };

  const stopRecordingAndSend = () => {
    if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
    isRecordingRef.current = false;
    setHasVoiceDetected(false);
    hasSpokenRef.current = false;
    silenceCountRef.current = 0;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const sendAudioToSTT = async (blob) => {
    if (!blob || blob.size < 600) {
      setStatusLog('Mic active (waiting for speech)');
      if (callStateRef.current === 'connected' && !isSpeakingRef.current && !isProcessingRef.current && !isMutedRef.current) {
        startRecording();
      }
      return;
    }

    setRecordingState('sending');
    setListening(false);
    setStatusLog(`Uploading voice (${Math.round(blob.size / 1024)} KB)...`);

    try {
      const form = new FormData();
      form.append('audio', blob, 'speech.webm');
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}/api/voice/stt`, {
        method: 'POST',
        body: form,
      });

      const data = await res.json();
      if (res.ok && data.success && data.transcript?.trim()) {
        const recognized = data.transcript.trim();
        setStatusLog(`Heard: "${recognized}"`);
        await handleUserReply(recognized);
      } else {
        setStatusLog(data.error ? `STT: ${data.error}` : 'Ready for next response');
        if (callStateRef.current === 'connected' && !isSpeakingRef.current && !isProcessingRef.current && !isMutedRef.current) {
          startRecording();
        }
      }
    } catch (err) {
      setStatusLog(`Network error: ${err.message}`);
      if (callStateRef.current === 'connected' && !isSpeakingRef.current && !isProcessingRef.current && !isMutedRef.current) {
        startRecording();
      }
    }
  };

  const startRecording = async () => {
    if (
      isMutedRef.current ||
      callStateRef.current !== 'connected' ||
      isSpeakingRef.current ||
      isProcessingRef.current
    ) return;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') return;

    if (!micStreamRef.current || micStreamRef.current.getAudioTracks().every(t => t.readyState === 'ended')) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000,
            channelCount: 1,
          },
        });
        micStreamRef.current = stream;
        setupAudioAnalyser(stream);
      } catch (e) {
        setMicDenied(true);
        setStatusLog('Microphone permission blocked');
        return;
      }
    }

    if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }

    chunksRef.current = [];
    isRecordingRef.current = true;
    hasSpokenRef.current = false;
    silenceCountRef.current = 0;
    setHasVoiceDetected(false);
    setRecordingState('recording');
    setListening(true);
    setStatusLog('Listening... Speak naturally');

    let mimeType = '';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
    else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
    else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';

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

      recorder.onerror = (e) => {
        isRecordingRef.current = false;
        setRecordingState('idle');
        setStatusLog('Recorder error: ' + (e?.error?.message || 'unknown'));
      };

      recorder.start(200);

      vadIntervalRef.current = setInterval(() => {
        if (!isRecordingRef.current || !analyserRef.current || !freqDataRef.current) {
          if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
          return;
        }

        analyserRef.current.getByteFrequencyData(freqDataRef.current);
        let s = 0;
        for (let i = 0; i < freqDataRef.current.length; i++) s += freqDataRef.current[i];
        const avg = s / (freqDataRef.current.length || 1);
        const curPct = Math.min(100, Math.round((avg / 128) * 100));

        if (curPct > 7) {
          hasSpokenRef.current = true;
          setHasVoiceDetected(true);
          silenceCountRef.current = 0;
        } else {
          if (hasSpokenRef.current) {
            silenceCountRef.current += 1;
            if (silenceCountRef.current >= 10) {
              if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
              stopRecordingAndSend();
            }
          } else {
            setHasVoiceDetected(false);
          }
        }
      }, 140);

    } catch (err) {
      isRecordingRef.current = false;
      setRecordingState('idle');
      setStatusLog('Mic start error: ' + err.message);
    }
  };

  const setupAudioAnalyser = (stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      const source = audioCtxRef.current.createMediaStreamSource(stream);
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      analyserRef.current = analyser;
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      drawWave();
    } catch (e) {}
  };

  const handleAcceptCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });
      micStreamRef.current = stream;
      setupAudioAnalyser(stream);
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
    if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    stopRecordingAndSend();
    setListening(false);
    setRecordingState('idle');
    isSpeakingRef.current = true;
    setSpeaking(true);

    let doneFired = false;
    const onDone = () => {
      if (doneFired) return;
      doneFired = true;
      if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
      isSpeakingRef.current = false;
      setSpeaking(false);
      audioRef.current = null;
      setTimeout(() => {
        if (callStateRef.current === 'connected' && !isMutedRef.current) {
          startRecording();
        }
      }, 200);
    };

    fallbackTimerRef.current = setTimeout(onDone, 12000);

    try {
      const baseUrl = getBaseUrl();
      const ttsRes = await fetch(`${baseUrl}/api/voice/tts`, {
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
        audio.play().catch(() => {
          onDone();
        });
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
      setTimeout(() => speakText(greeting), 400);
    }
  }, [callState]);

  const teardownCall = () => {
    if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
    if (audioRef.current) { try { audioRef.current.pause(); } catch (e) {} audioRef.current = null; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    stopRecordingAndSend();
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

  const handleEndCall = () => {
    teardownCall();
    endCall();
  };

  const handleCloseModal = () => {
    teardownCall();
    closeModal();
  };

  const handleUserReply = async (userText) => {
    if (!userText?.trim()) return;
    stopRecordingAndSend();
    setRecordingState('idle');
    setListening(false);
    isProcessingRef.current = true;
    setIsProcessing(true);
    addTranscript('user', userText);

    try {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}/api/voice/interact`, {
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
      stopRecordingAndSend();
      setListening(false);
      setRecordingState('idle');
    } else {
      if (callStateRef.current === 'connected' && !isSpeakingRef.current && !isProcessingRef.current) {
        startRecording();
      }
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const t = inputText;
    setInputText('');
    setShowTextInput(false);
    handleUserReply(t);
  };

  const formatSeconds = (s) => {
    const m = Math.floor(s / 60); const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  const isRecordingActive = recordingState === 'recording';
  const isSending = recordingState === 'sending';

  let stageColor = 'border-slate-800 bg-slate-900/50';
  let stageTitle = 'Connecting...';
  let stageDesc = statusLog;

  if (isSpeaking) {
    stageColor = 'border-primary/40 bg-primary/5';
    stageTitle = `${agentName} is speaking...`;
    stageDesc = 'Listen to the recovery assistant';
  } else if (isProcessing) {
    stageColor = 'border-primary/50 bg-primary/10';
    stageTitle = `${agentName} is thinking...`;
    stageDesc = 'Generating AI response';
  } else if (isSending) {
    stageColor = 'border-amber-500/50 bg-amber-500/10 animate-pulse';
    stageTitle = 'Sending your voice to AI...';
    stageDesc = 'Transcribing with Sarvam saaras:v3';
  } else if (isMuted) {
    stageColor = 'border-destructive/40 bg-destructive/5';
    stageTitle = 'Microphone Muted';
    stageDesc = 'Click unmute to talk';
  } else if (isRecordingActive && hasVoiceDetected) {
    stageColor = 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/20';
    stageTitle = `Voice Detected! (${volumeLevel}%)`;
    stageDesc = 'Listening... pause to send, or click Send Now';
  } else if (isRecordingActive) {
    stageColor = 'border-slate-700 bg-slate-900/80';
    stageTitle = 'Listening... Speak now';
    stageDesc = `No voice detected yet (Level: ${volumeLevel}%)`;
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">

        {callState === 'ringing' && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-sm rounded-3xl border bg-card/95 shadow-2xl p-6 text-center space-y-6 relative overflow-hidden backdrop-blur-md"
          >
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-primary/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-primary/20 rounded-full blur-2xl pointer-events-none" />
            <div className="space-y-1">
              <Badge variant="outline" className="text-xs px-3 py-1 font-semibold uppercase tracking-wider text-primary border-primary/40 bg-primary/10 animate-pulse">
                Incoming Recovery Call
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
            <div className="bg-muted/40 rounded-xl p-3 text-xs space-y-1 border">
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
            className="w-full max-w-md rounded-3xl border bg-card/95 shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl"
            style={{ height: '620px', maxHeight: '92vh' }}
          >
            <div className="flex-none px-5 py-3 border-b flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white ${isMale ? 'bg-sky-600' : 'bg-primary'} shadow-md`}>
                    {agentName[0]}
                  </div>
                  {isSpeaking && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card animate-pulse" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{agentName}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{callData?.languageMode || 'Hinglish'}</Badge>
                    {currentDiscount > 0 && (
                      <Badge className="bg-emerald-600 text-white text-[10px] py-0 h-4">
                        <Tag className="h-2 w-2 mr-1" />{currentDiscount}% Off
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
                <Button size="sm" variant="destructive" className="rounded-full px-3.5 h-8 gap-1 text-xs" onClick={handleEndCall}>
                  <PhoneOff className="h-3.5 w-3.5" />
                  <span>End</span>
                </Button>
              ) : (
                <Button size="sm" variant="secondary" className="rounded-full px-4 h-8 text-xs" onClick={handleCloseModal}>
                  Close
                </Button>
              )}
            </div>

            {micDenied && (
              <div className="flex-none px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-xs text-amber-500 text-center flex items-center justify-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Microphone access blocked - please allow microphone in your browser settings.</span>
              </div>
            )}

            {promiseResult && (
              <div className="flex-none bg-emerald-500/10 border-b border-emerald-500/30 px-4 py-2 flex items-center gap-2 text-xs text-emerald-500">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="font-semibold">Promise Recorded:</span>
                <span>{promiseResult.label}.</span>
              </div>
            )}

            <div className="flex-none p-4">
              <div className={`rounded-2xl border p-4 transition-all duration-300 ${stageColor}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isSpeaking ? (
                      <Volume2 className="h-4 w-4 text-primary animate-pulse" />
                    ) : isSending ? (
                      <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />
                    ) : isProcessing ? (
                      <Sparkles className="h-4 w-4 text-primary animate-spin" />
                    ) : hasVoiceDetected ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                    )}
                    <span className="font-semibold text-xs tracking-wide">{stageTitle}</span>
                  </div>

                  {isRecordingActive && hasVoiceDetected && (
                    <button
                      type="button"
                      onClick={stopRecordingAndSend}
                      className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 shadow-md animate-bounce"
                    >
                      Send Now <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="h-8 w-full flex items-center justify-center overflow-hidden">
                  <canvas ref={canvasRef} width={380} height={28} className="w-full h-7 block" />
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                  <span className="truncate max-w-[260px]">{stageDesc}</span>
                  <span className="font-mono text-[10px]">{isMuted ? 'MUTED' : `${volumeLevel}%`}</span>
                </div>
              </div>
            </div>

            <div ref={transcriptContainerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-2.5 bg-background/30">
              {transcript.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-1.5 opacity-60">
                  <Sparkles className="h-6 w-6" />
                  <p className="text-xs">{agentName} will start the conversation...</p>
                </div>
              )}
              {transcript.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs shadow-sm ${
                    msg.sender === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-muted/90 text-foreground border rounded-tl-none'
                  }`}>
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                    {msg.sender === 'user' ? 'You' : agentName} · {msg.time}
                  </span>
                </div>
              ))}
              {isProcessing && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground italic px-1">
                  <Sparkles className="h-3 w-3 animate-spin text-primary" />
                  <span>{agentName} is thinking...</span>
                </div>
              )}
            </div>

            {callState === 'connected' && (
              <div className="flex-none border-t bg-card/60 p-3 space-y-2.5">
                {!promiseResult && (
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      ['📅 Kal pay karunga', 'Main kal payment karunga'],
                      ['🎁 Discount milega?', 'Thoda discount mil sakta hai kya?'],
                      ['⏰ Shaam ko remind karna', 'Shaam ko reminder bhej dena'],
                    ].map(([label, reply]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => handleUserReply(reply)}
                        className="text-[11px] h-6 px-2.5 rounded-full border bg-muted/40 hover:border-primary hover:bg-primary/5 transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {showTextInput ? (
                  <form onSubmit={handleManualSubmit} className="flex gap-2">
                    <Input
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      placeholder="Type your reply here..."
                      className="text-xs h-9 bg-background"
                      autoFocus
                    />
                    <Button type="submit" size="sm" className="h-9 px-3 shrink-0" disabled={!inputText.trim() || isProcessing}>
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-9 px-2 text-xs" onClick={() => setShowTextInput(false)}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-4 pt-1">
                    <Button
                      type="button"
                      variant={isMuted ? 'destructive' : 'outline'}
                      size="icon"
                      onClick={handleToggleMute}
                      className={`h-12 w-12 rounded-full shadow-sm ${
                        isMuted ? 'bg-destructive text-white' : 'hover:bg-muted text-foreground'
                      }`}
                      title={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5 text-emerald-500" />}
                    </Button>

                    <button
                      type="button"
                      onClick={() => setShowTextInput(true)}
                      className="flex-1 h-12 rounded-full border border-dashed border-border hover:border-primary/60 bg-muted/30 hover:bg-muted/60 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-2 px-4 transition-all"
                    >
                      <MessageSquare className="h-4 w-4 text-primary" />
                      <span>Type reply instead</span>
                    </button>

                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={handleEndCall}
                      className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md"
                      title="End Call"
                    >
                      <PhoneOff className="h-5 w-5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  );
}
