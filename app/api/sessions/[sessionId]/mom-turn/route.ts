import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { transcribeAudio, translateText } from '@/lib/ai-client';
import { checkRateLimit, RateLimitConfigs } from '@/lib/rate-limit';

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  // Check rate limit
  const rateLimitResponse = await checkRateLimit(request, RateLimitConfigs.AUDIO_PROCESSING);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const sessionId = params.sessionId;

    // Validate session exists
    const session = await queryOne<{
      id: string;
      household_id: string;
      initiated_by_user_id: string;
    }>(
      `SELECT id, household_id, initiated_by_user_id 
       FROM conversation_sessions 
       WHERE id = $1`,
      [sessionId]
    );

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Parse FormData
    const formData = await request.formData();
    const audioFile = formData.get('file') as File | Blob | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Audio file is required' },
        { status: 400 }
      );
    }

    // Convert File/Blob to Buffer for Node.js compatibility (start immediately)
    const bufferPromise = audioFile.arrayBuffer().then(ab => Buffer.from(ab));

    // Step 1: Transcribe audio (Chinese) - start immediately
    const transcriptionPromise = bufferPromise.then(buffer => 
      transcribeAudio(buffer, 'zh-CN')
    );

    // Wait for transcription
    const transcription = await transcriptionPromise;
    const sourceText = transcription.text?.trim() || '';

    console.log('Transcription result:', {
      requestId: transcription.request_id,
      text: sourceText,
      textLength: sourceText.length,
      detectedLanguage: transcription.detected_language,
    });

    // Check if transcription returned empty text
    if (!sourceText || sourceText.length === 0) {
      return NextResponse.json(
        { 
          error: 'No speech detected in audio. Please try speaking again.',
          sourceText: '',
          translatedText: '',
        },
        { status: 400 }
      );
    }

    // Step 2: Translate to English (using deepseek with streaming)
    const translation = await translateText(
      sourceText,
      'zh-CN',
      'en-US'
    );

    // Step 3: Save to conversation_turns (fire and forget - don't wait for DB)
    // Return response immediately, save in background
    query<{ id: string }>(
      `INSERT INTO conversation_turns (
        session_id,
        household_id,
        speaker_user_id,
        speaker_role,
        turn_index,
        ended_at,
        source_lang,
        target_lang,
        source_text,
        translated_text,
        asr_request_id,
        translation_request_id
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11)
      RETURNING id`,
      [
        sessionId,
        session.household_id,
        session.initiated_by_user_id,
        'mom',
        0,
        'zh-CN',
        'en-US',
        sourceText,
        translation.translatedText,
        transcription.request_id,
        translation.requestId,
      ]
    ).catch(err => {
      console.error('Background DB save failed (non-critical):', err);
    });

    // Return immediately - don't wait for DB write
    return NextResponse.json({
      sourceText,
      translatedText: translation.translatedText,
    });
  } catch (error) {
    console.error('Error processing mom turn:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error details:', { errorMessage, errorStack });
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined
      },
      { status: 500 }
    );
  }
}

