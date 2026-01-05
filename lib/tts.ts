/**
 * Text-to-Speech utilities using Web Speech API
 */

export type Language = 'en-US' | 'zh-CN';

interface TTSOptions {
  language: Language;
  pitch?: number;
  rate?: number;
  volume?: number;
}

/**
 * Speak text using Web Speech API
 */
export function speakText(
  text: string,
  options: TTSOptions
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      reject(new Error('Speech synthesis not supported'));
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.language;
    utterance.pitch = options.pitch ?? 1;
    utterance.rate = options.rate ?? 1;
    utterance.volume = options.volume ?? 1;

    // Set up timeout to prevent hanging (especially on iOS)
    // Use a longer timeout for longer text (roughly 1 second per 10 characters, minimum 5 seconds)
    const timeoutMs = Math.max(5000, Math.min(text.length * 100, 30000));
    const timeoutId = setTimeout(() => {
      window.speechSynthesis.cancel();
      reject(new Error(`Speech synthesis timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    let resolved = false;
    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
      }
    };

    utterance.onend = () => {
      cleanup();
      resolve();
    };

    utterance.onerror = (error) => {
      cleanup();
      // On iOS, sometimes onerror fires even when speech completes
      // Check if speech is actually still speaking before rejecting
      if (window.speechSynthesis.speaking) {
        reject(error);
      } else {
        // Speech might have completed despite error event
        resolve();
      }
    };

    // For iOS/Android: ensure we're ready before speaking
    // Mobile browsers need a longer delay after canceling previous speech
    // Detect mobile browser
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const speakDelay = isMobile ? 300 : (window.speechSynthesis.pending ? 100 : 0);
    
    setTimeout(() => {
      if (!resolved) {
        try {
          window.speechSynthesis.speak(utterance);
          
          // iOS/Android workaround: Sometimes onend doesn't fire even when speech completes
          // Check periodically if speech has stopped (but not due to error)
          // This is a fallback for when onend doesn't fire
          let lastSpeakingState = false;
          let startTime = Date.now();
          
          const checkInterval = setInterval(() => {
            if (resolved) {
              clearInterval(checkInterval);
              return;
            }
            
            const isSpeaking = window.speechSynthesis.speaking || window.speechSynthesis.pending;
            
            // Track when speech actually starts
            if (!lastSpeakingState && isSpeaking) {
              lastSpeakingState = true;
            }
            
            // Only resolve if speech was speaking and now stopped
            // On mobile, ensure at least 500ms has passed since start to prevent premature resolution
            const timeSinceStart = Date.now() - startTime;
            if (lastSpeakingState && !isSpeaking) {
              // Make sure enough time has passed (especially on mobile)
              if (!isMobile || timeSinceStart >= 500) {
                cleanup();
                clearInterval(checkInterval);
                resolve();
              }
            }
          }, 100);
          
          // Clear the check interval when timeout fires
          setTimeout(() => {
            clearInterval(checkInterval);
          }, timeoutMs);
        } catch (speakError) {
          cleanup();
          reject(new Error(`Failed to start speech: ${speakError}`));
        }
      }
    }, speakDelay);
  });
}

/**
 * Stop any ongoing speech
 */
export function stopSpeech(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Check if speech synthesis is available
 */
export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

