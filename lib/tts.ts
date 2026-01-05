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
    const speakDelay = isMobile ? 200 : (window.speechSynthesis.pending ? 100 : 0);
    
    setTimeout(() => {
      if (!resolved) {
        try {
          window.speechSynthesis.speak(utterance);
          
          // Mobile browsers: Verify speech actually started
          // Sometimes speak() returns without actually starting on mobile
          let speechStarted = false;
          const startCheckInterval = setInterval(() => {
            if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
              speechStarted = true;
              clearInterval(startCheckInterval);
            }
          }, 50);
          
          // If speech hasn't started after 500ms on mobile, try again
          setTimeout(() => {
            clearInterval(startCheckInterval);
            if (!speechStarted && isMobile && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
              // Try speaking again - mobile browsers sometimes need a retry
              try {
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
                console.log('Retried speech synthesis for mobile browser');
              } catch (retryError) {
                console.error('Retry failed:', retryError);
              }
            }
          }, 500);
          
          // iOS/Android workaround: Sometimes onend doesn't fire even when speech completes
          // Check periodically if speech has stopped (but not due to error)
          // This is a fallback for when onend doesn't fire
          let lastSpeakingState = false;
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
            // If speech was speaking but now stopped, and we haven't resolved, resolve now
            if (lastSpeakingState && !isSpeaking) {
              cleanup();
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
          
          // Clear the check interval when timeout fires
          setTimeout(() => {
            clearInterval(checkInterval);
            clearInterval(startCheckInterval);
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

