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

  const ringtoneRef = useRef(null);
  const recognitionRef = useRef(null);
  const transcriptContainerRef = useRef(null);
  const audioRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const interimRef = useRef('');

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
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
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

      rec.onstart = () => { setListening(true); };

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
            if (captured && isListeningDesiredRef.current) {
              stopListening();
              handleUserReply(captured);
            }
          }, 2000);
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
          return;
        }
      };

      rec.onend = () => {
        if (
          isListeningDesiredRef.current &&
          callStateRef.current === 'connected' &&
          !isMutedRef.current &&
          !isSpeakingRef.current &&
          !isProcessingRef.current
        ) {
          try { rec.start(); } catch (e) {
            setTimeout(() => { if (isListeningDesiredRef.current) startListening(); }, 300);
          }
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
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
      if (idx < words.length) { idx++; updateTranscriptText(msgId, words.slice(0, idx).join(' ')); }
      else clearInterval(t);
    }, interval);
  };

  const speakText = async (text) => {
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.currentTime = 0; } catch (e) {}
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    stopListening();
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
        audio.onplay = () => { setSpeaking(true); streamWordsIntoTranscript(text, audio.duration || 3); };
        audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; startListening(); };
        audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; startListening(); };
        await audio.play();
        return;
      }
    } catch (err) {}

    if (!('speechSynthesis' in window)) {
      addTranscript('agent', text);
      setSpeaking(false);
      startListening();
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
    utt.onstart = () => { setSpeaking(true); streamWordsIntoTranscript(text, 3); };
    utt.onend = () => { setSpeaking(false); startListening(); };
    utt.onerror = () => { setSpeaking(false); startListening(); };
    window.speechSynthesis.speak(utt);
  };

  useEffect(() => {
    if (callState === 'connected' && callData) {
      const greeting = callData.script ||
        `Namaste ${callData.customerName || 'Customer'}! Main Demo.pay recovery desk se ${agentName} baat kar ${agentGender === 'male' ? 'raha' : 'rahi'} hoon. Maine dekha aapka payment checkout par ruk gaya tha. Kya payment mein koi takleef aayi thi?`;
      setTimeout(() => speakText(greeting), 500);
    }
    return () => {
      if (audioRef.current) { try { audioRef.current.pause(); } catch (e) {} audioRef.current = null; }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      stopListening();
    };
  }, [callState]);

  const handleUserReply = async (userText) => {
    if (!userText?.trim()) return;
    addTranscript('user', userText);
    setIsProcessing(true);
    setInterimSpeech('');
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
      setIsProcessing(false);
      if (data.success && data.aiReply) {
        if (data.discountAppliedPct && data.discountAppliedPct > currentDiscount) setCurrentDiscount(data.discountAppliedPct);
        speakText(data.aiReply);
        if (data.promiseRecorded) {
          const hours = data.hoursAhead || 24;
          const label = hours === 24 ? 'Tomorrow (+24h)' : hours === 48 ? 'Monday (+48h)' : 'Later today (+6h)';
          setPromiseResult({ isPromise: true, hoursAhead: hours, label });
          addEvent({ id: Date.now().toString(), type: 'promise_created', message: `Voice Agent (${agentName}) secured promise to pay from ${callData?.customerName || 'customer'} (${label}).` });
          updateKpis({ activeInterventions: 1 });
        }
      }
    } catch (err) {
      setIsProcessing(false);
      speakText('Maine aapka request note kar liya hai. Thank you!');
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

  const micState = isSpeaking
    ? 'ai-speaking'
    : isProcessing
    ? 'processing'
    : isMuted
    ? 'muted'
    : isListening
    ? interimSpeech
      ? 'hearing'
      : 'listening'
    : 'idle';

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
            style={{ height: '620px', maxHeight: '94vh' }}
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
                ⚠️ Microphone blocked by browser. Use quick replies or the text box below to speak.
              </div>
            )}

            {promiseResult && (
              <div className="flex-none bg-emerald-500/10 border-b border-emerald-500/30 px-4 py-2 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="font-semibold">Promise Recorded:</span>
                <span>{promiseResult.label}. Outreach paused.</span>
              </div>
            )}

            {interimSpeech && (
              <div className="flex-none px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/30 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium truncate">
                  Hearing: "{interimSpeech}"
                </span>
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

            {callState === 'connected' && !promiseResult && (
              <div className="flex-none p-3 bg-muted/20 border-t space-y-2">
                <p className="text-[11px] text-muted-foreground font-medium">Quick replies:</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ['📅 Kal pay karunga', 'Main kal payment karunga'],
                    ['🎁 Discount milega?', 'Thoda discount mil sakta hai kya?'],
                    ['⏰ Shaam ko remind karna', 'Shaam ko reminder bhej dena'],
                    ['📉 Aur kam karo', 'Budget kam hai, aur discount do'],
                  ].map(([label, reply]) => (
                    <button
                      key={label}
                      onClick={() => handleUserReply(reply)}
                      className="text-xs h-7 px-3 rounded-full border bg-background/80 hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {callState === 'connected' && (
              <div className="flex-none border-t bg-muted/40 p-3 flex items-center gap-2">
                <button
                  onClick={() => { isListening ? stopListening() : startListening(); }}
                  disabled={isSpeaking || isProcessing}
                  className={`relative flex-none flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all focus:outline-none ${
                    micState === 'hearing'
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40'
                      : micState === 'listening'
                      ? 'bg-emerald-600/80 text-white'
                      : micState === 'ai-speaking' || micState === 'processing'
                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                      : micState === 'muted'
                      ? 'bg-destructive/20 text-destructive border border-destructive/40'
                      : 'bg-muted text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600 border border-border'
                  }`}
                >
                  {micState === 'hearing' && (
                    <span className="absolute inset-0 rounded-full animate-ping bg-emerald-500/50" />
                  )}
                  {micState === 'ai-speaking' ? (
                    <Volume2 className="h-5 w-5" />
                  ) : micState === 'muted' ? (
                    <MicOff className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5 relative" />
                  )}
                  <span className="text-[9px] font-semibold mt-0.5 leading-tight relative">
                    {micState === 'hearing' ? 'HEARING' :
                     micState === 'listening' ? 'LIVE' :
                     micState === 'ai-speaking' ? 'AI' :
                     micState === 'processing' ? '...' :
                     micState === 'muted' ? 'MUTED' : 'TAP'}
                  </span>
                </button>

                <button
                  onClick={() => { const next = !isMuted; setMuted(next); if (next) stopListening(); else startListening(); }}
                  className={`flex-none w-9 h-9 rounded-full flex items-center justify-center transition-colors border ${
                    isMuted ? 'bg-destructive/20 text-destructive border-destructive/40' : 'bg-background text-muted-foreground border-border hover:border-primary'
                  }`}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>

                <form onSubmit={handleManualSubmit} className="flex-1 flex gap-2">
                  <Input
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    placeholder="Type reply..."
                    className="text-xs h-9 bg-background"
                  />
                  <Button type="submit" size="sm" className="h-9 px-3 shrink-0" disabled={!inputText.trim() || isProcessing}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </form>
              </div>
            )}

            {callState === 'connected' && (
              <div className={`flex-none h-6 flex items-center justify-center text-[10px] font-medium border-t transition-all ${
                micState === 'hearing'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : micState === 'listening'
                  ? 'bg-emerald-500/5 text-emerald-600/70 dark:text-emerald-400/70'
                  : micState === 'ai-speaking'
                  ? 'bg-primary/5 text-primary'
                  : 'bg-transparent text-muted-foreground'
              }`}>
                {micState === 'hearing' ? '🟢 Hearing your voice — speak now' :
                 micState === 'listening' ? '🎙️ Mic is ON — say something' :
                 micState === 'ai-speaking' ? `🔊 ${agentName} is speaking...` :
                 micState === 'processing' ? '⏳ Processing...' :
                 micState === 'muted' ? '🔇 Microphone muted' :
                 micDenied ? '⚠️ Mic blocked — use text or quick replies' :
                 '⬆️ Tap the big mic button to speak'}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  );
}
