import { env } from '../env';

const isConfigured =
  Boolean(env.SARVAM_API_KEY) &&
  !env.SARVAM_API_KEY.startsWith('dev_');

export interface AgentPersonaInfo {
  agentName: string;
  agentGender: 'female' | 'male';
  speaker: string;
  hindiPronouns: {
    speaking: string;
    assist: string;
    canDo: string;
  };
}

export function getAgentPersonaInfo(voiceType?: string): AgentPersonaInfo {
  const v = (voiceType || '').toLowerCase();
  const isFemale = v.includes('female') || v.includes('ritu') || v.includes('priya') || v.includes('aditi');
  const isMale = !isFemale && (v.includes('male') || v.includes('shubh') || v.includes('arun') || v.includes('aarav'));
  if (isMale) {
    const isArun = v.includes('arun');
    return {
      agentName: isArun ? 'Arun' : 'Aarav',
      agentGender: 'male',
      speaker: isArun ? 'arun' : 'shubh',
      hindiPronouns: {
        speaking: 'baat kar raha hoon',
        assist: 'aapki madad kar sakta hoon',
        canDo: 'kar sakta hoon',
      },
    };
  }
  const isPriya = v.includes('priya');
  return {
    agentName: isPriya ? 'Priya' : 'Aditi',
    agentGender: 'female',
    speaker: isPriya ? 'priya' : 'ritu',
    hindiPronouns: {
      speaking: 'baat kar rahi hoon',
      assist: 'aapki madad kar sakti hoon',
      canDo: 'kar sakti hoon',
    },
  };
}

export function mapSpeaker(voiceType?: string): string {
  return getAgentPersonaInfo(voiceType).speaker;
}

export function mapLanguageCode(languageMode?: string): string {
  const l = (languageMode || '').toLowerCase();
  if (l.includes('pure english') || l.includes('english')) {
    return 'en-IN';
  }
  return 'hi-IN';
}

export async function synthesizeSpeech(params: {
  text: string;
  voiceType?: string;
  languageMode?: string;
}): Promise<Buffer | null> {
  if (!isConfigured) {
    return null;
  }

  const cleanText = params.text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/[*_#`~]/g, '')
    .trim();

  if (!cleanText) {
    return null;
  }

  const speaker = mapSpeaker(params.voiceType);
  const language_code = mapLanguageCode(params.languageMode);

  try {
    const res = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'api-subscription-key': env.SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: cleanText,
        language_code,
        speaker,
        model: 'bulbul:v3',
        pace: 1.0,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('Sarvam AI TTS error status:', res.status, errText);
      return null;
    }

    const data = (await res.json()) as { audios?: string[] };
    if (!data.audios || data.audios.length === 0) {
      return null;
    }

    const base64Combined = data.audios.join('');
    return Buffer.from(base64Combined, 'base64');
  } catch (err: any) {
    console.warn('Sarvam TTS network error:', err?.message);
    return null;
  }
}
