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

    // Parse FormData and get partner user in parallel
    const [formData, partnerUser] = await Promise.all([
      request.formData(),
      queryOne<{ id: string }>(
        `SELECT id FROM users 
         WHERE household_id = $1 
         AND family_role = 'partner' 
         LIMIT 1`,
        [session.household_id]
      )
    ]);

    const speakerUserId = partnerUser?.id || null;
    const audioFile = formData.get('file') as File | Blob | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Audio file is required' },
        { status: 400 }
      );
    }

    // Convert File/Blob to Buffer and start transcription immediately (parallel processing)
    const bufferPromise = audioFile.arrayBuffer().then(ab => Buffer.from(ab));

    // Step 1: Transcribe audio (English) - start immediately
    const transcriptionPromise = bufferPromise.then(buffer => 
      transcribeAudio(buffer, 'en-US')
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

    // Step 2: Translate to Chinese (using deepseek with streaming)
    const translation = await translateText(
      sourceText,
      'en-US',
      'zh-CN'
    );

    // Step 3 & 4: Save to conversation_turns and update session (fire and forget)
    // Return response immediately, save in background
    Promise.all([
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
          speakerUserId,
          'partner',
          1,
          'en-US',
          'zh-CN',
          sourceText,
          translation.translatedText,
          transcription.request_id,
          translation.requestId,
        ]
      ),
      query(
        `UPDATE conversation_sessions 
         SET ended_at = NOW() 
         WHERE id = $1`,
        [sessionId]
      )
    ]).then(() => {
      // Step 5: Trigger daily summary generation in background (non-blocking)
      // This runs after DB writes complete to ensure turns are saved
      // Use the request URL to construct the base URL for internal API calls
      const url = new URL(request.url);
      const baseUrl = `${url.protocol}//${url.host}`;
      
      // Get today's date in household timezone for summary generation
      queryOne<{ timezone: string }>(
        `SELECT timezone FROM households WHERE id = $1`,
        [session.household_id]
      ).then(household => {
        if (household) {
          // Generate summary for today (in background, don't wait)
          fetch(`${baseUrl}/api/summaries/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              householdId: session.household_id,
              summaryDate: new Date().toISOString().split('T')[0] // Will be converted to household timezone in the endpoint
            })
          }).catch(err => {
            console.error('Background summary generation failed (non-critical):', err);
          });
        }
      }).catch(err => {
        console.error('Failed to fetch household for summary generation (non-critical):', err);
      });
    }).catch(err => {
      console.error('Background DB save failed (non-critical):', err);
    });

    // Return immediately - don't wait for DB writes
    return NextResponse.json({
      sourceText,
      translatedText: translation.translatedText,
    });
  } catch (error) {
    console.error('Error processing reply turn:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

