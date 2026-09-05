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
        o1.type = 'sine';
        o1.frequency.setValueAtTime(440, now);
        o2.type = 'sine';
        o2.frequency.setValueAtTime(480, now);
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
    isOpen, callState, isMuted, isSpeaking, isListening, callData,
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
  const [interimSpeech, setInterimSpeech] = useState('');
  const [currentDiscount, setCurrentDiscount] = useState(0);
  const [micDenied, setMicDenied] = useState(false);
  const [isUserTalking, setIsUserTalking] = useState(false);

  const ringtoneRef = useRef(null);
  const recognitionRef = useRef(null);
  const transcriptContainerRef = useRef(null);
  const audioRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const interimRef = useRef('');

  const micStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const freqDataRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  const callStateRef = useRef(callState);
  const isMutedRef = useRef(isMuted);
  const isSpeakingRef = useRef(isSpeaking);
  const isProcessingRef = useRef(isProcessing);
  const isListeningDesiredRef = useRef(false);

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
  }, [transcript, isProcessing, interimSpeech]);

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

  const startWaveAnimation = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const draw = () => {
      if (!canvasRef.current || !analyserRef.current || !freqDataRef.current) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const width = canvas.width;
      const height = canvas.height;
      const dataArray = freqDataRef.current;
      analyserRef.current.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / (dataArray.length || 1);

      if (avg > 15 && !isSpeakingRef.current && !isMutedRef.current) {
        setIsUserTalking(true);
      } else {
        setIsUserTalking(false);
      }

      const numBars = 26;
      const barWidth = 4;
      const gap = Math.max(3, (width - numBars * barWidth) / (numBars + 1));

      for (let i = 0; i < numBars; i++) {
        const dataIndex = Math.floor((i / numBars) * (dataArray.length / 2));
        const val = dataArray[dataIndex] || 0;
        let barHeight = 4;

        if (isMutedRef.current) {
          barHeight = 3;
        } else if (isSpeakingRef.current) {
          barHeight = Math.max(4, Math.sin(Date.now() / 150 + i * 0.45) * 9 + 12);
        } else {
          barHeight = Math.max(4, Math.min(height - 4, (val / 255) * (height - 4)));
        }

        const x = gap + i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        if (isMutedRef.current) {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
        } else if (isSpeakingRef.current) {
          ctx.fillStyle = 'rgba(161, 161, 170, 0.55)';
        } else if (val > 18 || avg > 15) {
          ctx.fillStyle = '#10b981';
        } else {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
        }

        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeight, 2);
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
  };

  const stopWaveAnimation = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const killRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const stopListening = () => {
    isListeningDesiredRef.current = false;
    setListening(false);
    setInterimSpeech('');
    interimRef.current = '';
    killRecognition();
  };

  const startListening = () => {
    if (
      isMutedRef.current ||
      callStateRef.current !== 'connected' ||
      isSpeakingRef.current ||
      isProcessingRef.current
    ) return;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    killRecognition();
    isListeningDesiredRef.current = true;
    setListening(true);
    setInterimSpeech('');
    interimRef.current = '';

    try {
      const rec = new SpeechRec();
      rec.lang = 'en-IN';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        setListening(true);
      };

      rec.onresult = (event) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          const t = r[0]?.transcript || '';
          if (r.isFinal) final += t;
          else interim += t;
        }

        const live = (interim || final).trim();
        if (live) {
          setInterimSpeech(live);
          interimRef.current = live;
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            const captured = interimRef.current.trim();
            if (captured && isListeningDesiredRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
              stopListening();
              handleUserReply(captured);
            }
          }, 1800);
        }

        if (final.trim()) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          const submitted = final.trim();
          stopListening();
          handleUserReply(submitted);
        }
      };

      rec.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        if (event.error === 'not-allowed') {
          setMicDenied(true);
          stopListening();
        }
      };

      rec.onend = () => {
        recognitionRef.current = null;
        if (
          isListeningDesiredRef.current &&
          callStateRef.current === 'connected' &&
          !isMutedRef.current &&
          !isSpeakingRef.current &&
          !isProcessingRef.current
        ) {
          setTimeout(() => {
            if (
              isListeningDesiredRef.current &&
              callStateRef.current === 'connected' &&
              !isMutedRef.current &&
              !isSpeakingRef.current &&
              !isProcessingRef.current
            ) {
              startListening();
            }
          }, 150);
        } else {
          setListening(false);
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (e) {
      setListening(false);
    }
  };

  const handleAcceptCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
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
        startWaveAnimation();
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
    stopListening();
    isSpeakingRef.current = true;
    setSpeaking(true);

    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
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

        audio.onended = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          isSpeakingRef.current = false;
          setSpeaking(false);
          setTimeout(() => {
            if (callStateRef.current === 'connected' && !isMutedRef.current) {
              startListening();
            }
          }, 100);
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          isSpeakingRef.current = false;
          setSpeaking(false);
          setTimeout(() => {
            if (callStateRef.current === 'connected' && !isMutedRef.current) {
              startListening();
            }
          }, 100);
        };

        await audio.play();
        return;
      }
    } catch (err) {}

    if (!('speechSynthesis' in window)) {
      addTranscript('agent', text);
      isSpeakingRef.current = false;
      setSpeaking(false);
      setTimeout(() => {
        if (callStateRef.current === 'connected' && !isMutedRef.current) {
          startListening();
        }
      }, 100);
      return;
    }

    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.95;
    utt.pitch = isMale ? 0.9 : 1.05;
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find(v => isMale
      ? v.name.includes('Male') || v.name.includes('David') || v.name.includes('Ravi')
      : v.lang.includes('IN') || v.lang.includes('hi') || v.name.includes('Aditi') || v.name.includes('Priya')
    ) || voices.find(v => v.lang.startsWith('en'));
    if (match) utt.voice = match;

    utt.onstart = () => {
      isSpeakingRef.current = true;
      setSpeaking(true);
      streamWordsIntoTranscript(text, 3);
    };

    utt.onend = () => {
      isSpeakingRef.current = false;
      setSpeaking(false);
      setTimeout(() => {
        if (callStateRef.current === 'connected' && !isMutedRef.current) {
          startListening();
        }
      }, 100);
    };

    utt.onerror = () => {
      isSpeakingRef.current = false;
      setSpeaking(false);
      setTimeout(() => {
        if (callStateRef.current === 'connected' && !isMutedRef.current) {
          startListening();
        }
      }, 100);
    };

    window.speechSynthesis.speak(utt);
  };

  useEffect(() => {
    if (callState === 'connected' && callData) {
      const greeting = callData.script ||
        `Namaste ${callData.customerName || 'Customer'}! Main Demo.pay recovery desk se ${agentName} baat kar ${agentGender === 'male' ? 'raha' : 'rahi'} hoon. Maine dekha aapka payment checkout par ruk gaya tha. Kya payment mein koi takleef aayi thi?`;
      setTimeout(() => speakText(greeting), 450);
    }
    return () => {
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch (e) {}
        audioRef.current = null;
      }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      stopListening();
      stopWaveAnimation();
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
    stopListening();
    isProcessingRef.current = true;
    setIsProcessing(true);
    setInterimSpeech('');
    interimRef.current = '';
    addTranscript('user', userText);

    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
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
    const nextMuted = !isMuted;
    setMuted(nextMuted);
    isMutedRef.current = nextMuted;

    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
    }

    if (nextMuted) {
      stopListening();
    } else {
      if (callStateRef.current === 'connected' && !isSpeakingRef.current && !isProcessingRef.current) {
        startListening();
      }
    }
  };

  const handleMainButtonClick = () => {
    if (isSpeaking || isProcessing) return;
    if (isMuted) {
      handleToggleMute();
      return;
    }
    if (interimSpeech.trim()) {
      const text = interimSpeech.trim();
      stopListening();
      handleUserReply(text);
      return;
    }
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    handleUserReply(text);
  };

  const formatSeconds = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
        {callState === 'ringing' && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
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
                <Sparkles className="h-3 w-3 text-primary" />
                {agentName}
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
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
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
                  onClick={() => { stopListening(); endCall(); }}>
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
                Microphone blocked by browser. Please enable mic permissions or use the text box below.
              </div>
            )}

            {promiseResult && (
              <div className="flex-none bg-emerald-500/10 border-b border-emerald-500/30 px-4 py-2 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="font-semibold">Promise Recorded:</span>
                <span>{promiseResult.label}. Outreach paused.</span>
              </div>
            )}

            <div
              ref={transcriptContainerRef}
              className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-background"
            >
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
                      <>
                        <Volume2 className="h-4 w-4 text-zinc-400 shrink-0 animate-pulse" />
                        <span className="text-xs font-semibold text-zinc-400 truncate">
                          {agentName} is speaking... Please wait
                        </span>
                      </>
                    ) : isProcessing ? (
                      <>
                        <Sparkles className="h-4 w-4 text-primary shrink-0 animate-spin" />
                        <span className="text-xs font-semibold text-primary truncate">
                          Sending to AI...
                        </span>
                      </>
                    ) : isMuted ? (
                      <>
                        <MicOff className="h-4 w-4 text-destructive shrink-0" />
                        <span className="text-xs font-semibold text-destructive truncate">
                          Microphone is muted
                        </span>
                      </>
                    ) : interimSpeech ? (
                      <>
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 truncate">
                          Hearing: "{interimSpeech}"
                        </span>
                      </>
                    ) : isListening ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 truncate">
                          Microphone active — speak now
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">
                          Mic standby
                        </span>
                      </>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider shrink-0">
                    {isSpeaking ? 'AI Speaking' : isMuted ? 'Muted' : isListening ? 'Live Wave' : 'Standby'}
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
                    disabled={isSpeaking || isProcessing}
                    className={`flex-1 h-14 rounded-2xl flex items-center justify-center gap-3 font-semibold text-sm transition-all focus:outline-none select-none ${
                      isSpeaking || isProcessing
                        ? 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 cursor-not-allowed shadow-none'
                        : isMuted
                        ? 'bg-muted text-muted-foreground border border-dashed border-border'
                        : isUserTalking || interimSpeech
                        ? 'bg-emerald-500 text-white ring-4 ring-emerald-500/40 shadow-lg shadow-emerald-500/40 animate-pulse'
                        : isListening
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                        : 'bg-emerald-700 text-white'
                    }`}
                  >
                    {isSpeaking ? (
                      <>
                        <Volume2 className="h-6 w-6 text-zinc-400 animate-pulse" />
                        <span>AI Speaking...</span>
                      </>
                    ) : isProcessing ? (
                      <>
                        <Sparkles className="h-6 w-6 text-primary animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : isMuted ? (
                      <>
                        <MicOff className="h-5 w-5 text-muted-foreground" />
                        <span>Mic Muted (Click Unmute)</span>
                      </>
                    ) : interimSpeech ? (
                      <>
                        <Mic className="h-6 w-6 text-white animate-bounce" />
                        <span className="truncate max-w-[200px]">Hearing you... (Auto-send)</span>
                      </>
                    ) : isListening ? (
                      <>
                        <Mic className="h-6 w-6 text-white" />
                        <span>Speak Now (Listening)</span>
                      </>
                    ) : (
                      <>
                        <Mic className="h-6 w-6 text-white" />
                        <span>Tap to Speak</span>
                      </>
                    )}
                  </button>

                  <Button
                    type="button"
                    variant={isMuted ? 'destructive' : 'outline'}
                    onClick={handleToggleMute}
                    className={`h-14 px-5 rounded-2xl flex items-center gap-2 font-semibold text-xs shrink-0 transition-all ${
                      isMuted
                        ? 'bg-destructive hover:bg-destructive/90 text-white shadow-md'
                        : 'border-border text-foreground hover:bg-muted'
                    }`}
                  >
                    {isMuted ? (
                      <>
                        <MicOff className="h-4 w-4" />
                        <span>Unmute</span>
                      </>
                    ) : (
                      <>
                        <Mic className="h-4 w-4 text-emerald-500" />
                        <span>Mute</span>
                      </>
                    )}
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
