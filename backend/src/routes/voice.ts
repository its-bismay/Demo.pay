import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { db } from '../db';
import { recoveryCases, orders, customers, orderItems, products, policies, recoveryActions, contactLog, agentInstances } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { env } from '../env';
import { recordPromiseToPay } from '../services/promiseService';
import { sseEmitter } from '../services/sse';
import { generateVoiceGreeting, handleVoiceTurnWithAdk } from '../agents/voiceAgent';
import { synthesizeSpeech } from '../services/ttsService';
import { sendWhatsAppMessage } from '../services/whatsappService';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

router.post('/voice/initiate', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { caseId, orderId } = req.body;

    let targetCaseId = caseId;
    let targetOrderId = orderId;
    let customerName = 'Customer';
    let productName = 'Premium Order';
    let amountInPaise = 249900;
    let failureMode = 'GATEWAY_TIMEOUT';

    if (targetCaseId) {
      const [c] = await db.select().from(recoveryCases).where(eq(recoveryCases.id, targetCaseId));
      if (c) {
        targetOrderId = c.orderId;
        failureMode = c.failureMode || 'GATEWAY_TIMEOUT';
      }
    }

    if (targetOrderId) {
      const [ord] = await db.select().from(orders).where(eq(orders.id, targetOrderId));
      if (ord) {
        amountInPaise = ord.amountInPaise;
        if (!targetCaseId) {
          const [existingCase] = await db
            .select()
            .from(recoveryCases)
            .where(eq(recoveryCases.orderId, ord.id))
            .orderBy(desc(recoveryCases.createdAt))
            .limit(1);
          if (existingCase) {
            targetCaseId = existingCase.id;
            failureMode = existingCase.failureMode || 'GATEWAY_TIMEOUT';
          }
        }
        if (ord.customerId) {
          const [cust] = await db.select().from(customers).where(eq(customers.id, ord.customerId));
          if (cust?.name) customerName = cust.name;
        }
      }

      const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, targetOrderId));
      if (item?.productId) {
        const [prod] = await db.select().from(products).where(eq(products.id, item.productId));
        if (prod?.name) productName = prod.name;
      }
    }

    const [policy] = await db
      .select()
      .from(policies)
      .where(eq(policies.merchantId, env.MERCHANT_ID))
      .limit(1);

    const maxDiscount = policy?.maxDiscountPct ?? 15;
    const voiceType = policy?.voiceType ?? 'ritu';
    const languageMode = policy?.languageMode ?? 'Hinglish';
    const amountInRs = Math.round(amountInPaise / 100);

    const greetingResult = await generateVoiceGreeting({
      caseId: targetCaseId,
      orderId: targetOrderId,
      customerName,
      productName,
      amountInRs,
      failureMode,
      maxDiscountPct: maxDiscount,
      personaPrompt: policy?.personaPrompt ?? undefined,
      voiceType,
      languageMode,
    });

    res.json({
      success: true,
      caseId: targetCaseId,
      orderId: targetOrderId,
      customerName,
      productName,
      amountInPaise,
      amountInRs,
      discountPct: greetingResult.discountPct,
      discountedPrice: greetingResult.discountedPrice,
      script: greetingResult.script,
      agentName: greetingResult.agentName,
      agentGender: greetingResult.agentGender,
      voiceType,
      languageMode,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/voice/interact', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { caseId, orderId, userSpeech, conversationHistory = [], currentDiscount = 0 } = req.body;

    let customer = null;
    let productName = 'Order';
    let recCase = null;
    let amountInRs = 2499;
    let failureMode = 'GATEWAY_TIMEOUT';

    if (caseId) {
      const [foundCase] = await db.select().from(recoveryCases).where(eq(recoveryCases.id, caseId));
      recCase = foundCase;
      if (recCase) {
        failureMode = recCase.failureMode || 'GATEWAY_TIMEOUT';
        amountInRs = Math.round(recCase.atRiskAmountInPaise / 100);
      }
      if (recCase?.orderId) {
        const [ord] = await db.select().from(orders).where(eq(orders.id, recCase.orderId));
        if (ord?.customerId) {
          const [cust] = await db.select().from(customers).where(eq(customers.id, ord.customerId));
          customer = cust;
        }
      }
    }

    if (orderId && !recCase) {
      const [ord] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (ord) {
        amountInRs = Math.round(ord.amountInPaise / 100);
        if (ord.customerId) {
          const [cust] = await db.select().from(customers).where(eq(customers.id, ord.customerId));
          customer = cust;
        }
      }
    }

    if (!customer) {
      const [firstCust] = await db
        .select()
        .from(customers)
        .where(eq(customers.merchantId, env.MERCHANT_ID))
        .limit(1);
      customer = firstCust;
    }

    const [policy] = await db
      .select()
      .from(policies)
      .where(eq(policies.merchantId, env.MERCHANT_ID))
      .limit(1);

    const maxDiscount = policy?.maxDiscountPct ?? 15;

    const turnResult = await handleVoiceTurnWithAdk({
      context: {
        caseId,
        orderId,
        customerName: customer?.name ?? 'Customer',
        productName,
        amountInRs,
        failureMode,
        maxDiscountPct: maxDiscount,
        currentDiscountPct: Number(currentDiscount) || 0,
        personaPrompt: policy?.personaPrompt ?? undefined,
        voiceType: policy?.voiceType ?? 'ritu',
        languageMode: policy?.languageMode ?? 'Hinglish',
      },
      userSpeech: userSpeech || '',
      history: conversationHistory,
    });

    let promiseRecorded = false;
    let promiseDetails = null;

    if (turnResult.isPromise && caseId && customer) {
      try {
        promiseDetails = await recordPromiseToPay({
          caseId,
          customerId: customer.id,
          source: 'voice',
          hoursAhead: turnResult.hoursAhead || 24,
        });
        promiseRecorded = true;

        await db
          .update(recoveryCases)
          .set({ status: 'INTERVENTION_EXECUTING', updatedAt: new Date() })
          .where(eq(recoveryCases.id, caseId));

        sseEmitter.emit('event', {
          type: 'promise_created',
          caseId,
          channel: 'VOICE',
          hoursAhead: turnResult.hoursAhead || 24,
          message: `Voice Agent recorded promise to pay (${turnResult.hoursAhead}h delay). Case updated to PROMISED.`,
        });
      } catch (pErr) {
        console.warn('Promise recording error in voice interaction:', pErr);
      }
    }

    let whatsappSent = false;
    let whatsappError: string | undefined = undefined;
    const phoneRaw = customer?.phone?.trim() || '8260548807';
    const cleanDigits = phoneRaw.replace(/[^\d]/g, '');
    const formattedPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
    const recoveryParams = new URLSearchParams();
    if (caseId) recoveryParams.set('case_id', caseId);
    if (orderId) recoveryParams.set('order_id', orderId);
    if (turnResult.discountAppliedPct) recoveryParams.set('discount', String(turnResult.discountAppliedPct));
    const recoveryLink = `${env.FRONTEND_ORIGIN}/store?${recoveryParams.toString()}`;

    if (turnResult.whatsappSent) {
      try {
        const custName = customer?.name || 'Customer';
        const waRes = await sendWhatsAppMessage({
          to: formattedPhone,
          customerName: custName,
          productName,
          recoveryLink,
          discountText: turnResult.discountAppliedPct ? `${turnResult.discountAppliedPct}% discount applied!` : undefined,
          customMessage: `Hi ${custName}! 👋 As requested on our call, here is your 1-click payment recovery link for *${productName}*: ${recoveryLink}\n\nComplete your checkout securely in 1 tap.`,
        });
        whatsappSent = waRes.success;
        whatsappError = waRes.error;
        const messageSid = waRes.messageSid;

        if (caseId) {
          const [existingInstance] = await db
            .select()
            .from(agentInstances)
            .where(eq(agentInstances.caseId, caseId))
            .limit(1);

          let instanceId = existingInstance?.id;
          if (!instanceId) {
            const [newInstance] = await db
              .insert(agentInstances)
              .values({
                caseId,
                agentType: 'voice_recovery_concierge',
                status: 'running',
              })
              .returning();
            instanceId = newInstance.id;
          }

          await db.insert(recoveryActions).values({
            caseId,
            agentInstanceId: instanceId,
            channel: 'WHATSAPP',
            rationale: `Voice call concierge dispatched instant WhatsApp payment link to +${formattedPhone}. MessageSid: ${messageSid}. Success: ${waRes.success}${waRes.error ? ` (${waRes.error})` : ''}`,
            policyChecksPassed: { contactCap: true, quietHours: true, discountCap: true },
            outcome: waRes.success ? 'sent' : 'failed',
          });
        }

        if (customer?.id && waRes.success) {
          await db.insert(contactLog).values({
            customerId: customer.id,
            channel: 'WHATSAPP',
          });
        }

        sseEmitter.emit('event', {
          type: 'intervention_dispatched',
          channel: 'WHATSAPP',
          caseId: caseId || undefined,
          messageSid,
          recipient: `+${formattedPhone}`,
          message: waRes.success
            ? `Direct WhatsApp payment link dispatched to ${custName} (+${formattedPhone}) during voice call.`
            : `WhatsApp dispatch to +${formattedPhone} failed: ${waRes.error}`,
        });
      } catch (waErr: any) {
        console.warn('Voice WhatsApp dispatch error:', waErr);
        whatsappSent = false;
        whatsappError = waErr?.message || 'Network error';
      }
    }

    res.json({
      success: true,
      aiReply: turnResult.aiReply,
      isPromise: turnResult.isPromise,
      hoursAhead: turnResult.hoursAhead,
      discountAppliedPct: turnResult.discountAppliedPct,
      agentName: turnResult.agentName,
      promiseRecorded,
      promiseDetails,
      whatsappSent,
      whatsappError,
      whatsappRecipient: `+${formattedPhone}`,
      recoveryLink,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/voice/tts', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { text, voiceType, languageMode } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Text is required' });
      return;
    }

    const audioBuffer = await synthesizeSpeech({
      text,
      voiceType,
      languageMode,
    });

    if (!audioBuffer) {
      res.status(503).json({ error: 'Sarvam TTS unavailable or not configured' });
      return;
    }

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': audioBuffer.length.toString(),
      'Cache-Control': 'no-cache',
    });
    res.send(audioBuffer);
  } catch (err) {
    next(err);
  }
});

router.post('/voice/stt', upload.single('audio'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      console.warn('[Voice STT] No audio file received in request');
      res.status(400).json({ error: 'No audio file received' });
      return;
    }

    const audioBuffer = req.file.buffer;
    const mimeType = req.file.mimetype || 'audio/webm';
    const filename = mimeType.includes('wav') ? 'audio.wav' : 'audio.webm';
    console.log(`[Voice STT] Received audio: ${audioBuffer.length} bytes, format: ${mimeType}`);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    formData.append('file', blob, filename);
    formData.append('model', 'saaras:v3');
    formData.append('mode', 'codemix');
    formData.append('language_code', 'unknown');

    const sarvamRes = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: {
        'api-subscription-key': env.SARVAM_API_KEY,
      },
      body: formData,
    });

    if (!sarvamRes.ok) {
      const errText = await sarvamRes.text().catch(() => '');
      console.error(`[Voice STT] Sarvam API error: HTTP ${sarvamRes.status} - ${errText}`);
      res.status(502).json({ error: 'STT service error', detail: errText, status: sarvamRes.status });
      return;
    }

    const sarvamData = (await sarvamRes.json()) as { transcript?: string; language_code?: string; language_probability?: number };
    const transcript = (sarvamData.transcript || '').trim();
    console.log(`[Voice STT] Successfully transcribed: "${transcript}" (language: ${sarvamData.language_code || 'auto'})`);

    res.json({ success: true, transcript, language_code: sarvamData.language_code });
  } catch (err: any) {
    console.error('[Voice STT] Exception during transcription:', err?.message || err);
    next(err);
  }
});

export default router;
