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
    
    // On mobile browsers, some language codes might not be supported
    // Try alternative codes if the primary one fails
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    let languageCode = options.language;
    
    // For Chinese on mobile, try alternative language codes
    if (isMobile && options.language === 'zh-CN') {
      // Some mobile browsers support 'zh' or 'zh-CN' differently
      // We'll try zh-CN first, but have fallback logic
      languageCode = 'zh-CN';
    }
    
    utterance.lang = languageCode;
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
    // Detect mobile browser (especially Android/Samsung)
    const isAndroid = /Android/i.test(navigator.userAgent);
    const speakDelay = isMobile ? 400 : (window.speechSynthesis.pending ? 100 : 0);
    
    setTimeout(() => {
      if (!resolved) {
        try {
          window.speechSynthesis.speak(utterance);
          
          // Mobile browsers (especially Android): Verify speech actually started
          // On Android, speech might silently fail if not triggered from user gesture
          // This is especially common with Chinese (zh-CN) language
          let speechStarted = false;
          let startTime = Date.now();
          let lastSpeakingState = false;
          let retryAttempted = false;
          
          // Check if speech started (especially important for mobile and Chinese)
          const startCheckInterval = setInterval(() => {
            const isSpeaking = window.speechSynthesis.speaking || window.speechSynthesis.pending;
            
            if (isSpeaking && !speechStarted) {
              speechStarted = true;
              lastSpeakingState = true;
              clearInterval(startCheckInterval);
            }
          }, 50);
          
          // On mobile, check if speech started after a delay
          // If not, it might have failed silently (common with Chinese on Android)
          setTimeout(() => {
            clearInterval(startCheckInterval);
            
            // On Android, if speech didn't start after 1 second, try alternative language code
            // This is especially important for Chinese which might not be supported as zh-CN
            if (isAndroid && !speechStarted && !resolved && !window.speechSynthesis.speaking && !window.speechSynthesis.pending && !retryAttempted) {
              retryAttempted = true;
              console.warn(`Speech may not have started on Android for ${options.language}, attempting retry with alternative...`);
              try {
                window.speechSynthesis.cancel();
                
                // For Chinese, try alternative language codes
                let retryLanguageCode = languageCode;
                if (options.language === 'zh-CN') {
                  // Try 'zh' as alternative (some Android browsers support this better)
                  retryLanguageCode = 'zh';
                }
                
                // Create fresh utterance for retry with alternative language code
                const retryUtterance = new SpeechSynthesisUtterance(text);
                retryUtterance.lang = retryLanguageCode;
                retryUtterance.pitch = options.pitch ?? 1;
                retryUtterance.rate = options.rate ?? 1;
                retryUtterance.volume = options.volume ?? 1;
                retryUtterance.onend = utterance.onend;
                retryUtterance.onerror = utterance.onerror;
                
                setTimeout(() => {
                  if (!resolved) {
                    window.speechSynthesis.speak(retryUtterance);
                    console.log(`Retrying with language code: ${retryLanguageCode}`);
                  }
                }, 200);
              } catch (retryError) {
                console.error('Retry failed:', retryError);
                // If retry fails, reject the promise so the UI can handle it
                cleanup();
                reject(new Error(`Speech synthesis failed for ${options.language} on Android`));
              }
            }
          }, isMobile ? 1000 : 0);
          
          // iOS/Android workaround: Sometimes onend doesn't fire even when speech completes
          // Check periodically if speech has stopped (but not due to error)
          // This is a fallback for when onend doesn't fire
          const checkInterval = setInterval(() => {
            if (resolved) {
              clearInterval(checkInterval);
              return;
            }
            
            const isSpeaking = window.speechSynthesis.speaking || window.speechSynthesis.pending;
            
            // Track when speech actually starts
            if (!lastSpeakingState && isSpeaking) {
              lastSpeakingState = true;
              speechStarted = true;
            }
            
            // Only resolve if speech was speaking and now stopped
            // On mobile, ensure at least 500ms has passed since start to prevent premature resolution
            const timeSinceStart = Date.now() - startTime;
            if (lastSpeakingState && !isSpeaking) {
              // Make sure enough time has passed (especially on mobile)
              // Also ensure speech actually started (for mobile browsers that might fail silently)
              if ((!isMobile || timeSinceStart >= 500) && speechStarted) {
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

