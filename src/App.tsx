import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, PhoneOff, Phone, Lock } from 'lucide-react';
import VapiPkg from '@vapi-ai/web';
import { VoiceVisualizer } from './components/VoiceVisualizer';
import './index.css';

// Handle CommonJS / ESM interop in Vite
const Vapi = (VapiPkg as any).default || VapiPkg;

// Initialize Vapi outside the component so it doesn't recreate on re-renders
const vapi = new Vapi(import.meta.env.VITE_VAPI_PUBLIC_KEY || '');

function App() {
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [callStatus, setCallStatus] = useState<'connected' | 'ended' | 'connecting'>('ended');
  const [seconds, setSeconds] = useState(0);
  const [activeTranscript, setActiveTranscript] = useState<{ role: string, text: string } | null>(null);
  const [assistantVolume, setAssistantVolume] = useState(0);
  const [userVolume, setUserVolume] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live timer logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (callStatus === 'connected') {
      interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callStatus]);

  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const onCallStart = () => {
      setCallStatus('connected');
      setIsSpeaking(false);
      setAssistantVolume(0);
      setUserVolume(0);
    };

    const onCallEnd = () => {
      setCallStatus('ended');
      setIsSpeaking(false);
      setAssistantVolume(0);
      setUserVolume(0);
    };

    const onSpeechStart = () => setIsSpeaking(true);
    const onSpeechEnd = () => setIsSpeaking(false);
    const onError = (error: any) => {
      console.error("Vapi Error:", error);
      setCallStatus('ended');
      setAssistantVolume(0);
      setUserVolume(0);
      setErrorMessage("Connection error: " + (error?.message || error?.error?.message || "Failed to establish call. Please try again."));
    };
    const onVolumeLevel = (volume: number) => {
      setAssistantVolume(volume);
    };
    const onMessage = (message: any) => {
      if (message.type === 'transcript' && message.transcript) {
        setActiveTranscript({
          role: message.role === 'user' ? 'You' : 'Alex',
          text: message.transcript
        });
      }
    };

    vapi.on('call-start', onCallStart);
    vapi.on('call-end', onCallEnd);
    vapi.on('speech-start', onSpeechStart);
    vapi.on('speech-end', onSpeechEnd);
    vapi.on('volume-level', onVolumeLevel);
    vapi.on('error', onError);
    vapi.on('message', onMessage);

    // Cleanup
    return () => {
      vapi.removeAllListeners('call-start');
      vapi.removeAllListeners('call-end');
      vapi.removeAllListeners('speech-start');
      vapi.removeAllListeners('speech-end');
      vapi.removeAllListeners('volume-level');
      vapi.removeAllListeners('error');
      vapi.removeAllListeners('message');
    };
  }, []);

  // User voice analysis setup
  useEffect(() => {
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let animationFrameId: number;
    let intervalId: any;

    const startLocalAudioAnalysis = (track: MediaStreamTrack) => {
      try {
        if (audioContext) {
          audioContext.close();
        }
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContext = new AudioContextClass();
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;

        const stream = new MediaStream([track]);
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const checkVolume = () => {
          if (!analyser) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          // Normalize to 0 - 1 range
          const normVolume = Math.min(1, average / 80);
          setUserVolume(normVolume);

          animationFrameId = requestAnimationFrame(checkVolume);
        };

        checkVolume();
      } catch (err) {
        console.error("Error setting up local audio analysis:", err);
      }
    };

    const stopLocalAudioAnalysis = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (source) {
        source.disconnect();
        source = null;
      }
      if (analyser) {
        analyser.disconnect();
        analyser = null;
      }
      if (audioContext) {
        audioContext.close();
        audioContext = null;
      }
      setUserVolume(0);
    };

    if (callStatus === 'connected') {
      intervalId = setInterval(() => {
        const callObj = vapi.getDailyCallObject();
        const localAudioTrack = callObj?.participants()?.local?.tracks?.audio?.track;
        if (localAudioTrack) {
          startLocalAudioAnalysis(localAudioTrack);
          clearInterval(intervalId);
        }
      }, 500);
    } else {
      stopLocalAudioAnalysis();
    }

    return () => {
      clearInterval(intervalId);
      stopLocalAudioAnalysis();
    };
  }, [callStatus]);

  const toggleMute = () => {
    const newMutedState = !isMuted;
    vapi.setMuted(newMutedState);
    setIsMuted(newMutedState);
  };

  const endCall = () => {
    vapi.stop();
    setCallStatus('ended');
    setAssistantVolume(0);
    setUserVolume(0);
  };

  const startCall = async () => {
    if (!import.meta.env.VITE_VAPI_PUBLIC_KEY || import.meta.env.VITE_VAPI_PUBLIC_KEY === 'your_vapi_public_key_here') {
      setErrorMessage("Please configure your VITE_VAPI_PUBLIC_KEY in the .env file.");
      return;
    }

    setCallStatus('connecting');
    setSeconds(0);
    setIsMuted(false);

    try {
      await vapi.start({
        name: "Alex",
        firstMessage: "Hey! I'm Alex. Ask me anything you'd like to know, and I'll help you out!",
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          temperature: 0.4,
          messages: [
            {
              role: "system",
              content: `You are Alex, a highly capable, multilingual, and friendly general-purpose voice assistant.

## Capabilities & Scope
- You can answer ANY question asked by the user, about any topic in the world (general knowledge, coding, writing, lifestyle, science, history, calculations, advice, etc.).
- Be as helpful, informative, and engaging as possible.
- Provide direct, concise, and structured answers suitable for voice conversations.

## Personality
- Friendly, casual, encouraging, and highly professional.
- Energetic in a positive, human-like way.
- Use short, clear sentences appropriate for voice.
- Speak in a natural, conversational, and friendly manner.

## Language Guidelines
- Detect the user's language and respond in that language.
- If the user asks a question in Urdu (or speaks Urdu), you MUST respond in Urdu.
- If you are unsure about the language they are speaking, politely ask for clarification.`
            }
          ]
        },
        voice: {
          provider: "11labs",
          voiceId: "bIHbv24MWmeRgasZH58o", // This is the actual ElevenLabs ID for 'Elliot'
          speed: 0.8
        }
      });
      // Fallback: forcefully update status when start() promise resolves
      setCallStatus('connected');
    } catch (err: any) {
      console.error("Failed to start call:", err);
      setCallStatus('ended');
      setErrorMessage("Failed to connect. Check developer console for details.");
    }
  };

  return (
    <div className="app-container">
      {/* Ambient Animated Background */}
      <div className="ambient-bg">
        <div className="ambient-blob blob-1"></div>
        <div className="ambient-blob blob-2"></div>
      </div>

      {/* Modern Top-Floating Error Toast */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="error-banner"
            onClick={() => setErrorMessage(null)}
          >
            {errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {callStatus === 'connected' || callStatus === 'connecting' ? (
          <motion.div
            key="active-call"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
            className="active-call-layout"
          >
            {/* Top Security Badge */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="security-badge"
            >
              <div className="dot"></div>
              End-to-end encrypted
              <Lock size={12} />
            </motion.div>

            {/* Center Visualizer */}
            <div className="center-visual">
              <VoiceVisualizer
                assistantVolume={assistantVolume}
                userVolume={userVolume}
                callStatus={callStatus}
              />

              <motion.div
                className="caller-info"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <h1 className="caller-name">
                  {callStatus === 'connecting'
                    ? 'Connecting...'
                    : (isSpeaking ? 'Alex is speaking...' : (userVolume > 0.05 ? 'Listening...' : 'ALEX'))}
                </h1>
                <div className="timer">{formatTime(seconds)}</div>
              </motion.div>
            </div>

            {/* Live Transcription Box */}
            <AnimatePresence>
              {activeTranscript && activeTranscript.text && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="transcript-box"
                >
                  <div className="transcript-role" style={{ color: activeTranscript.role === 'You' ? 'var(--secondary-accent)' : 'var(--primary-accent)' }}>
                    {activeTranscript.role}
                  </div>
                  <div className="transcript-text">
                    "{activeTranscript.text}"
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bottom Controls */}
            <motion.div
              className="control-dock glass-surface"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <button
                className={`dock-btn ${isMuted ? 'muted' : ''}`}
                onClick={toggleMute}
                title={isMuted ? "Unmute" : "Mute"}
                disabled={callStatus === 'connecting'}
              >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>

              <button
                className="dock-btn danger"
                onClick={endCall}
                title="End Call"
              >
                <PhoneOff size={24} />
              </button>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="ended-call"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="end-call-container glass-surface"
          >
            <div className="icon-wrapper">
              <PhoneOff size={40} color="var(--text-muted)" strokeWidth={1.5} />
            </div>

            <h1 className="title-text">Call Ended</h1>
            <p className="subtitle-text">Duration: {formatTime(seconds)}</p>

            <button
              className="action-btn"
              onClick={startCall}
            >
              <Phone size={20} strokeWidth={2} />
              Call Again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
