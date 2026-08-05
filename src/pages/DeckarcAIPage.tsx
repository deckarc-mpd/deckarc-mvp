import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Radio, Activity, Cpu, Send, AlertTriangle, Volume2, Sparkles } from 'lucide-react';
import VoiceOrb from '../components/deckarcAI/VoiceOrb';
import { useAuth } from '../contexts/AuthContext';
import {
  isListeningSupported,
  isSpeakingSupported,
  startListening,
  stopListening,
  speak,
  stopSpeaking,
} from '../lib/speech';
import { processAIQuery } from '../lib/aiBrain';

export interface DeckarcAIPageProps {
  onBack: () => void;
}

export interface LogEntry {
  id: string;
  sender: 'You' | 'DECKARC AI';
  text: string;
  timestamp: string;
}

const CONTROL_NODES = [
  'Social Media',
  'Complete Task',
  'Add Task',
  'Day Plan',
  'Meeting Invites',
  'Tomorrow\'s List',
  'Sent Status',
  'Clients',
  'Appointments',
  'Email Notifications',
  'Client Messages',
  'Proposals',
  'Priority Leads',
  'Sales Pipeline',
  'Deals',
  'Daily Summary',
  'Daily Briefing',
  'Task Performance',
  'Weekly Report',
];

const TELEMETRY_ITEMS = [
  'Project Status',
  'Task Status',
  'Task Progress',
  'Team Members',
  'Task Team Status',
  'Project Tracker',
  'Impact Analysis',
  'Landing Page Dev',
  'Task Detail',
  'Task Day Planner',
  'Member Activity',
  'Who Is Available',
  'Who Is Busy',
  'Current Workload',
  'Project Timeline',
  'Sprint Summary',
  'Task Ownership',
  'Who\'s Delayed',
  'Pending Tasks',
];

export const DeckarcAIPage: React.FC<DeckarcAIPageProps> = ({ onBack }) => {
  const { profile } = useAuth();
  const [status, setStatus] = useState<'idle' | 'listening' | 'speaking'>('idle');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inputText, setInputText] = useState<string>('');
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);

  const logEndRef = useRef<HTMLDivElement | null>(null);

  // Clean up speech recognition & synthesis on unmount
  useEffect(() => {
    return () => {
      stopListening();
      stopSpeaking();
    };
  }, []);

  // Auto-scroll to newest entry in interaction log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logEntries, interimTranscript, errorMessage]);

  const handleUserMessage = async (userText: string) => {
    if (!userText.trim()) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const userMsgId = `user-${Date.now()}`;
    const aiMsgId = `ai-${Date.now()}`;

    const userEntry: LogEntry = {
      id: userMsgId,
      sender: 'You',
      text: userText,
      timestamp: timeStr,
    };

    setInterimTranscript('');
    setErrorMessage(null);

    // Process prompt via AI Brain (Project Pulse capability dispatcher)
    const replyText = await processAIQuery(userText, { profile });

    const aiEntry: LogEntry = {
      id: aiMsgId,
      sender: 'DECKARC AI',
      text: replyText,
      timestamp: timeStr,
    };

    // Update interaction log
    setLogEntries((prev) => [...prev, userEntry, aiEntry]);

    // Speak echo reply
    setStatus('speaking');
    speak(replyText, {
      onStart: () => setStatus('speaking'),
      onEnd: () => setStatus('idle'),
      onError: (err) => {
        setErrorMessage(err);
        setStatus('idle');
      },
    });
  };

  const toggleListening = () => {
    if (!isListeningSupported) {
      setErrorMessage('Speech recognition is not supported in this browser. Please use the text input below.');
      return;
    }

    if (status === 'listening') {
      stopListening();
      setStatus('idle');
      setInterimTranscript('');
      return;
    }

    if (status === 'speaking') {
      stopSpeaking();
    }

    setErrorMessage(null);
    setInterimTranscript('');
    setStatus('listening');

    const started = startListening({
      onResult: (transcript, isFinal) => {
        if (isFinal) {
          stopListening();
          setStatus('idle');
          handleUserMessage(transcript);
        } else {
          setInterimTranscript(transcript);
        }
      },
      onEnd: () => {
        setStatus((prevStatus) => (prevStatus === 'listening' ? 'idle' : prevStatus));
      },
      onError: (err) => {
        setErrorMessage(err);
        setStatus('idle');
        setInterimTranscript('');
      },
    });

    if (!started) {
      setStatus('idle');
    }
  };

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    if (status === 'listening') {
      stopListening();
    }
    if (status === 'speaking') {
      stopSpeaking();
    }

    const textToSubmit = inputText;
    setInputText('');
    handleUserMessage(textToSubmit);
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 font-sans relative overflow-x-hidden overflow-y-auto flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Background Ambient Radial Glow & Grid Pattern */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-40"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 40%, rgba(6, 182, 212, 0.15) 0%, rgba(15, 23, 42, 0) 60%)`,
        }}
      />
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-10"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(6, 182, 212, 0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(6, 182, 212, 0.1) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Top Header Bar */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-cyan-950/60 bg-slate-950/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.2)]">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-mono text-sm font-bold tracking-widest text-cyan-300 uppercase">
              DECKARC AI <span className="text-cyan-600 font-normal">v3.6</span>
            </h1>
            <p className="font-mono text-[10px] text-slate-500 tracking-wider">
              VOICE ASSISTANT — PROJECT PULSE MODE
            </p>
          </div>
        </div>

        {/* Close button top-right */}
        <button
          type="button"
          onClick={() => {
            stopListening();
            stopSpeaking();
            onBack();
          }}
          aria-label="Close DECKARC AI Console"
          className="p-2.5 rounded-full bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 hover:bg-cyan-950/50 text-slate-400 hover:text-cyan-300 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 group"
        >
          <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        {/* Responsive Layout: stacked on mobile, 3 columns on lg */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
          
          {/* Left Column: SYSTEM CONTROL NODES */}
          <section className="order-2 lg:order-1 lg:col-span-3 bg-slate-900/40 border border-slate-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 flex flex-col h-full max-h-[520px] lg:max-h-[640px] shadow-xl">
            <div className="flex items-center justify-between border-b border-cyan-950/80 pb-3 mb-3">
              <h2 className="font-mono tracking-widest text-xs uppercase text-cyan-400 font-semibold flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                SYSTEM CONTROL NODES
              </h2>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-950/60 text-cyan-300 px-2 py-0.5 text-xs font-mono">
                19 active
              </span>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {CONTROL_NODES.map((node) => (
                <button
                  key={node}
                  type="button"
                  onClick={() => handleUserMessage(node)}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2.5 transition-all duration-150 border border-transparent hover:border-cyan-500/30 hover:bg-cyan-950/40 hover:text-cyan-200 text-slate-400 group cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/70 group-hover:bg-cyan-300 group-hover:shadow-[0_0_8px_#06b6d4] transition-all flex-shrink-0" />
                  <span className="truncate">{node}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Center Column: Hero Console */}
          <section className="order-1 lg:order-2 lg:col-span-6 flex flex-col items-center justify-between bg-slate-900/30 border border-cyan-950/60 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden min-h-[580px]">
            {/* Radial glow background specifically for the orb container */}
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.12)_0%,transparent_70%)]" />

            {/* Header Titles */}
            <div className="text-center relative z-10 space-y-1">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-teal-200 to-cyan-400 font-mono drop-shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                DECKARC AI
              </h2>
              <p className="text-xs font-mono tracking-widest text-cyan-400/80 uppercase flex items-center justify-center gap-1.5">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                PROJECT PULSE VOICE CONSOLE
              </p>
            </div>

            {/* Voice Orb */}
            <div className="my-2 relative z-10 flex items-center justify-center">
              <VoiceOrb status={status} />
            </div>

            {/* Status Info Lines */}
            <div className="w-full max-w-md relative z-10 bg-slate-950/70 border border-cyan-900/40 backdrop-blur-md rounded-xl p-3 text-center text-xs font-mono space-y-1 shadow-lg">
              <div className="flex items-center justify-center gap-4 text-cyan-300/90 flex-wrap">
                <span>AGENCY LOCATION: <strong className="text-cyan-200">CLOUD</strong></span>
                <span className="text-cyan-700">|</span>
                <span>STATUS: <strong className={status === 'listening' ? 'text-cyan-400 animate-pulse' : status === 'speaking' ? 'text-teal-400 animate-pulse' : 'text-emerald-400'}>{status.toUpperCase()}</strong></span>
              </div>
              <div className="text-slate-400 text-[11px]">
                ACTIVE AGENTS: <span className="text-cyan-300 font-semibold">3 LEAD</span> | <span className="text-cyan-300 font-semibold">32 SPECIALISTS</span>
              </div>
            </div>

            {/* Tap to Speak Pill Button & Microphone support check */}
            <div className="my-3 relative z-10 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={toggleListening}
                disabled={!isListeningSupported}
                className={`px-6 py-2.5 rounded-full text-xs font-mono font-semibold tracking-wider transition-all duration-300 focus:outline-none flex items-center gap-2 ${
                  !isListeningSupported
                    ? 'bg-slate-900 border border-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                    : status === 'listening'
                    ? 'bg-cyan-500 text-slate-950 border border-cyan-300 shadow-[0_0_25px_rgba(6,182,212,0.8)] animate-pulse'
                    : status === 'speaking'
                    ? 'bg-teal-500 text-slate-950 border border-teal-300 shadow-[0_0_20px_rgba(20,184,166,0.6)]'
                    : 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/70 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                }`}
              >
                {!isListeningSupported ? (
                  <MicOff className="w-3.5 h-3.5 text-slate-500" />
                ) : status === 'speaking' ? (
                  <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                ) : (
                  <Mic className={`w-3.5 h-3.5 ${status === 'listening' ? 'animate-bounce' : ''}`} />
                )}
                {status === 'listening'
                  ? 'LISTENING...'
                  : status === 'speaking'
                  ? 'SPEAKING REPLY...'
                  : !isListeningSupported
                  ? 'MIC NOT SUPPORTED'
                  : 'Tap to Speak'}
              </button>

              {!isListeningSupported && (
                <p className="text-[11px] font-mono text-amber-400/90 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0 text-amber-400" />
                  Browser does not support SpeechRecognition. Use text input below.
                </p>
              )}
            </div>

            {/* Error Message Amber Notice */}
            {errorMessage && (
              <div className="w-full relative z-10 mb-2 bg-amber-950/40 border border-amber-500/40 rounded-xl p-2.5 text-xs font-mono text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <span className="flex-1">{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="text-amber-400 hover:text-amber-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* System Interaction Log Box */}
            <div className="w-full relative z-10 flex flex-col flex-1">
              <div className="font-mono text-[11px] text-cyan-400/80 tracking-widest uppercase mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Activity className="w-3 h-3 text-cyan-400" />
                  SYSTEM INTERACTION LOG
                </span>
                {logEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setLogEntries([])}
                    className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Clear Log
                  </button>
                )}
              </div>

              <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 text-xs font-mono text-slate-300 min-h-[140px] max-h-[220px] overflow-y-auto flex flex-col gap-2.5 shadow-inner scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                {logEntries.length === 0 && !interimTranscript && (
                  <div className="flex-1 flex items-center justify-center text-center text-slate-500">
                    <span>Tap to Speak or type a message below…</span>
                  </div>
                )}

                {logEntries.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span className={entry.sender === 'You' ? 'text-cyan-400 font-bold' : 'text-teal-300 font-bold'}>
                        {entry.sender}
                      </span>
                      <span>•</span>
                      <span>{entry.timestamp}</span>
                    </div>
                    <p className={`whitespace-pre-wrap ${entry.sender === 'You' ? 'text-cyan-100 pl-2 border-l-2 border-cyan-500/40' : 'text-teal-100 pl-2 border-l-2 border-teal-500/40'}`}>
                      {entry.text}
                    </p>
                  </div>
                ))}

                {/* Streaming Interim Recognition Text */}
                {interimTranscript && (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span className="text-cyan-400 font-bold">You (Listening...)</span>
                    </div>
                    <p className="text-slate-400 italic pl-2 border-l-2 border-cyan-500/20">
                      {interimTranscript}
                    </p>
                  </div>
                )}

                <div ref={logEndRef} />
              </div>

              {/* Text Input Fallback */}
              <form onSubmit={handleInputSubmit} className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask about Yesterday, Today, or Tomorrow..."
                  className="flex-1 bg-slate-950/90 border border-slate-800 focus:border-cyan-500/60 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="px-3.5 py-2 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/70 hover:border-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-mono text-xs flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </div>

          </section>

          {/* Right Column: TELEMETRY MONITOR */}
          <section className="order-3 lg:col-span-3 bg-slate-900/40 border border-slate-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 flex flex-col h-full max-h-[520px] lg:max-h-[640px] shadow-xl">
            <div className="flex items-center justify-between border-b border-cyan-950/80 pb-3 mb-3">
              <h2 className="font-mono tracking-widest text-xs uppercase text-cyan-400 font-semibold flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                TELEMETRY MONITOR
              </h2>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-950/60 text-cyan-300 px-2 py-0.5 text-xs font-mono">
                20 tracking
              </span>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {TELEMETRY_ITEMS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleUserMessage(item)}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2.5 transition-all duration-150 border border-transparent hover:border-cyan-500/30 hover:bg-cyan-950/40 hover:text-cyan-200 text-slate-400 group cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/70 group-hover:bg-cyan-300 group-hover:shadow-[0_0_8px_#06b6d4] transition-all flex-shrink-0" />
                  <span className="truncate">{item}</span>
                </button>
              ))}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
};

export default DeckarcAIPage;