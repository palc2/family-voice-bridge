import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { translateText } from '@/lib/ai-client';

const STUDENT_PORTAL_BASE_URL =
  process.env.STUDENT_PORTAL_URL || 'https://space.ai-builders.com/backend';

interface ChatCompletionResponse {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function getApiKey(): string {
  const apiKey = process.env.SUPER_MIND_API_KEY || process.env.AI_BUILDER_TOKEN;
  if (!apiKey) {
    throw new Error(
      'SUPER_MIND_API_KEY or AI_BUILDER_TOKEN environment variable is not set'
    );
  }
  return apiKey;
}

async function analyzeVocabulary(texts: string[]): Promise<{
  nouns: Array<{ word: string; translation: string; count: number }>;
  verbs: Array<{ word: string; translation: string; count: number }>;
  phrases: Array<{ phrase: string; translation: string; count: number }>;
}> {
  const apiKey = getApiKey();
  let combinedText = texts.join(' ').trim();
  
  if (!combinedText) {
    return {
      nouns: [],
      verbs: [],
      phrases: [],
    };
  }

  // Limit text length to avoid token limits (roughly 8000 characters = ~2000 tokens)
  // Keep enough context but prevent API errors
  const MAX_TEXT_LENGTH = 8000;
  if (combinedText.length > MAX_TEXT_LENGTH) {
    console.warn(`Text too long (${combinedText.length} chars), truncating to ${MAX_TEXT_LENGTH} chars`);
    combinedText = combinedText.substring(0, MAX_TEXT_LENGTH) + '...';
  }

  // Ultra-concise prompt that forces JSON output immediately
  // Put example first to guide model output format
  // Updated: 5 nouns, 5 verbs, 3 phrases
  const prompt = `Return ONLY this JSON structure with real data. No explanations, no text, just JSON:

{"nouns":[{"word":"flight","count":2},{"word":"airport","count":1},{"word":"baby","count":3},{"word":"dish","count":2},{"word":"plan","count":1}],"verbs":[{"word":"miss","count":2},{"word":"sleep","count":3},{"word":"feel","count":1},{"word":"smell","count":2},{"word":"cry","count":2}],"phrases":[{"phrase":"long time no see","count":2},{"phrase":"thank God","count":1},{"phrase":"signature dish","count":2}]}

Text to analyze: ${combinedText}

Instructions: Extract top 5 nouns, top 5 verbs, top 3 phrases from the text above. Exclude A1 level words: be, have, do, go, come, get, make, take, give, say, see, know, think, want, like, need, walk, eat, time, day, thing, man, woman, people, place, work, house, home, water, food, money, good, bad, big, small, new, old.

Return ONLY the JSON object. Start with { and end with }. No other text.`;

  console.log(`Sending vocabulary analysis request with ${combinedText.length} characters of text`);
  
  // Try deepseek first (more reliable, allows temperature control)
  // Fall back to gpt-5 if deepseek fails
  let response: Response;
  let usedModel = 'deepseek';
  
  try {
    response = await fetch(`${STUDENT_PORTAL_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
        body: JSON.stringify({
          model: 'deepseek',
          messages: [
            { role: 'system', content: 'You are a JSON API. Return ONLY valid JSON. No explanations, no text before or after the JSON. Start your response with { and end with }.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1, // Low temperature for consistent, focused output
          max_tokens: 2000, // Increased significantly to ensure complete JSON output
        }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      // Check if it's because response_format is not supported
      if (errorText.includes('response_format') || errorText.includes('Unsupported parameter')) {
        console.warn('response_format not supported, retrying without it...');
        // Retry without response_format
        response = await fetch(`${STUDENT_PORTAL_BASE_URL}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek',
            messages: [
              { role: 'system', content: 'You are a JSON API. Return ONLY valid JSON. No explanations, no text before or after the JSON. Start your response with { and end with }.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 2000,
          }),
        });
        
        if (!response.ok) {
          throw new Error(`deepseek failed: ${response.status}`);
        }
      } else {
        console.warn('deepseek model failed, trying gpt-5:', errorText.substring(0, 200));
        throw new Error(`deepseek failed: ${response.status}`);
      }
    }
  } catch (error) {
    console.warn('Falling back to gpt-5 model');
    usedModel = 'gpt-5';
    
    // Fallback to gpt-5 (try with response_format first, then without)
    try {
      response = await fetch(`${STUDENT_PORTAL_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-5',
          messages: [
            { role: 'system', content: 'You are a JSON API. Return ONLY valid JSON. No explanations, no text before or after the JSON. Start your response with { and end with }.' },
            { role: 'user', content: prompt }
          ],
          temperature: 1.0, // gpt-5 forces this anyway
          max_tokens: 2000,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        if (errorText.includes('response_format') || errorText.includes('Unsupported parameter')) {
          // Retry without response_format
          response = await fetch(`${STUDENT_PORTAL_BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-5',
              messages: [
                { role: 'system', content: 'You are a JSON API. Return ONLY valid JSON. No explanations, no text before or after the JSON. Start your response with { and end with }.' },
                { role: 'user', content: prompt }
              ],
              temperature: 1.0,
              max_tokens: 2000,
            }),
          });
        }
      }
    } catch (fallbackError) {
      // If all else fails, throw
      throw fallbackError;
    }
  }
  
  console.log(`Using model: ${usedModel}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('AI API error response:', {
      status: response.status,
      statusText: response.statusText,
      errorText: errorText.substring(0, 500),
    });
    throw new Error(`Vocabulary analysis failed: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
  }

  const data: ChatCompletionResponse = await response.json();
  
  // Log the full response for debugging
  const choice = data.choices?.[0];
  const message = choice?.message;
  const finishReason = choice?.finish_reason;
  const toolCalls = (message as any)?.tool_calls;
  
  console.log('AI API response structure:', {
    hasChoices: !!data.choices,
    choicesLength: data.choices?.length,
    firstChoice: choice ? {
      index: choice.index,
      finishReason,
      messageRole: message?.role,
      hasContent: !!message?.content,
      contentLength: message?.content?.length,
      hasToolCalls: !!toolCalls,
      toolCallsCount: toolCalls?.length,
    } : null,
  });

  let content = message?.content;

  // Log what we actually received for debugging
  console.log('Raw API response content:', {
    hasContent: !!content,
    contentLength: content?.length || 0,
    first100Chars: content?.substring(0, 100) || 'NULL',
    last100Chars: content?.substring(Math.max(0, (content?.length || 0) - 100)) || 'NULL',
    finishReason,
    messageKeys: message ? Object.keys(message) : [],
  });
  
  // If content is empty but we used response_format, the API might have returned JSON differently
  // Some APIs return JSON in a different structure when response_format is used
  if ((!content || content.trim().length === 0) && usedModel === 'deepseek') {
    console.warn('Content is empty but response_format was used. Checking for alternative JSON structure...');
    // Check if JSON is in a different field (some APIs do this)
    const fullMessage = message as any;
    if (fullMessage?.json_object) {
      content = JSON.stringify(fullMessage.json_object);
      console.log('Found JSON in json_object field');
    } else if (fullMessage?.json) {
      content = typeof fullMessage.json === 'string' ? fullMessage.json : JSON.stringify(fullMessage.json);
      console.log('Found JSON in json field');
    }
  }

  // Log what we actually received for debugging
  if (finishReason === 'length') {
    console.warn('Response was cut off due to token limit');
    console.warn('Completion tokens:', data.usage?.completion_tokens);
    console.warn('Content received (first 500 chars):', content?.substring(0, 500) || 'NULL/EMPTY');
    console.warn('Full message object:', JSON.stringify(message, null, 2).substring(0, 1000));
    
    if (!content || content.trim().length === 0) {
      // This is very strange - model generated tokens but no content
      // Check if there's any data we can use
      const rawResponse = JSON.stringify(data, null, 2);
      console.error('Full API response (first 2000 chars):', rawResponse.substring(0, 2000));
      
      throw new Error(
        `Analysis was cut off due to token limit. ` +
        `max_tokens was 600, completion_tokens: ${data.usage?.completion_tokens || 'unknown'}. ` +
        `Model generated ${data.usage?.completion_tokens || 0} tokens but returned no content. ` +
        `This may indicate the model is generating verbose explanations before the JSON. ` +
        `The gpt-5 model forces temperature=1.0 which can cause verbose output. ` +
        `Consider using a different model or further reducing input text length.`
      );
    }
    // Continue to try parsing the partial content
  }

  if (!content) {
    
    // Check for tool calls
    if (toolCalls && toolCalls.length > 0) {
      console.error('API returned tool calls instead of content:', JSON.stringify(toolCalls, null, 2));
      throw new Error(`Analysis API returned tool calls instead of content. This may indicate an API configuration issue.`);
    }
    
    // Provide detailed error
    const errorDetails = `Analysis response did not contain content.\n` +
      `Finish reason: ${finishReason || 'unknown'}\n` +
      `Has tool calls: ${toolCalls ? 'yes (' + toolCalls.length + ')' : 'no'}\n` +
      `Message role: ${message?.role || 'unknown'}\n` +
      `Full response: ${JSON.stringify(data, null, 2).substring(0, 1000)}`;
    
    console.error('No content in AI response:', errorDetails);
    throw new Error(`Analysis response did not contain content. Finish reason: ${finishReason || 'unknown'}`);
  }

  let analysis: {
    nouns: Array<{ word: string; count: number }>;
    verbs: Array<{ word: string; count: number }>;
    phrases: Array<{ phrase: string; count: number }>;
  };
  
  // Ultra-simple JSON extraction: find first { and matching }
  const extractJSON = (text: string): string | null => {
    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) return null;
    
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = firstBrace; i < text.length; i++) {
      const char = text[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return text.substring(firstBrace, i + 1);
          }
        }
      }
    }
    
    return null;
  };

  // Check if content exists and is not empty
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    console.error('Content is empty or null:', {
      content,
      type: typeof content,
      length: content?.length,
      fullResponse: JSON.stringify(data, null, 2).substring(0, 1000),
    });
    
    // If response_format was used, the structure might be different
    // Some APIs return JSON in a different field when response_format is used
    if ((message as any)?.json_object) {
      console.log('Found json_object field, using that instead');
      content = JSON.stringify((message as any).json_object);
    }
    
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('API returned empty content. Check API response structure.');
    }
  }

  // Simple extraction: find first { and matching }
  let jsonStr = extractJSON(content);
  
  if (!jsonStr) {
    // Fallback: try regex (greedy match from first { to last })
    const regexMatch = content.match(/\{[\s\S]*\}/);
    if (regexMatch) {
      jsonStr = regexMatch[0];
    }
  }
  
  // Log what we extracted for debugging
  if (jsonStr) {
    console.log('Extracted JSON string (first 200 chars):', jsonStr.substring(0, 200));
    console.log('Extracted JSON string length:', jsonStr.length);
  }
  
  if (!jsonStr) {
    console.error('No JSON found in content. Content length:', content?.length);
    console.error('First 500 chars:', content.substring(0, 500));
    console.error('Last 500 chars:', content.substring(Math.max(0, content.length - 500)));
    
    // If no JSON found, immediately use AI to extract it
    console.log('No JSON found, using AI to extract JSON from response...');
    
    try {
      const extractionResponse = await fetch(`${STUDENT_PORTAL_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek',
          messages: [
            { role: 'system', content: 'You are a JSON extraction tool. Extract ONLY the JSON object from the text. Return ONLY valid JSON, no other text.' },
            { role: 'user', content: `Extract the JSON object from this text. The JSON should have "nouns", "verbs", and "phrases" keys. Return ONLY the JSON object, no explanations:\n\n${content.substring(0, 3000)}` }
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      });
      
      if (extractionResponse.ok) {
        const extractionData = await extractionResponse.json();
        const extractedContent = extractionData.choices?.[0]?.message?.content;
        if (extractedContent) {
          // Try to extract JSON from the AI's response
          jsonStr = extractJSON(extractedContent) || extractedContent.trim();
          if (jsonStr && jsonStr.startsWith('{')) {
            console.log('Successfully extracted JSON using AI fallback');
            // Continue to parsing below
          } else {
            throw new Error('AI extraction did not return valid JSON');
          }
        } else {
          throw new Error('AI extraction returned empty content');
        }
      } else {
        const errorText = await extractionResponse.text();
        throw new Error(`AI extraction failed: ${extractionResponse.status} - ${errorText.substring(0, 200)}`);
      }
    } catch (aiError) {
      console.error('AI extraction failed:', aiError);
      throw new Error(`No JSON found in response and AI extraction failed. Content preview: ${content?.substring(0, 300) || 'NULL'}...`);
    }
  }
  
  // Try to parse
  try {
    // Clean up the JSON string - remove any trailing incomplete structures
    let cleanedJsonStr = jsonStr.trim();
    
    // If the JSON appears incomplete (ends with incomplete array/object), try to fix it
    if (cleanedJsonStr.endsWith(',') || cleanedJsonStr.match(/,\s*$/)) {
      // Remove trailing comma
      cleanedJsonStr = cleanedJsonStr.replace(/,\s*$/, '');
    }
    
    // Try to close incomplete arrays/objects
    const openBraces = (cleanedJsonStr.match(/\{/g) || []).length;
    const closeBraces = (cleanedJsonStr.match(/\}/g) || []).length;
    const openBrackets = (cleanedJsonStr.match(/\[/g) || []).length;
    const closeBrackets = (cleanedJsonStr.match(/\]/g) || []).length;
    
    // Close incomplete structures
    if (openBrackets > closeBrackets) {
      cleanedJsonStr += ']'.repeat(openBrackets - closeBrackets);
    }
    if (openBraces > closeBraces) {
      cleanedJsonStr += '}'.repeat(openBraces - closeBraces);
    }
    
    analysis = JSON.parse(cleanedJsonStr);
    
    // Validate structure
    if (!analysis || typeof analysis !== 'object') {
      throw new Error('Parsed JSON is not an object');
    }
    
    // Ensure we have the expected keys (even if empty)
    if (!analysis.nouns) analysis.nouns = [];
    if (!analysis.verbs) analysis.verbs = [];
    if (!analysis.phrases) analysis.phrases = [];
    
    // Log what we parsed
    console.log('Successfully parsed JSON:', {
      nounsCount: analysis.nouns?.length || 0,
      verbsCount: analysis.verbs?.length || 0,
      phrasesCount: analysis.phrases?.length || 0,
      firstNoun: analysis.nouns?.[0]?.word || 'none',
      firstVerb: analysis.verbs?.[0]?.word || 'none',
      firstPhrase: analysis.phrases?.[0]?.phrase || 'none',
      allNouns: analysis.nouns?.map(n => n.word).join(', ') || 'none',
      allVerbs: analysis.verbs?.map(v => v.word).join(', ') || 'none',
      allPhrases: analysis.phrases?.map(p => p.phrase).join(', ') || 'none',
    });
    
  } catch (parseError) {
    console.error('JSON parse failed. Content:', jsonStr.substring(0, 500));
    console.error('Full response:', content);
    
    // Last resort: use AI to extract JSON from the response
    try {
      console.log('Using AI to extract JSON from response...');
      const extractionResponse = await fetch(`${STUDENT_PORTAL_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek',
          messages: [
            { role: 'system', content: 'Extract the JSON object from this text. Return ONLY the JSON, no other text.' },
            { role: 'user', content: `Extract the JSON object from this response. The JSON should have "nouns", "verbs", and "phrases" keys. Return ONLY the JSON object, no explanations:\n\n${content.substring(0, 3000)}` }
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      });
      
      if (extractionResponse.ok) {
        const extractionData = await extractionResponse.json();
        const extractedContent = extractionData.choices?.[0]?.message?.content;
        if (extractedContent) {
          const extractedJson = extractJSON(extractedContent) || extractedContent;
          analysis = JSON.parse(extractedJson);
          console.log('Successfully extracted JSON using AI fallback');
        } else {
          throw parseError;
        }
      } else {
        throw parseError;
      }
    } catch (aiError) {
      console.error('AI extraction also failed:', aiError);
      throw new Error(`Failed to parse analysis response. Content preview: ${content.substring(0, 200)}...`);
    }
  }

  // Validate analysis structure
  if (!analysis.nouns || !Array.isArray(analysis.nouns)) {
    analysis.nouns = [];
  }
  if (!analysis.verbs || !Array.isArray(analysis.verbs)) {
    analysis.verbs = [];
  }
  if (!analysis.phrases || !Array.isArray(analysis.phrases)) {
    analysis.phrases = [];
  }

  // A1 Level Exclusion List - Basic words that Chinese primary school students already know
  // These are too elementary for vocabulary learning purposes
  const a1ExclusionList = new Set([
    // Auxiliary/helping verbs
    'be', 'been', 'being', 'am', 'is', 'are', 'was', 'were',
    'have', 'has', 'had', 'having',
    'do', 'does', 'did', 'doing', 'done',
    'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could',
    
    // Basic action verbs (A1 level)
    'go', 'goes', 'went', 'gone', 'going',
    'come', 'comes', 'came', 'coming',
    'get', 'gets', 'got', 'getting',
    'make', 'makes', 'made', 'making',
    'take', 'takes', 'took', 'taken', 'taking',
    'give', 'gives', 'gave', 'given', 'giving',
    'say', 'says', 'said', 'saying',
    'see', 'sees', 'saw', 'seen', 'seeing',
    'know', 'knows', 'knew', 'known', 'knowing',
    'think', 'thinks', 'thought', 'thinking',
    'want', 'wants', 'wanted', 'wanting',
    'like', 'likes', 'liked', 'liking',
    'need', 'needs', 'needed', 'needing',
    'look', 'looks', 'looked', 'looking',
    'use', 'uses', 'used', 'using',
    'find', 'finds', 'found', 'finding',
    'tell', 'tells', 'told', 'telling',
    'ask', 'asks', 'asked', 'asking',
    'work', 'works', 'worked', 'working',
    'try', 'tries', 'tried', 'trying',
    'call', 'calls', 'called', 'calling',
    'help', 'helps', 'helped', 'helping',
    'show', 'shows', 'showed', 'shown', 'showing',
    'play', 'plays', 'played', 'playing',
    'move', 'moves', 'moved', 'moving',
    'live', 'lives', 'lived', 'living',
    'believe', 'believes', 'believed', 'believing',
    'bring', 'brings', 'brought', 'bringing',
    'happen', 'happens', 'happened', 'happening',
    'write', 'writes', 'wrote', 'written', 'writing',
    'sit', 'sits', 'sat', 'sitting',
    'stand', 'stands', 'stood', 'standing',
    'lose', 'loses', 'lost', 'losing',
    'pay', 'pays', 'paid', 'paying',
    'meet', 'meets', 'met', 'meeting',
    'include', 'includes', 'included', 'including',
    'continue', 'continues', 'continued', 'continuing',
    'set', 'sets', 'setting',
    'learn', 'learns', 'learned', 'learnt', 'learning',
    'change', 'changes', 'changed', 'changing',
    'lead', 'leads', 'led', 'leading',
    'understand', 'understands', 'understood', 'understanding',
    'watch', 'watches', 'watched', 'watching',
    'follow', 'follows', 'followed', 'following',
    'stop', 'stops', 'stopped', 'stopping',
    'create', 'creates', 'created', 'creating',
    'speak', 'speaks', 'spoke', 'spoken', 'speaking',
    'read', 'reads', 'reading',
    'allow', 'allows', 'allowed', 'allowing',
    'add', 'adds', 'added', 'adding',
    'spend', 'spends', 'spent', 'spending',
    'grow', 'grows', 'grew', 'grown', 'growing',
    'open', 'opens', 'opened', 'opening',
    'walk', 'walks', 'walked', 'walking',  // User requested
    'eat', 'eats', 'ate', 'eaten', 'eating',  // User requested
    
    // Basic nouns (A1 level - too common)
    'time', 'year', 'years', 'day', 'days', 'way', 'ways', 'thing', 'things',
    'man', 'men', 'woman', 'women', 'people', 'person', 'persons',
    'child', 'children', 'kid', 'kids', 'baby', 'babies',
    'place', 'places', 'work', 'life', 'lives', 'world', 'worlds',
    'house', 'houses', 'home', 'homes', 'room', 'rooms',
    'water', 'food', 'money', 'morning', 'mornings', 'afternoon', 'afternoons',
    'evening', 'evenings', 'night', 'nights', 'week', 'weeks', 'month', 'months',
    'year', 'years', 'today', 'tomorrow', 'yesterday',
    'name', 'names', 'friend', 'friends', 'family', 'families',
    'school', 'schools', 'teacher', 'teachers', 'student', 'students',
    'book', 'books', 'pen', 'pens', 'paper', 'papers',
    'car', 'cars', 'bus', 'buses', 'train', 'trains',
    'phone', 'phones', 'computer', 'computers',
    'table', 'tables', 'chair', 'chairs', 'door', 'doors', 'window', 'windows',
    'bed', 'beds', 'bathroom', 'bathrooms', 'kitchen', 'kitchens',
    'milk', 'bread', 'rice', 'egg', 'eggs', 'apple', 'apples',
    'dog', 'dogs', 'cat', 'cats', 'bird', 'birds',
    'sun', 'moon', 'sky', 'tree', 'trees', 'flower', 'flowers',
    'hand', 'hands', 'head', 'heads', 'eye', 'eyes', 'ear', 'ears',
    'nose', 'nose', 'mouth', 'mouths', 'foot', 'feet', 'leg', 'legs',
    'arm', 'arms', 'body', 'bodies',
    
    // Basic adjectives (A1 level)
    'good', 'bad', 'big', 'small', 'new', 'old', 'long', 'short',
    'hot', 'cold', 'warm', 'cool', 'happy', 'sad', 'nice', 'fine',
    'right', 'wrong', 'easy', 'hard', 'difficult', 'simple',
    'fast', 'slow', 'high', 'low', 'large', 'little', 'young', 'old',
    'beautiful', 'ugly', 'clean', 'dirty', 'full', 'empty',
    'heavy', 'light', 'dark', 'bright', 'open', 'closed',
    'free', 'busy', 'ready', 'sure', 'sorry', 'glad',
    
    // Basic pronouns (though these shouldn't appear as vocabulary items)
    'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'this', 'that', 'these', 'those',
    'what', 'who', 'where', 'when', 'why', 'how',
    'all', 'some', 'many', 'much', 'more', 'most', 'few', 'little',
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'first', 'second', 'third', 'last', 'next', 'other', 'another',
    'same', 'different', 'each', 'every', 'both', 'either', 'neither'
  ]);
  
  // Log before filtering
  console.log('Before A1 filtering:', {
    nounsCount: analysis.nouns?.length || 0,
    verbsCount: analysis.verbs?.length || 0,
    phrasesCount: analysis.phrases?.length || 0,
  });
  
  // Filter verbs to exclude A1 level words
  analysis.verbs = analysis.verbs.filter(verb => {
    const word = verb.word?.toLowerCase().trim();
    const isValid = word && !a1ExclusionList.has(word);
    if (!isValid && word) {
      console.log(`Filtered out A1 verb: "${word}"`);
    }
    return isValid;
  });
  
  // Also filter nouns to exclude A1 level words
  analysis.nouns = analysis.nouns.filter(noun => {
    const word = noun.word?.toLowerCase().trim();
    const isValid = word && !a1ExclusionList.has(word);
    if (!isValid && word) {
      console.log(`Filtered out A1 noun: "${word}"`);
    }
    return isValid;
  });
  
  // Log after filtering
  console.log('After A1 filtering:', {
    nounsCount: analysis.nouns?.length || 0,
    verbsCount: analysis.verbs?.length || 0,
    phrasesCount: analysis.phrases?.length || 0,
  });

  // Take top items (don't pad with empty items - we'll filter them out later)
  const nounsToTranslate = analysis.nouns.slice(0, 5).filter(n => n.word && n.word.trim());
  const verbsToTranslate = analysis.verbs.slice(0, 5).filter(v => v.word && v.word.trim());
  const phrasesToTranslate = analysis.phrases.slice(0, 3).filter(p => p.phrase && p.phrase.trim());
  
  console.log('Items to translate:', {
    nounsToTranslate: nounsToTranslate.length,
    verbsToTranslate: verbsToTranslate.length,
    phrasesToTranslate: phrasesToTranslate.length,
    nounWords: nounsToTranslate.map(n => n.word).join(', ') || 'none',
    verbWords: verbsToTranslate.map(v => v.word).join(', ') || 'none',
    phraseTexts: phrasesToTranslate.map(p => p.phrase).join(', ') || 'none',
  });

  // Helper function to translate with retry logic
  const translateWithRetry = async (
    text: string,
    retries = 2,
    delayMs = 500
  ): Promise<string> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await translateText(text, 'en-US', 'zh-CN');
        if (result.translatedText && result.translatedText.trim()) {
          return result.translatedText;
        }
        throw new Error('Translation returned empty result');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.warn(`Translation attempt ${attempt + 1}/${retries + 1} failed for "${text}":`, errorMessage);
        
        if (attempt < retries) {
          // Wait before retrying (exponential backoff)
          const waitTime = delayMs * Math.pow(2, attempt);
          console.log(`Retrying translation for "${text}" after ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          // Final attempt failed, throw error
          throw new Error(`Translation failed after ${retries + 1} attempts: ${errorMessage}`);
        }
      }
    }
    throw new Error('Translation failed - should not reach here');
  };

  // Translate items sequentially with small delays to avoid rate limiting
  // Process in batches to balance speed and reliability
  const translateSequentially = async <T extends { word?: string; phrase?: string; count: number }>(
    items: T[],
    type: 'noun' | 'verb' | 'phrase'
  ): Promise<Array<T & { translation: string }>> => {
    const results: Array<T & { translation: string }> = [];
    
    for (const item of items) {
      const text = item.word || item.phrase;
      
      if (!text || !text.trim()) {
        results.push({ ...item, translation: '' } as T & { translation: string });
        continue;
      }

      try {
        const translation = await translateWithRetry(text);
        results.push({ ...item, translation } as T & { translation: string });
        
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`Translation failed for ${type} "${text}" after retries:`, errorMessage);
        // Return English word as fallback, but log the error
        results.push({ ...item, translation: text } as T & { translation: string });
      }
    }
    
    return results;
  };

  // Translate all items sequentially to avoid overwhelming the API
  console.log('Starting translations for vocabulary items...');
  const [translatedNouns, translatedVerbs, translatedPhrases] = await Promise.all([
    translateSequentially(nounsToTranslate, 'noun'),
    translateSequentially(verbsToTranslate, 'verb'),
    translateSequentially(phrasesToTranslate, 'phrase'),
  ]);
  
  console.log('Translations complete:', {
    nounsTranslated: translatedNouns.filter(n => n.word && n.translation && n.translation.trim()).length,
    verbsTranslated: translatedVerbs.filter(v => v.word && v.translation && v.translation.trim()).length,
    phrasesTranslated: translatedPhrases.filter(p => p.phrase && p.translation && p.translation.trim()).length,
    totalNouns: translatedNouns.length,
    totalVerbs: translatedVerbs.length,
    totalPhrases: translatedPhrases.length,
  });

  // Filter out empty items and ensure we only return items with valid words/phrases and translations
  const nouns = translatedNouns
    .filter(item => item.word && item.word.trim() && item.translation && item.translation.trim())
    .map(n => ({ word: n.word, translation: n.translation, count: n.count }));
  const verbs = translatedVerbs
    .filter(item => item.word && item.word.trim() && item.translation && item.translation.trim())
    .map(v => ({ word: v.word, translation: v.translation, count: v.count }));
  const phrases = translatedPhrases
    .filter(item => item.phrase && item.phrase.trim() && item.translation && item.translation.trim())
    .map(p => ({ phrase: p.phrase, translation: p.translation, count: p.count }));
  
  console.log('Final results:', {
    nounsCount: nouns.length,
    verbsCount: verbs.length,
    phrasesCount: phrases.length,
  });

  return {
    nouns,
    verbs,
    phrases,
  };
}

export async function GET(request: NextRequest) {
  try {
    console.log('Vocabulary API called');
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const householdIdParam = searchParams.get('householdId');
    
    // Use default household ID if not provided (for backward compatibility)
    const householdId = householdIdParam || '00000000-0000-0000-0000-000000000000';
    
    console.log('Date parameter:', dateParam);
    console.log('Household ID:', householdId);
    
    // Get household timezone
    const household = await queryOne<{ timezone: string }>(
      `SELECT timezone FROM households WHERE id = $1`,
      [householdId]
    );

    if (!household) {
      return NextResponse.json(
        { error: 'Household not found' },
        { status: 404 }
      );
    }

    const timezone = household.timezone || 'America/New_York';
    console.log('Using timezone:', timezone);
    
    // Parse date - the dateParam is in YYYY-MM-DD format (local date)
    const targetDateStr = dateParam || new Date().toISOString().split('T')[0];
    
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    console.log('Target date (local):', targetDateStr);
    console.log('Querying database for turns on date', targetDateStr, 'in timezone', timezone);
    
    // Query using household timezone - this ensures we get turns for the correct local date
    // Expanded scope: Include both mom's English (translated from Chinese) and partner's English (source text)
    const turns = await query<{ text: string }>(
      `(
        SELECT translated_text as text, ended_at
        FROM conversation_turns 
        WHERE household_id = $1
        AND DATE(ended_at AT TIME ZONE $2) = $3
        AND source_lang = 'zh-CN'
        AND target_lang = 'en-US'
        AND translated_text IS NOT NULL 
        AND translated_text != ''
      )
      UNION ALL
      (
        SELECT source_text as text, ended_at
        FROM conversation_turns 
        WHERE household_id = $1
        AND DATE(ended_at AT TIME ZONE $2) = $3
        AND source_lang = 'en-US'
        AND target_lang = 'zh-CN'
        AND source_text IS NOT NULL 
        AND source_text != ''
      )
      ORDER BY ended_at ASC`,
      [householdId, timezone, targetDateStr]
    );
    console.log(`Found ${turns.length} turns (including both mom's English and partner's English)`);

    if (turns.length === 0) {
      console.log('No turns found, returning empty result');
      return NextResponse.json({
        date: targetDateStr,
        turnCount: 0,
        nouns: [],
        verbs: [],
        phrases: [],
        timezone: timezone,
      });
    }

    const texts = turns.map(turn => turn.text.trim()).filter(Boolean);
    
    if (texts.length === 0) {
      return NextResponse.json({
        date: targetDateStr,
        turnCount: turns.length,
        nouns: [],
        verbs: [],
        phrases: [],
        timezone: timezone,
      });
    }

    console.log(`Analyzing ${texts.length} conversation turns for date ${targetDateStr} in timezone ${timezone}`);
    const analysis = await analyzeVocabulary(texts);
    console.log('Analysis complete:', {
      nounsCount: analysis.nouns.length,
      verbsCount: analysis.verbs.length,
      phrasesCount: analysis.phrases.length,
    });

    return NextResponse.json({
      date: targetDateStr,
      turnCount: turns.length,
      nouns: analysis.nouns,
      verbs: analysis.verbs,
      phrases: analysis.phrases,
      timezone: timezone,
    });
  } catch (error) {
    console.error('=== ERROR in vocabulary API ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Full error object:', error);
    console.error('=== END ERROR ===');
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch daily vocabulary';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined,
        type: error?.constructor?.name || 'Unknown'
      },
      { status: 500 }
    );
  }
}

