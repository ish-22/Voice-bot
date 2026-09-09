import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Globe, Calendar, Clock, User, CheckCircle2, Languages, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const playBeep = (start = true) => {
    try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.value = start ? 800 : 400; // Higher pitch for start, lower for stop
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) { /* Ignore */ }
};

const LANGUAGES = [
    { code: 'en-US', name: 'English', greeting: 'Hello, how can I help you book an appointment today?' },
    { code: 'es-ES', name: 'Spanish (Español)', greeting: 'Hola, ¿cómo puedo ayudarle a reservar una cita hoy?' },
    { code: 'fr-FR', name: 'French (Français)', greeting: 'Bonjour, comment puis-je vous aider à prendre rendez-vous aujourd\'hui ?' },
    { code: 'de-DE', name: 'German (Deutsch)', greeting: 'Hallo, wie kann ich Ihnen heute bei der Terminbuchung helfen?' },
    { code: 'zh-CN', name: 'Chinese (中文)', greeting: '您好，今天我能帮您预约什么时间？' },
    { code: 'ja-JP', name: 'Japanese (日本語)', greeting: 'こんにちは、本日のご予約をお手伝いしましょうか？' },
    { code: 'ar-SA', name: 'Arabic (العربية)', greeting: 'مرحباً، كيف يمكنني مساعدتك في حجز موعد اليوم؟' },
    { code: 'ru-RU', name: 'Russian (Русский)', greeting: 'Здравствуйте, как я могу помочь вам записаться на прием сегодня?' },
    { code: 'hi-IN', name: 'Hindi (हिन्दी)', greeting: 'नमस्ते, आज मैं आपकी अपॉइंटमेंट बुक करने में कैसे मदद कर सकता हू؟' },
    { code: 'pt-BR', name: 'Portuguese (Português)', greeting: 'Olá, como posso ajudá-lo a marcar uma consulta hoje?' },
    { code: 'si-LK', name: 'Sinhala (සිංහල)', greeting: 'ආයුබෝවන්, අද ඔබේ හමුවීම වෙන්කරවා ගැනීමට මා උදව් කරන්නේ කෙසේද?' }
];

type Message = {
    id: string;
    sender: 'bot' | 'user';
    text: string;
    timestamp: Date;
};

export default function App() {
    const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0]);
    const [isListening, setIsListening] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [appointmentState, setAppointmentState] = useState<'IDLE' | 'COLLECTING_NAME' | 'COLLECTING_DATE' | 'COLLECTING_TIME' | 'CONFIRMED'>('IDLE');
    const [appointmentDetails, setAppointmentDetails] = useState({ name: '', date: '', time: '' });
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const synthesis = window.speechSynthesis;
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;

            recognitionRef.current.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                handleUserMessage(transcript);
                setIsListening(false);
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error("Speech recognition error", event.error);
                setIsListening(false);
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
        }
    }, []);

    useEffect(() => {
        if (recognitionRef.current) {
            recognitionRef.current.lang = selectedLanguage.code;
        }
    }, [selectedLanguage]);

    useEffect(() => {
        // Initial greeting
        if (messages.length === 0) {
            addBotMessage(selectedLanguage.greeting);
            setAppointmentState('COLLECTING_NAME');
        }
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const speak = (text: string) => {
        if (synthesis.speaking) {
            synthesis.cancel();
        }

        const voices = synthesis.getVoices();
        const voice = voices.find(v => v.lang.replace('_', '-') === selectedLanguage.code || v.lang.startsWith(selectedLanguage.code.split('-')[0]));

        if (voice) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = selectedLanguage.code;
            utterance.voice = voice;
            synthesis.speak(utterance);
        } else {
            // OS lacks the voice natively (e.g. Arabic, Sinhala on Windows). Fallback to Google TTS audio!
            const audio = new Audio(`https://translate.google.com/translate_tts?ie=UTF-8&tl=${selectedLanguage.code.split('-')[0]}&client=tw-ob&q=${encodeURIComponent(text)}`);
            audio.play().catch(() => {
                // Failsafe native fallback if audio fails
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = selectedLanguage.code;
                synthesis.speak(utterance);
            });
        }
    };

    // Fetch AI response from Vercel serverless function
    const getAIResponse = async (prompt: string): Promise<string> => {
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, language: selectedLanguage.code })
            });
            const data = await res.json();
            return data.reply ?? prompt;
        } catch (e) {
            console.error('Error fetching AI response', e);
            return prompt;
        }
    };

    const addBotMessage = (text: string) => {
        setMessages(prev => [...prev, { id: Math.random().toString(), sender: 'bot', text, timestamp: new Date() }]);
        speak(text);
    };

    const handleUserMessage = async (text: string) => {
        setMessages(prev => [...prev, { id: Math.random().toString(), sender: 'user', text, timestamp: new Date() }]);

        // Simple state machine for demo purposes
        setTimeout(async () => {
            let botPrompt = '';
            switch (appointmentState) {
                case 'COLLECTING_NAME':
                    setAppointmentDetails(prev => ({ ...prev, name: text }));
                    botPrompt = 'Thanks! What date would you like to book?';
                    setAppointmentState('COLLECTING_DATE');
                    break;
                case 'COLLECTING_DATE':
                    setAppointmentDetails(prev => ({ ...prev, date: text }));
                    botPrompt = 'Got it. What time works best for you?';
                    setAppointmentState('COLLECTING_TIME');
                    break;
                case 'COLLECTING_TIME':
                    const name = appointmentDetails.name;
                    const date = appointmentDetails.date;
                    setAppointmentDetails(prev => ({ ...prev, time: text }));
                    botPrompt = `Your appointment for ${name} on ${date} at ${text} is confirmed!`;
                    setAppointmentState('CONFIRMED');
                    break;
                default:
                    botPrompt = 'How else can I assist you?';
            }
            if (botPrompt) {
                const aiReply = await getAIResponse(botPrompt);
                addBotMessage(aiReply);
            }
        }, 500);
    };

    // Removed mock translation function – using AI for responses

    const toggleListen = () => {
        if (isListening) {
            playBeep(false);
            recognitionRef.current?.stop();
        } else {
            playBeep(true);
            if (synthesis.speaking) synthesis.cancel();
            try {
                recognitionRef.current?.start();
                setIsListening(true);
            } catch (e) {
                console.error(e);
            }
        }
    };

    const handleLanguageChange = (lang: typeof LANGUAGES[0]) => {
        setSelectedLanguage(lang);
        setMessages([]); // Reset conversation for demo purposes
        setAppointmentState('IDLE');
        setAppointmentDetails({ name: '', date: '', time: '' });
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row items-center justify-center p-4 gap-6 font-sans">

            {/* Left panel: Info & Booking State */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="w-full md:w-1/3 max-w-md bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 flex flex-col gap-8 shadow-2xl h-[600px]"
            >
                <div className="flex items-center gap-4 text-emerald-400">
                    <div className="p-3 bg-emerald-400/10 rounded-2xl">
                        <Languages className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">MedVoice</h1>
                        <p className="text-sm text-slate-400">AI Patient Appointment</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <label className="text-sm font-medium text-slate-400 uppercase tracking-wider block flex items-center gap-2">
                        <Globe className="w-4 h-4" /> Select Language
                    </label>
                    <div className="relative">
                        <select
                            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-4 appearance-none focus:ring-2 focus:ring-emerald-500 outline-none transition-all cursor-pointer"
                            value={selectedLanguage.code}
                            onChange={(e) => handleLanguageChange(LANGUAGES.find(l => l.code === e.target.value)!)}
                        >
                            {LANGUAGES.map(lang => (
                                <option key={lang.code} value={lang.code}>{lang.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex-1">
                    <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Appointment Status</h3>
                    <div className="space-y-4">
                        <StatusItem icon={<User />} label="Patient Name" value={appointmentDetails.name} active={appointmentState === 'COLLECTING_NAME'} />
                        <StatusItem icon={<Calendar />} label="Date" value={appointmentDetails.date} active={appointmentState === 'COLLECTING_DATE'} />
                        <StatusItem icon={<Clock />} label="Time" value={appointmentDetails.time} active={appointmentState === 'COLLECTING_TIME'} />
                    </div>
                </div>

                {appointmentState === 'CONFIRMED' && (
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-emerald-500/20 text-emerald-400 p-4 rounded-xl flex items-center gap-3 font-medium border border-emerald-500/30"
                    >
                        <CheckCircle2 className="w-6 h-6" />
                        Appointment Verified!
                    </motion.div>
                )}
            </motion.div>

            {/* Right panel: Voice UI */}
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="w-full md:w-2/3 max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl h-[600px] relative"
            >
                {/* Chat Top Bar */}
                <div className="flex justify-between items-center bg-slate-900/80 backdrop-blur border-b border-slate-800 p-5 px-6 z-20">
                    <div className="flex items-center gap-2">
                        {isListening ? (
                            <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1 }} className="text-emerald-400 font-medium text-sm flex items-center gap-2">
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                </span>
                                Listening...
                            </motion.div>
                        ) : (
                            <span className="text-slate-500 font-medium text-sm">Waiting for voice input...</span>
                        )}
                    </div>
                    <button
                        onClick={() => handleLanguageChange(selectedLanguage)}
                        className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-sm font-medium"
                        title="Restart Conversation"
                    >
                        <RotateCcw className="w-4 h-4" /> Restart
                    </button>
                </div>

                <div className="flex-1 p-6 overflow-y-auto space-y-6 scroll-smooth">
                    <AnimatePresence>
                        {messages.map((msg) => (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex ${msg.sender === 'bot' ? 'justify-start' : 'justify-end'}`}
                            >
                                <div className={`max-w-[80%] rounded-2xl p-4 ${msg.sender === 'bot'
                                    ? 'bg-slate-800 text-slate-100 rounded-tl-sm'
                                    : 'bg-emerald-600 text-white rounded-tr-sm shadow-lg shadow-emerald-900/20'
                                    }`}>
                                    <p className="text-lg leading-relaxed">{msg.text}</p>
                                    <span className="text-xs opacity-50 block mt-2">
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-8 bg-slate-900 border-t border-slate-800 flex justify-center items-center relative z-10 relative">
                    {/* Animated rings for listening state */}
                    {isListening && (
                        <motion.div
                            animate={{ scale: [1, 1.5, 2], opacity: [0.5, 0.2, 0] }}
                            transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                            className="absolute w-24 h-24 bg-emerald-500 rounded-full z-0"
                        />
                    )}

                    <button
                        onClick={toggleListen}
                        className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl ${isListening
                            ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20 text-white'
                            : 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20 text-slate-900'
                            }`}
                    >
                        {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-10 h-10" />}
                    </button>
                </div>
            </motion.div>

        </div>
    );
}

function StatusItem({ icon, label, value, active }: { icon: React.ReactNode, label: string, value: string, active: boolean }) {
    return (
        <div className={`p-4 rounded-xl border flex items-center gap-4 transition-all ${active ? 'bg-slate-800 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-slate-800/50 border-slate-800'
            }`}>
            <div className={`${active ? 'text-emerald-400' : 'text-slate-500'}`}>
                {icon}
            </div>
            <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</p>
                <p className="text-slate-200 font-medium mt-1 truncate">{value || '---'}</p>
            </div>
        </div>
    );
}
