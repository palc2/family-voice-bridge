'use client';

import { useState, useEffect, useRef } from 'react';
import { createAudioRecorder, cleanupRecorder } from '@/lib/audio-recorder';
import { speakText, stopSpeech } from '@/lib/tts';
// MediaRecorder is a browser API, no need to import types

type SessionState =
  | 'idle'
  | 'recording-mom'
  | 'processing-mom'
  | 'playing-english'
  | 'waiting-for-respond'
  | 'recording-partner'
  | 'processing-partner'
  | 'playing-chinese'
  | 'waiting-for-mom-respond'
  | 'waiting-to-complete-after-partner'
  | 'waiting-to-complete-after-mom'
  | 'recording-mom-response'
  | 'processing-mom-response'
  | 'completed';

interface SessionRecorderProps {
  householdId: string;
  initiatedByUserId: string;
  onSessionComplete?: () => void;
}

export default function SessionRecorder({
  householdId,
  initiatedByUserId,
  onSessionComplete,
}: SessionRecorderProps) {
  const [state, setState] = useState<SessionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cachedEnglishTranslation, setCachedEnglishTranslation] = useState<string | null>(null);
  const [cachedChineseTranslation, setCachedChineseTranslation] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const countdownRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recorderRef.current) {
        cleanupRecorder(recorderRef.current);
      }
      stopSpeech();
      if (countdownRef.current) {
        clearTimeout(countdownRef.current);
      }
    };
  }, []);

  const startSession = async () => {
    try {
      setError(null);
      
      console.log('Starting session with:', { householdId, initiatedByUserId });
      
      // Start session
      const response = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ householdId, initiatedByUserId }),
      }).catch((fetchError) => {
        // Network error - provide more details
        console.error('Fetch error:', fetchError);
        throw new Error(
          `Network error: ${fetchError.message}. ` +
          `Check browser console and server logs for details.`
        );
      });

      console.log('Response status:', response.status, response.statusText);

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: Failed to start session`;
        try {
          const errorData = await response.json();
          console.error('Error response:', errorData);
          errorMessage = errorData.error || errorData.message || errorMessage;
          if (errorData.details) {
            console.error('Server error details:', errorData.details);
          }
        } catch (e) {
          // If JSON parsing fails, try to get text
          const text = await response.text().catch(() => '');
          console.error('Non-JSON error response:', text);
          errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setSessionId(data.sessionId);
      
      // Initialize recorder and start recording immediately
      const recorder = await createAudioRecorder();
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      
      // Set up data collection handlers
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      // Start recording
      recorder.start();
      
      // Set countdown immediately before state change to ensure it's visible
      setCountdown(10);
      setState('recording-mom');
      
      // Auto-stop after 10 seconds with countdown
      let remainingSeconds = 10;
      
      const countdownInterval = setInterval(() => {
        remainingSeconds--;
        if (remainingSeconds > 0) {
          setCountdown(remainingSeconds);
        } else {
          clearInterval(countdownInterval);
          countdownIntervalRef.current = null;
          setCountdown(null);
        }
      }, 1000);
      
      countdownIntervalRef.current = countdownInterval;
      
      countdownRef.current = window.setTimeout(() => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setCountdown(null);
        if (recorderRef.current && recorderRef.current.state === 'recording') {
          handleMomRecording();
        }
      }, 10000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    }
  };

  const startListenForEnglish = async () => {
    try {
      setError(null);
      
      console.log('Starting listen-for-English session with:', { householdId, initiatedByUserId });
      
      // Start session
      const response = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ householdId, initiatedByUserId }),
      }).catch((fetchError) => {
        console.error('Fetch error:', fetchError);
        throw new Error(
          `Network error: ${fetchError.message}. ` +
          `Check browser console and server logs for details.`
        );
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: Failed to start session`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (e) {
          const text = await response.text().catch(() => '');
          errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setSessionId(data.sessionId);
      
      // Start recording partner (English) immediately
      const recorder = await createAudioRecorder();
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      recorder.start();
      
      // Set countdown immediately before state change to ensure it's visible
      setCountdown(10);
      setState('recording-partner');
      
      // Auto-stop after 10 seconds with countdown
      let remainingSeconds = 10;
      
      const countdownInterval = setInterval(() => {
        remainingSeconds--;
        if (remainingSeconds > 0) {
          setCountdown(remainingSeconds);
        } else {
          clearInterval(countdownInterval);
          countdownIntervalRef.current = null;
          setCountdown(null);
        }
      }, 1000);
      
      countdownIntervalRef.current = countdownInterval;
      
      countdownRef.current = window.setTimeout(() => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setCountdown(null);
        if (recorderRef.current && recorderRef.current.state === 'recording') {
          handlePartnerRecordingForEnglish();
        }
      }, 10000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start listen session');
    }
  };

  const handleMomRecording = async () => {
    if (!recorderRef.current || !sessionId) return;

    // Clear the auto-stop timeout and countdown interval if they exist
    if (countdownRef.current) {
      clearTimeout(countdownRef.current);
      countdownRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);

    try {
      setState('processing-mom');
      
      // Stop recording and collect audio
      const recorder = recorderRef.current;
      const audioBlob = await new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
          resolve(blob);
        };
        recorder.onerror = () => {
          reject(new Error('Recording error occurred'));
        };
        
        if (recorder.state === 'recording') {
          recorder.stop();
        } else {
          // If already stopped, create blob from existing chunks
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
          resolve(blob);
        }
      });
      
      cleanupRecorder(recorderRef.current);
      audioChunksRef.current = [];

      // Upload and process mom's turn
      const formData = new FormData();
      formData.append('file', audioBlob);

      // Use keep-alive for faster connection reuse
      const response = await fetch(`/api/sessions/${sessionId}/mom-turn`, {
        method: 'POST',
        body: formData,
        keepalive: true, // Keep connection alive for reuse
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to process mom turn: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache the English translation for repeat functionality
      setCachedEnglishTranslation(data.translatedText);
      
      // Play English translation
      setState('playing-english');
      try {
        await speakText(data.translatedText, { language: 'en-US' });
      } catch (audioError) {
        console.error('Audio playback error (non-critical):', audioError);
        // Continue even if audio fails - don't block the flow
      }
      
      // After playback, enter waiting state for user to click "Respond"
      setState('waiting-for-respond');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process recording');
      setState('idle');
    }
  };


  const repeatEnglishTranslation = async () => {
    if (!cachedEnglishTranslation) return;
    
    // Replay cached English translation immediately (no API calls)
    setState('playing-english');
    await speakText(cachedEnglishTranslation, { language: 'en-US' });
    setState('waiting-for-respond');
  };

  const repeatChineseTranslation = async (returnToState?: SessionState) => {
    if (!cachedChineseTranslation) return;
    
    // Store the state to return to (passed as parameter or use current state)
    const targetState = returnToState || state;
    
    // Replay cached Chinese translation immediately (no API calls)
    setState('playing-chinese');
    try {
      await speakText(cachedChineseTranslation, { language: 'zh-CN' });
    } catch (audioError) {
      console.error('Audio playback error (non-critical):', audioError);
    }
    
    // Return to the appropriate waiting state
    if (targetState === 'waiting-to-complete-after-partner') {
      // Return to completion state - don't complete yet, user must click Continue
      setState('waiting-to-complete-after-partner');
    } else {
      setState('waiting-for-mom-respond');
    }
  };

  const repeatEnglishTranslationForCompletion = async () => {
    if (!cachedEnglishTranslation) return;
    
    // Replay cached English translation immediately (no API calls)
    setState('playing-english');
    try {
      await speakText(cachedEnglishTranslation, { language: 'en-US' });
    } catch (audioError) {
      console.error('Audio playback error (non-critical):', audioError);
    }
    
    // Return to completion state - don't complete yet, user must click Continue
    setState('waiting-to-complete-after-mom');
  };

  const completeSessionAfterPartner = () => {
    // Tag the conversation in background (non-blocking)
    if (sessionId) {
      fetch(`/api/sessions/${sessionId}/tag`, {
        method: 'POST',
      }).catch(err => {
        console.error('Background tagging failed (non-critical):', err);
      });
    }
    
    setState('completed');
    onSessionComplete?.();
  };

  const completeSessionAfterMom = () => {
    // Tag the conversation in background (non-blocking)
    if (sessionId) {
      fetch(`/api/sessions/${sessionId}/tag`, {
        method: 'POST',
      }).catch(err => {
        console.error('Background tagging failed (non-critical):', err);
      });
    }
    
    setState('completed');
    onSessionComplete?.();
  };

  const startPartnerRecording = async () => {
    if (!sessionId) return;

    try {
      // Start preparing partner recorder
      const partnerRecorder = await createAudioRecorder();
      
      // Set up recorder
      recorderRef.current = partnerRecorder;
      audioChunksRef.current = [];
      
      // Set up data collection handlers
      partnerRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      // Start recording
      partnerRecorder.start();
      
      // Set countdown immediately before state change to ensure it's visible
      setCountdown(10);
      setState('recording-partner');
      
      // Auto-stop after 10 seconds with countdown
      let remainingSeconds = 10;
      
      const countdownInterval = setInterval(() => {
        remainingSeconds--;
        if (remainingSeconds > 0) {
          setCountdown(remainingSeconds);
        } else {
          clearInterval(countdownInterval);
          countdownIntervalRef.current = null;
          setCountdown(null);
        }
      }, 1000);
      
      countdownIntervalRef.current = countdownInterval;
      
      countdownRef.current = window.setTimeout(() => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setCountdown(null);
        if (recorderRef.current && recorderRef.current.state === 'recording') {
          stopPartnerRecording();
        }
      }, 10000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start partner recording');
      setState('waiting-for-respond');
    }
  };

  const handlePartnerRecordingForEnglish = async () => {
    if (!recorderRef.current || !sessionId) return;

    // Clear the auto-stop timeout and countdown interval if they exist
    if (countdownRef.current) {
      clearTimeout(countdownRef.current);
      countdownRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);

    try {
      setState('processing-partner');
      
      // Stop recording and collect audio
      const recorder = recorderRef.current;
      const audioBlob = await new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
          resolve(blob);
        };
        recorder.onerror = () => {
          reject(new Error('Recording error occurred'));
        };
        
        if (recorder.state === 'recording') {
          recorder.stop();
        } else {
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
          resolve(blob);
        }
      });
      
      cleanupRecorder(recorderRef.current);
      audioChunksRef.current = [];

      // Upload and process partner's turn (English -> Chinese)
      const formData = new FormData();
      formData.append('file', audioBlob);

      const response = await fetch(`/api/sessions/${sessionId}/reply-turn`, {
        method: 'POST',
        body: formData,
        keepalive: true,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to process partner turn: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check if translation exists
      if (!data.translatedText || data.translatedText.trim() === '') {
        throw new Error('Translation not available');
      }
      
      // Cache the Chinese translation for repeat functionality
      setCachedChineseTranslation(data.translatedText);
      
      // Play Chinese translation
      setState('playing-chinese');
      try {
        await speakText(data.translatedText, { language: 'zh-CN' });
      } catch (audioError) {
        console.error('Audio playback error:', audioError);
        // Log the error but continue - user can use repeat button
        // Don't silently fail - show error in console for debugging
      }
      
      // After playback, enter waiting state for mom to respond
      setState('waiting-for-mom-respond');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process partner recording');
      setState('idle');
    }
  };

  const stopPartnerRecording = async () => {
    if (!recorderRef.current || !sessionId) return;

    // Clear the auto-stop timeout and countdown interval if they exist
    if (countdownRef.current) {
      clearTimeout(countdownRef.current);
      countdownRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);

    try {
      setState('processing-partner');
      
      // Stop recording and collect audio
      const recorder = recorderRef.current;
      const audioBlob = await new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
          resolve(blob);
        };
        recorder.onerror = () => {
          reject(new Error('Recording error occurred'));
        };
        
        if (recorder.state === 'recording') {
          recorder.stop();
        } else {
          // If already stopped, create blob from existing chunks
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
          resolve(blob);
        }
      });
      
      cleanupRecorder(recorderRef.current);
      audioChunksRef.current = [];

      // Upload and process partner's turn
      const formData = new FormData();
      formData.append('file', audioBlob);

      // Use keep-alive for faster connection reuse
      const response = await fetch(`/api/sessions/${sessionId}/reply-turn`, {
        method: 'POST',
        body: formData,
        keepalive: true, // Keep connection alive for reuse
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to process partner turn: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check if translation exists
      if (!data.translatedText || data.translatedText.trim() === '') {
        throw new Error('Translation not available');
      }
      
      // Cache the Chinese translation for repeat functionality
      setCachedChineseTranslation(data.translatedText);
      
      // Play Chinese translation back to mom
      setState('playing-chinese');
      try {
        await speakText(data.translatedText, { language: 'zh-CN' });
      } catch (audioError) {
        console.error('Audio playback error:', audioError);
        // Log the error but continue - user can use repeat button
        // Don't silently fail - show error in console for debugging
      }
      
      // After playback, show option to repeat translation or complete session
      setState('waiting-to-complete-after-partner');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process partner recording');
      setState('waiting-for-respond');
    }
  };

  const startMomResponse = async () => {
    if (!sessionId) return;

    try {
      // Initialize recorder for mom's response
      const recorder = await createAudioRecorder();
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      recorder.start();
      
      // Set countdown immediately before state change to ensure it's visible
      setCountdown(10);
      setState('recording-mom-response');
      
      // Auto-stop after 10 seconds with countdown
      let remainingSeconds = 10;
      
      const countdownInterval = setInterval(() => {
        remainingSeconds--;
        if (remainingSeconds > 0) {
          setCountdown(remainingSeconds);
        } else {
          clearInterval(countdownInterval);
          countdownIntervalRef.current = null;
          setCountdown(null);
        }
      }, 1000);
      
      countdownIntervalRef.current = countdownInterval;
      
      countdownRef.current = window.setTimeout(() => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setCountdown(null);
        if (recorderRef.current && recorderRef.current.state === 'recording') {
          handleMomResponse();
        }
      }, 10000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start mom response recording');
      setState('waiting-for-mom-respond');
    }
  };

  const handleMomResponse = async () => {
    if (!recorderRef.current || !sessionId) return;

    // Clear the auto-stop timeout and countdown interval if they exist
    if (countdownRef.current) {
      clearTimeout(countdownRef.current);
      countdownRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);

    try {
      setState('processing-mom-response');
      
      // Stop recording and collect audio
      const recorder = recorderRef.current;
      const audioBlob = await new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
          resolve(blob);
        };
        recorder.onerror = () => {
          reject(new Error('Recording error occurred'));
        };
        
        if (recorder.state === 'recording') {
          recorder.stop();
        } else {
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
          resolve(blob);
        }
      });
      
      cleanupRecorder(recorderRef.current);
      audioChunksRef.current = [];

      // Upload and process mom's response (Chinese -> English)
      const formData = new FormData();
      formData.append('file', audioBlob);

      const response = await fetch(`/api/sessions/${sessionId}/mom-turn`, {
        method: 'POST',
        body: formData,
        keepalive: true,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to process mom response: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache the English translation for repeat functionality
      setCachedEnglishTranslation(data.translatedText);
      
      // Play English translation
      setState('playing-english');
      try {
        await speakText(data.translatedText, { language: 'en-US' });
      } catch (audioError) {
        console.error('Audio playback error (non-critical):', audioError);
        // Continue even if audio fails - don't block the flow
      }
      
      // After playback, show option to repeat translation before completing
      setState('waiting-to-complete-after-mom');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process mom response');
      setState('waiting-for-mom-respond');
    }
  };

  const reset = () => {
    stopSpeech();
    if (recorderRef.current) {
      cleanupRecorder(recorderRef.current);
      recorderRef.current = null;
    }
    if (countdownRef.current) {
      clearTimeout(countdownRef.current);
      countdownRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
    setCachedEnglishTranslation(null);
    setCachedChineseTranslation(null);
    setState('idle');
    setSessionId(null);
    setError(null);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full p-0 sm:p-0.5">
      <div className="w-full max-w-md space-y-1 sm:space-y-1.5 md:space-y-2">
        {/* Status Display */}
        <div className="text-center">
          {state === 'idle' && (
            <p className="text-lg sm:text-xl md:text-2xl text-gray-600 mb-1 sm:mb-2 font-medium">
              <span className="block">开始对话</span>
              <span className="block text-sm sm:text-base md:text-lg text-gray-500 mt-0.5 font-normal">Ready to speak?</span>
            </p>
          )}
          {state === 'recording-mom' && (
            <div className="space-y-1.5">
              <p className="text-xl sm:text-2xl md:text-3xl font-semibold text-red-600">
                <span className="block">正在录音...</span>
                <span className="block text-lg sm:text-xl text-red-500 mt-0.5">Recording...</span>
              </p>
              <p className="text-sm sm:text-base text-gray-600">
                <span className="block">{countdown !== null ? countdown : 10} 秒后自动停止</span>
                <span className="block text-gray-500 mt-0.5">Auto-stopping in {countdown !== null ? countdown : 10} second{(countdown !== null ? countdown : 10) !== 1 ? 's' : ''}</span>
              </p>
              <div className="flex justify-center space-x-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-8 bg-red-500 rounded animate-pulse"
                    style={{
                      animationDelay: `${i * 0.1}s`,
                      animationDuration: '0.6s',
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {state === 'processing-mom' && (
            <p className="text-lg sm:text-xl md:text-2xl text-blue-600">
              <span className="block">处理中...</span>
              <span className="block text-base sm:text-lg text-blue-500 mt-0.5">Processing...</span>
            </p>
          )}
          {state === 'playing-english' && (
            <p className="text-lg sm:text-xl md:text-2xl text-green-600">
              <span className="block">正在播放英文翻译...</span>
              <span className="block text-base sm:text-lg text-green-500 mt-0.5">Playing English translation...</span>
            </p>
          )}
          {state === 'waiting-for-respond' && (
            <p className="text-lg sm:text-xl md:text-2xl text-blue-600">
              <span className="block">等待对方回复</span>
              <span className="block text-base sm:text-lg text-blue-500 mt-0.5">Waiting for partner response</span>
            </p>
          )}
          {state === 'waiting-for-mom-respond' && (
            <p className="text-lg sm:text-xl md:text-2xl text-blue-600">
              <span className="block">等待你的回复</span>
              <span className="block text-base sm:text-lg text-blue-500 mt-0.5">Waiting for your response</span>
            </p>
          )}
          {state === 'recording-mom-response' && (
            <div className="space-y-1.5">
              <p className="text-xl sm:text-2xl md:text-3xl font-semibold text-red-600">
                <span className="block">正在录音...</span>
                <span className="block text-lg sm:text-xl text-red-500 mt-0.5">Recording...</span>
              </p>
              <p className="text-sm sm:text-base text-gray-600">
                <span className="block">{countdown !== null ? countdown : 10} 秒后自动停止</span>
                <span className="block text-gray-500 mt-0.5">Auto-stopping in {countdown !== null ? countdown : 10} second{(countdown !== null ? countdown : 10) !== 1 ? 's' : ''}</span>
              </p>
              <div className="flex justify-center space-x-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-8 bg-red-500 rounded animate-pulse"
                    style={{
                      animationDelay: `${i * 0.1}s`,
                      animationDuration: '0.6s',
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {state === 'processing-mom-response' && (
            <p className="text-lg sm:text-xl md:text-2xl text-blue-600">
              <span className="block">处理中...</span>
              <span className="block text-base sm:text-lg text-blue-500 mt-0.5">Processing...</span>
            </p>
          )}
          {state === 'recording-partner' && (
            <div className="space-y-1.5">
              <p className="text-xl sm:text-2xl md:text-3xl font-semibold text-blue-600">
                <span className="block">对方正在录音...</span>
                <span className="block text-lg sm:text-xl text-blue-500 mt-0.5">Partner Recording...</span>
              </p>
              <p className="text-sm sm:text-base text-gray-600">
                <span className="block">{countdown !== null ? countdown : 10} 秒后自动停止</span>
                <span className="block text-gray-500 mt-0.5">Auto-stopping in {countdown !== null ? countdown : 10} second{(countdown !== null ? countdown : 10) !== 1 ? 's' : ''}</span>
              </p>
              <div className="flex justify-center space-x-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-8 bg-blue-500 rounded animate-pulse"
                    style={{
                      animationDelay: `${i * 0.1}s`,
                      animationDuration: '0.6s',
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {state === 'processing-partner' && (
            <p className="text-lg sm:text-xl md:text-2xl text-blue-600">
              <span className="block">处理中...</span>
              <span className="block text-base sm:text-lg text-blue-500 mt-0.5">Processing...</span>
            </p>
          )}
          {state === 'playing-chinese' && (
            <p className="text-lg sm:text-xl md:text-2xl text-green-600">
              <span className="block">正在播放中文翻译...</span>
              <span className="block text-base sm:text-lg text-green-500 mt-0.5">Playing Chinese translation...</span>
            </p>
          )}
          {state === 'waiting-to-complete-after-partner' && (
            <p className="text-lg sm:text-xl md:text-2xl text-blue-600">
              <span className="block">会话完成</span>
              <span className="block text-base sm:text-lg text-blue-500 mt-0.5">Session Complete</span>
            </p>
          )}
          {state === 'waiting-to-complete-after-mom' && (
            <p className="text-lg sm:text-xl md:text-2xl text-blue-600">
              <span className="block">会话完成</span>
              <span className="block text-base sm:text-lg text-blue-500 mt-0.5">Session Complete</span>
            </p>
          )}
          {state === 'completed' && (
            <p className="text-lg sm:text-xl md:text-2xl text-green-600 font-semibold">
              <span className="block">会话已保存！</span>
              <span className="block text-base sm:text-lg text-green-500 mt-0.5 font-normal">Session Saved!</span>
            </p>
          )}
        </div>

        {/* Main Buttons */}
        {state === 'idle' && (
          <div className="space-y-1 sm:space-y-2">
            <button
              onClick={startSession}
              className="w-full py-3 sm:py-4 md:py-5 px-4 sm:px-6 bg-green-600 hover:bg-green-700 text-white text-xl sm:text-2xl md:text-3xl font-bold rounded-lg shadow-lg transition-colors"
            >
              <span className="block">说中文</span>
              <span className="block text-lg sm:text-xl md:text-2xl mt-0 sm:mt-0.5">Speak Chinese</span>
            </button>
            <button
              onClick={startListenForEnglish}
              className="w-full py-2 sm:py-3 md:py-4 px-4 sm:px-6 bg-blue-500 hover:bg-blue-600 text-white text-base sm:text-lg md:text-xl font-semibold rounded-lg shadow-md transition-colors"
            >
              <span className="block">听英文</span>
              <span className="block text-sm sm:text-base md:text-lg mt-0 sm:mt-0.5">Listen for English</span>
            </button>
          </div>
        )}

        {state === 'recording-mom' && (
          <button
            onClick={handleMomRecording}
            className="w-full py-4 sm:py-5 md:py-6 px-4 sm:px-6 bg-red-600 hover:bg-red-700 text-white text-xl sm:text-2xl md:text-3xl font-bold rounded-lg shadow-lg animate-pulse"
          >
            <span className="block">停止录音</span>
            <span className="block text-lg sm:text-xl md:text-2xl mt-0.5 sm:mt-1">Stop Recording</span>
          </button>
        )}

        {state === 'waiting-for-respond' && (
          <div className="space-y-2 sm:space-y-3">
            <button
              onClick={repeatEnglishTranslation}
              className="w-full py-3 sm:py-4 md:py-5 px-4 sm:px-6 bg-yellow-500 hover:bg-yellow-600 text-white text-lg sm:text-xl md:text-2xl font-bold rounded-lg shadow-lg transition-colors"
            >
              <span className="block">重播翻译</span>
              <span className="block text-base sm:text-lg md:text-xl mt-0.5 sm:mt-1">Repeat</span>
            </button>
            <button
              onClick={startPartnerRecording}
              className="w-full py-4 sm:py-5 md:py-6 px-4 sm:px-6 bg-blue-600 hover:bg-blue-700 text-white text-xl sm:text-2xl md:text-3xl font-bold rounded-lg shadow-lg transition-colors"
            >
              <span className="block">对方回复</span>
              <span className="block text-lg sm:text-xl md:text-2xl mt-0.5 sm:mt-1">Respond</span>
            </button>
          </div>
        )}

        {state === 'recording-partner' && (
          <button
            onClick={() => {
              // Check if this is from "Listen for English" flow or regular flow
              // In "Listen for English" flow: no cached translations yet (first recording)
              // In regular flow: cachedEnglishTranslation exists (mom already spoke)
              if (cachedEnglishTranslation === null) {
                // This is the "Listen for English" flow - partner recording first
                handlePartnerRecordingForEnglish();
              } else {
                // This is the regular flow - partner responding to mom
                stopPartnerRecording();
              }
            }}
            className="w-full py-4 sm:py-5 md:py-6 px-4 sm:px-6 bg-blue-600 hover:bg-blue-700 text-white text-xl sm:text-2xl md:text-3xl font-bold rounded-lg shadow-lg animate-pulse"
          >
            <span className="block">停止录音</span>
            <span className="block text-lg sm:text-xl md:text-2xl mt-0.5 sm:mt-1">Stop Recording</span>
          </button>
        )}

        {state === 'waiting-for-mom-respond' && (
          <div className="space-y-2 sm:space-y-3">
            <button
              onClick={() => repeatChineseTranslation('waiting-for-mom-respond')}
              className="w-full py-3 sm:py-4 md:py-5 px-4 sm:px-6 bg-yellow-500 hover:bg-yellow-600 text-white text-lg sm:text-xl md:text-2xl font-bold rounded-lg shadow-lg transition-colors"
            >
              <span className="block">重播翻译</span>
              <span className="block text-base sm:text-lg md:text-xl mt-0.5 sm:mt-1">Repeat</span>
            </button>
            <button
              onClick={startMomResponse}
              className="w-full py-4 sm:py-5 md:py-6 px-4 sm:px-6 bg-green-600 hover:bg-green-700 text-white text-xl sm:text-2xl md:text-3xl font-bold rounded-lg shadow-lg transition-colors"
            >
              <span className="block">回复</span>
              <span className="block text-lg sm:text-xl md:text-2xl mt-0.5 sm:mt-1">Respond</span>
            </button>
          </div>
        )}

        {state === 'waiting-to-complete-after-partner' && (
          <div className="space-y-2 sm:space-y-3">
            <button
              onClick={() => repeatChineseTranslation('waiting-to-complete-after-partner')}
              className="w-full py-3 sm:py-4 md:py-5 px-4 sm:px-6 bg-yellow-500 hover:bg-yellow-600 text-white text-lg sm:text-xl md:text-2xl font-bold rounded-lg shadow-lg transition-colors"
            >
              <span className="block">重播翻译</span>
              <span className="block text-base sm:text-lg md:text-xl mt-0.5 sm:mt-1">Repeat</span>
            </button>
            <button
              onClick={completeSessionAfterPartner}
              className="w-full py-4 sm:py-5 md:py-6 px-4 sm:px-6 bg-green-600 hover:bg-green-700 text-white text-xl sm:text-2xl md:text-3xl font-bold rounded-lg shadow-lg transition-colors"
            >
              <span className="block">继续/结束</span>
              <span className="block text-lg sm:text-xl md:text-2xl mt-0.5 sm:mt-1">Continue</span>
            </button>
          </div>
        )}

        {state === 'recording-mom-response' && (
          <button
            onClick={handleMomResponse}
            className="w-full py-4 sm:py-5 md:py-6 px-4 sm:px-6 bg-red-600 hover:bg-red-700 text-white text-xl sm:text-2xl md:text-3xl font-bold rounded-lg shadow-lg animate-pulse"
          >
            <span className="block">停止录音</span>
            <span className="block text-lg sm:text-xl md:text-2xl mt-0.5 sm:mt-1">Stop Recording</span>
          </button>
        )}

        {state === 'waiting-to-complete-after-mom' && (
          <div className="space-y-2 sm:space-y-3">
            <button
              onClick={repeatEnglishTranslationForCompletion}
              className="w-full py-3 sm:py-4 md:py-5 px-4 sm:px-6 bg-yellow-500 hover:bg-yellow-600 text-white text-lg sm:text-xl md:text-2xl font-bold rounded-lg shadow-lg transition-colors"
            >
              <span className="block">重播翻译</span>
              <span className="block text-base sm:text-lg md:text-xl mt-0.5 sm:mt-1">Repeat</span>
            </button>
            <button
              onClick={completeSessionAfterMom}
              className="w-full py-4 sm:py-5 md:py-6 px-4 sm:px-6 bg-green-600 hover:bg-green-700 text-white text-xl sm:text-2xl md:text-3xl font-bold rounded-lg shadow-lg transition-colors"
            >
              <span className="block">继续/结束</span>
              <span className="block text-lg sm:text-xl md:text-2xl mt-0.5 sm:mt-1">Continue</span>
            </button>
          </div>
        )}

        {state === 'completed' && (
          <button
            onClick={reset}
            className="w-full py-4 sm:py-5 md:py-6 px-4 sm:px-6 bg-pink-600 hover:bg-pink-700 text-white text-xl sm:text-2xl md:text-3xl font-bold rounded-lg shadow-lg"
          >
            <span className="block">开始新会话</span>
            <span className="block text-lg sm:text-xl md:text-2xl mt-0.5 sm:mt-1">Start New Session</span>
          </button>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg text-lg sm:text-xl">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

