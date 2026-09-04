import { env } from '../env';

const isConfigured =
  Boolean(env.SARVAM_API_KEY) &&
  !env.SARVAM_API_KEY.startsWith('dev_');

export function mapSpeaker(voiceType?: string): string {
  const v = (voiceType || '').toLowerCase();
  if (v.includes('priya') || v.includes('raveena') || v.includes('english')) {
    return 'priya';
  }
  if (v.includes('shubh') || v.includes('neural2-b') || v.includes('male')) {
    return 'shubh';
  }
  if (v.includes('arun')) {
    return 'arun';
  }
  return 'ritu';
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
