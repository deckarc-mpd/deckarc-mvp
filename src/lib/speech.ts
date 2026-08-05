// Web Speech API Minimal Typings for TypeScript compatibility
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

// Feature Detection Flags
export const isListeningSupported =
  typeof window !== 'undefined' &&
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

export const isSpeakingSupported =
  typeof window !== 'undefined' && 'speechSynthesis' in window;

let currentRecognition: SpeechRecognitionInstance | null = null;

export interface StartListeningOptions {
  onResult: (transcript: string, isFinal: boolean) => void;
  onEnd?: () => void;
  onError?: (errorMessage: string) => void;
  lang?: string;
  continuous?: boolean;
}

export interface SpeakOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (errorMessage: string) => void;
  lang?: string;
  rate?: number;
  pitch?: number;
}

/**
  Map standard speech recognition error codes to plain-English messages
 */
function mapRecognitionError(error: string): string {
  switch (error) {
    case 'no-speech':
      return 'No speech was detected. Please try speaking again.';
    case 'audio-capture':
      return 'No microphone was found or microphone failed to record.';
    case 'not-allowed':
      return 'Microphone access was denied. Please allow microphone permissions in your browser.';
    case 'network':
      return 'Network error occurred during speech recognition.';
    case 'aborted':
      return 'Speech recognition was stopped.';
    default:
      return `Speech recognition error: ${error}`;
  }
}

/**
 * Start listening for voice input via Web Speech API
 */
export function startListening({
  onResult,
  onEnd,
  onError,
  lang = 'en-US',
  continuous = false,
}: StartListeningOptions): boolean {
  if (!isListeningSupported) {
    const errorMsg = 'Speech recognition is not supported in this browser.';
    if (onError) onError(errorMsg);
    return false;
  }

  // Ensure only one active session at a time
  stopListening();

  try {
    const windowWithSpeech = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };

    const SpeechRecognitionClass =
      windowWithSpeech.SpeechRecognition ||
      windowWithSpeech.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      if (onError) onError('Speech recognition API constructor not found.');
      return false;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalTranscript.trim()) {
        onResult(finalTranscript.trim(), true);
      } else if (interimTranscript.trim()) {
        onResult(interimTranscript.trim(), false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const plainMessage = mapRecognitionError(event.error);
      if (onError) onError(plainMessage);
    };

    recognition.onend = () => {
      currentRecognition = null;
      if (onEnd) onEnd();
    };

    currentRecognition = recognition;
    recognition.start();
    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Failed to start speech recognition.';
    if (onError) onError(errMsg);
    return false;
  }
}

/**
 * Stop any active speech recognition session
 */
export function stopListening(): void {
  if (currentRecognition) {
    try {
      currentRecognition.stop();
    } catch {
      // Ignore if already stopped
    }
    currentRecognition = null;
  }
}

/**
 * Speak text out loud using browser text-to-speech (speechSynthesis)
 */
export function speak(
  text: string,
  { onStart, onEnd, onError, lang = 'en-US', rate = 1.0, pitch = 1.0 }: SpeakOptions = {}
): void {
  if (!isSpeakingSupported) {
    if (onError) onError('Text-to-speech is not supported in this browser.');
    return;
  }

  // Cancel any in-progress speech first
  stopSpeaking();

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = pitch;

    if (onStart) utterance.onstart = () => onStart();
    if (onEnd) utterance.onend = () => onEnd();
    if (onError) {
      utterance.onerror = (e) => onError(`Text-to-speech error: ${e.error}`);
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to initialize speech synthesis.';
    if (onError) onError(msg);
  }
}

/**
 * Stop/cancel any ongoing speech synthesis
 */
export function stopSpeaking(): void {
  if (isSpeakingSupported) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore errors
    }
  }
}
