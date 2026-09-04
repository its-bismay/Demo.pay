import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, PhoneCall, Mic, MicOff, Volume2, Sparkles, CheckCircle2, Clock, MessageSquare, Send, ShieldCheck } from 'lucide-react';
import { useVoiceCallStore, useLiveFeedStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

// Web Audio synthesizer for phone ringtone
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

      const playToneBurst = () => {
        if (!this.ctx || this.ctx.state === 'closed') return;
        const now = this.ctx.currentTime;

        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, now); // US/India PBX tone
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
        gain.gain.setValueAtTime(0.15, now + 1.8);
        gain.gain.linearRampToValueAtTime(0, now + 2.0);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 2.0);
        osc2.stop(now + 2.0);

        this.activeNodes.push(osc1, osc2, gain);
      };

      playToneBurst();
      this.intervalId = setInterval(playToneBurst, 4000);
    } catch (e) {
      console.warn('Web Audio ringtone unavailable:', e);
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.activeNodes.length) {
      this.activeNodes.forEach(node => {
        try { node.disconnect(); } catch (e) {}
      });
      this.activeNodes = [];
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      try { this.ctx.close(); } catch (e) {}
      this.ctx = null;
    }
  }
}

export function VoiceCallModal() {
  const {
    isOpen,
    callState,
    isMuted,
    isSpeaking,
    isListening,
    callData,
    transcript,
    promiseResult,
    acceptCall,
    declineCall,
    endCall,
    closeModal,
    addTranscript,
    setMuted,
    setSpeaking,
    setListening,
    setPromiseResult,
  } = useVoiceCallStore();

  const addEvent = useLiveFeedStore(state => state.addEvent);
  const updateKpis = useLiveFeedStore(state => state.updateKpis);

  const [callDuration, setCallDuration] = useState(0);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const ringtoneRef = useRef(null);
  const recognitionRef = useRef(null);
  const transcriptEndRef = useRef(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript]);

  // Handle ringtone audio
  useEffect(() => {
    if (isOpen && callState === 'ringing') {
      ringtoneRef.current = new RingtonePlayer();
      ringtoneRef.current.start();
    } else {
      if (ringtoneRef.current) {
        ringtoneRef.current.stop();
        ringtoneRef.current = null;
      }
    }

    return () => {
      if (ringtoneRef.current) {
        ringtoneRef.current.stop();
        ringtoneRef.current = null;
      }
    };
  }, [isOpen, callState]);

  // Handle call timer
  useEffect(() => {
    let timer;
    if (callState === 'connected') {
      timer = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [callState]);

  const audioRef = useRef(null);

  const speakText = async (text) => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch (e) {}
      audioRef.current = null;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setSpeaking(true);

    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
      const ttsRes = await fetch(`${baseUrl}/api/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceType: callData?.voiceType || 'ritu',
          languageMode: callData?.languageMode || 'Hinglish',
        }),
      });

      if (ttsRes.ok && ttsRes.headers.get('content-type')?.includes('audio')) {
        const blob = await ttsRes.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          startListening();
        };

        audio.onerror = () => {
          setSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          startListening();
        };

        await audio.play();
        return;
      }
    } catch (err) {}

    if (!('speechSynthesis' in window)) {
      setSpeaking(false);
      startListening();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const inVoice =
      voices.find(
        (v) =>
          v.lang.includes('IN') ||
          v.lang.includes('hi') ||
          v.name.includes('India') ||
          v.name.includes('Aditi')
      ) || voices.find((v) => v.lang.startsWith('en'));

    if (inVoice) utterance.voice = inVoice;

    utterance.onend = () => {
      setSpeaking(false);
      startListening();
    };

    utterance.onerror = () => {
      setSpeaking(false);
      startListening();
    };

    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    if (isMuted || callState !== 'connected') return;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const rec = new SpeechRec();
      rec.lang = 'en-IN';
      rec.continuous = false;
      rec.interimResults = false;

      rec.onstart = () => {
        setListening(true);
      };

      rec.onresult = (event) => {
        setListening(false);
        const speech = event.results[0][0].transcript;
        if (speech && speech.trim()) {
          handleUserReply(speech.trim());
        }
      };

      rec.onerror = () => {
        setListening(false);
      };

      rec.onend = () => {
        setListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (e) {
      setListening(false);
    }
  };

  useEffect(() => {
    if (callState === 'connected' && callData) {
      const greeting = callData.script || `Namaste ${callData.customerName || 'Customer'}! Main Demo.pay recovery desk se Aditi baat kar rahi hoon. Maine dekha aapka ₹${callData.amountInRs || '2,499'} ka payment fail ho gaya tha. Humne aapke liye ek special 10% discount activate kiya hai. Kya aap abhi complete karna chahenge ya kal schedule karein?`;
      addTranscript('agent', greeting);
      setTimeout(() => speakText(greeting), 400);
    }

    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch (e) {}
        audioRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
    };
  }, [callState]);

  // Send speech to backend persuasion agent
  const handleUserReply = async (userText) => {
    if (!userText || !userText.trim()) return;
    addTranscript('user', userText);
    setIsProcessing(true);

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
        }),
      });

      const data = await res.json();
      setIsProcessing(false);

      if (data.success && data.aiReply) {
        addTranscript('agent', data.aiReply);
        speakText(data.aiReply);

        if (data.promiseRecorded) {
          const hours = data.hoursAhead || 24;
          const label = hours === 24 ? 'Tomorrow (+24h)' : hours === 48 ? 'Monday (+48h)' : 'Later today (+6h)';
          setPromiseResult({
            isPromise: true,
            hoursAhead: hours,
            label,
          });

          addEvent({
            id: Date.now().toString(),
            type: 'promise_created',
            message: `Voice Agent secured promise to pay from ${callData?.customerName || 'customer'} (${label}).`,
          });

          updateKpis({ activeInterventions: 1 });

          // Auto-end call gracefully after sign-off
          setTimeout(() => {
            endCall();
          }, 4500);
        }
      }
    } catch (err) {
      console.warn('Voice interaction error:', err);
      setIsProcessing(false);
      const fallbackReply = 'Maine aapka request note kar liya hai aur discount link aapke phone par bhej diya hai. Thank you!';
      addTranscript('agent', fallbackReply);
      speakText(fallbackReply);
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
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
        {/* Ringing Screen */}
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
                Autonomous Voice Concierge: Aditi
              </p>
            </div>

            {/* Pulsing Avatar */}
            <div className="relative flex items-center justify-center my-6">
              <div className="absolute w-24 h-24 rounded-full bg-primary/20 animate-ping opacity-75" />
              <div className="absolute w-28 h-28 rounded-full bg-primary/10 animate-pulse" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-primary to-primary/60 flex items-center justify-center shadow-lg border-2 border-background">
                <PhoneCall className="h-9 w-9 text-primary-foreground animate-bounce" />
              </div>
            </div>

            {/* Order details */}
            <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1 border">
              <div className="flex justify-between text-muted-foreground">
                <span>Order Item</span>
                <span className="font-semibold text-foreground">{callData?.productName || 'Cart Items'}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Amount</span>
                <span className="font-semibold text-foreground">₹{(callData?.amountInRs || 2499).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-emerald-500 font-medium">
                <span>Special Offer</span>
                <span>{callData?.discountPct || 10}% Off Activated</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-center gap-6 pt-2">
              <div className="flex flex-col items-center gap-1">
                <Button
                  size="icon"
                  variant="destructive"
                  className="h-14 w-14 rounded-full shadow-lg hover:scale-105 transition-transform"
                  onClick={declineCall}
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
                <span className="text-xs text-muted-foreground">Decline</span>
              </div>

              <div className="flex flex-col items-center gap-1">
                <Button
                  size="icon"
                  className="h-14 w-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:scale-105 transition-transform animate-pulse"
                  onClick={acceptCall}
                >
                  <Phone className="h-6 w-6" />
                </Button>
                <span className="text-xs font-semibold text-foreground">Accept Call</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Connected In-Call Screen */}
        {(callState === 'connected' || callState === 'ended') && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                    A
                  </div>
                  {isSpeaking && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card animate-pulse" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm">Aditi (Demo.pay AI)</h4>
                    <Badge variant="outline" className="text-[10px] text-primary border-primary/30">Hinglish</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{formatSeconds(callDuration)}</span>
                    <span>•</span>
                    <span className="text-emerald-500 font-medium">
                      {callState === 'ended' ? 'Call Ended' : isSpeaking ? 'Speaking...' : isListening ? 'Listening to you...' : 'Connected'}
                    </span>
                  </div>
                </div>
              </div>

              {/* End Call Button */}
              {callState === 'connected' ? (
                <Button
                  size="sm"
                  variant="destructive"
                  className="rounded-full px-4 h-9 gap-1 shadow"
                  onClick={endCall}
                >
                  <PhoneOff className="h-4 w-4" />
                  <span className="text-xs font-medium">End</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-full px-4 h-9 text-xs"
                  onClick={closeModal}
                >
                  Close
                </Button>
              )}
            </div>

            {/* Audio Waveform Equalizer */}
            <div className="px-6 py-3 bg-muted/10 border-b flex items-center justify-center gap-1.5 h-12">
              {[...Array(20)].map((_, i) => {
                const active = isSpeaking || isListening;
                return (
                  <motion.div
                    key={i}
                    className={`w-1 rounded-full ${isSpeaking ? 'bg-primary' : isListening ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
                    animate={{
                      height: active
                        ? [6, Math.max(8, ((i * 7) % 28) + 8), 6]
                        : 6,
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.5 + (i % 5) * 0.1,
                      ease: 'easeInOut',
                    }}
                  />
                );
              })}
            </div>

            {/* Promise Confirmed Banner */}
            {promiseResult && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-emerald-500/10 border-b border-emerald-500/30 px-4 py-2 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="font-semibold">Promise to Pay Recorded:</span>
                <span>Scheduled for {promiseResult.label}. Status updated in Admin Dashboard!</span>
              </motion.div>
            )}

            {/* Conversation Transcript */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-[220px] max-h-[360px] bg-background">
              {transcript.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-sm ${
                      msg.sender === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-none'
                        : 'bg-muted/80 text-foreground border rounded-tl-none'
                    }`}
                  >
                    <p className="leading-relaxed">{msg.text}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 px-1">
                    {msg.sender === 'user' ? 'You' : 'Aditi'} • {msg.time}
                  </span>
                </motion.div>
              ))}

              {isProcessing && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground italic px-2">
                  <Sparkles className="h-3 w-3 animate-spin text-primary" />
                  <span>Aditi is thinking...</span>
                </div>
              )}

              <div ref={transcriptEndRef} />
            </div>

            {/* Quick-Response Chips (Convenient 1-Tap Voice Replies) */}
            {callState === 'connected' && !promiseResult && (
              <div className="p-3 bg-muted/20 border-t space-y-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1 font-medium">
                    <MessageSquare className="h-3 w-3 text-primary" />
                    Quick voice replies:
                  </span>
                  <span className="text-[10px]">Tap or speak into mic</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 rounded-full bg-background/80 hover:border-primary"
                    onClick={() => handleUserReply('Main kal payment karunga')}
                  >
                    📅 Kal karunga (Tomorrow)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 rounded-full bg-background/80 hover:border-primary"
                    onClick={() => handleUserReply('Shaam ko reminder bhej dena')}
                  >
                    ⏰ Shaam ko remind karna
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 rounded-full bg-background/80 hover:border-primary"
                    onClick={() => handleUserReply('10% discount apply kar do')}
                  >
                    🎁 10% discount apply karo
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 rounded-full bg-background/80 hover:border-primary"
                    onClick={() => handleUserReply('Payment fail kyu hui thi?')}
                  >
                    ❓ Payment fail kyu hui?
                  </Button>
                </div>
              </div>
            )}

            {/* Call Controls & Input Bar */}
            {callState === 'connected' && (
              <div className="p-3 border-t bg-muted/40 flex items-center gap-2">
                <Button
                  size="icon"
                  variant={isMuted ? 'destructive' : 'secondary'}
                  className="h-9 w-9 rounded-full shrink-0"
                  onClick={() => {
                    const next = !isMuted;
                    setMuted(next);
                    if (!next) startListening();
                  }}
                  title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-primary" />}
                </Button>

                <form onSubmit={handleManualSubmit} className="flex-1 flex gap-2">
                  <Input
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Reply or speak into mic..."
                    className="text-xs h-9 bg-background"
                  />
                  <Button type="submit" size="sm" className="h-9 px-3 shrink-0" disabled={!inputText.trim() || isProcessing}>
                    <Send className="h-3.5 w-3.5" />
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
