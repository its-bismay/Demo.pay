import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { recoveryCases, orders, customers, orderItems, products, policies } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { env } from '../env';
import { parsePromiseIntent, recordPromiseToPay } from '../services/promiseService';
import { sseEmitter } from '../services/sse';

const router = Router();

// POST /api/voice/initiate
// Prepares initial call context and persuasive pitch for an order or recovery case
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

    // Default policy discount
    const [policy] = await db
      .select()
      .from(policies)
      .where(eq(policies.merchantId, env.MERCHANT_ID))
      .limit(1);

    const maxDiscount = policy?.maxDiscountPct ?? 15;
    const discountPct = Math.min(10, maxDiscount);
    const amountInRs = Math.round(amountInPaise / 100);
    const discountedPrice = Math.round(amountInRs * (1 - discountPct / 100));

    // Natural empathetic opening script in Hinglish
    const script = `Namaste ${customerName}! Main Demo.pay recovery desk se Aditi baat kar rahi hoon. Maine dekha aapka ₹${amountInRs.toLocaleString()} ka ${productName} order complete nahi ho paya. Humne aapke liye ek special ${discountPct}% discount activate kiya hai, jisse yeh sirf ₹${discountedPrice.toLocaleString()} ka padega. Kya aap abhi complete karna chahenge ya kal schedule karein?`;

    res.json({
      success: true,
      caseId: targetCaseId,
      orderId: targetOrderId,
      customerName,
      productName,
      amountInPaise,
      amountInRs,
      discountPct,
      discountedPrice,
      script,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/voice/interact
// Conversational AI agent handling user voice responses, overcoming objections & capturing promises
router.post('/voice/interact', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { caseId, orderId, userSpeech, conversationHistory = [] } = req.body;
    const speechLower = (userSpeech || '').toLowerCase().trim();

    const { isPromise, hoursAhead } = parsePromiseIntent(speechLower);

    let customer = null;
    let productName = 'Order';
    let recCase = null;

    if (caseId) {
      const [foundCase] = await db.select().from(recoveryCases).where(eq(recoveryCases.id, caseId));
      recCase = foundCase;
      if (recCase?.orderId) {
        const [ord] = await db.select().from(orders).where(eq(orders.id, recCase.orderId));
        if (ord?.customerId) {
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

    let promiseRecorded = false;
    let promiseDetails = null;

    if (isPromise && caseId && customer) {
      try {
        promiseDetails = await recordPromiseToPay({
          caseId,
          customerId: customer.id,
          source: 'voice',
          hoursAhead,
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
          hoursAhead,
          message: `Voice Agent recorded promise to pay (${hoursAhead}h delay). Case updated to PROMISED.`,
        });
      } catch (pErr) {
        console.warn('Promise record error in voice interaction:', pErr);
      }
    }

    let aiReply = '';

    if (promiseRecorded || isPromise) {
      const timeLabel = hoursAhead === 24 ? 'kal' : hoursAhead === 48 ? 'Monday tak' : 'aaj shaam tak';
      aiReply = `Bahut badhiya! Maine aapka order aur 10% discount ${timeLabel} ke liye lock kar diya hai. Direct payment link aapko WhatsApp aur SMS par bhej diya gaya hai. Thank you so much and have a wonderful day!`;
    } else if (
      speechLower.includes('discount') ||
      speechLower.includes('mehenga') ||
      speechLower.includes('expensive') ||
      speechLower.includes('kam') ||
      speechLower.includes('price')
    ) {
      aiReply = `Main aapki baat samajh sakti hoon. Isiliye humne turant 10% instant discount apply kar diya hai! Kya main payment link abhi bhej doon, ya aap kal subah pay karna chahenge?`;
    } else if (
      speechLower.includes('fail') ||
      speechLower.includes('error') ||
      speechLower.includes('kyu') ||
      speechLower.includes('why') ||
      speechLower.includes('problem')
    ) {
      aiReply = `Aapke bank server ke timeout ki wajah se transaction ruk gayi thi. Aapka koi amount deduct nahi hua hai. Humne safe direct UPI channel open kiya hai jisse yeh 10 seconds mein complete ho jayega. Kya aap abhi retry karna chahenge?`;
    } else if (
      speechLower.includes('abhi') ||
      speechLower.includes('link') ||
      speechLower.includes('yes') ||
      speechLower.includes('haan') ||
      speechLower.includes('send') ||
      speechLower.includes('pay')
    ) {
      aiReply = `Perfect! Maine updated 10% discount ke saath secure payment link aapke phone par push kar diya hai. Aap wahan se 1-click mein order finish kar sakte hain. Thank you!`;
    } else if (
      speechLower.includes('cancel') ||
      speechLower.includes('nahi') ||
      speechLower.includes('no') ||
      speechLower.includes('mat karo')
    ) {
      aiReply = `Koi baat nahi, main samajh sakti hoon. Maine yeh cart aapke liye save kar di hai agar aapka baad mein mann bane. Thank you for your time, take care!`;
    } else {
      // Gemini LLM integration if available
      if (env.GOOGLE_API_KEY && !env.GOOGLE_API_KEY.startsWith('dev_')) {
        try {
          const prompt = `You are Aditi, an empathetic, persuasive female customer recovery agent for Demo.pay speaking in natural Hinglish.
Customer just said: "${userSpeech}"
Your goal: Be polite, address their concern, offer/remind them about 10% discount, and ask if they would like to pay now or schedule for tomorrow (kal).
Keep your reply concise (1-2 sentences max), conversational, and friendly in Hinglish.`;

          const resLlm = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GOOGLE_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
              }),
            }
          );

          if (resLlm.ok) {
            const llmData = (await resLlm.json()) as any;
            const text = llmData?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) aiReply = text.trim();
          }
        } catch (llmErr) {
          console.warn('Voice LLM fallback:', llmErr);
        }
      }

      if (!aiReply) {
        aiReply = `Samajh gayi! Humne aapke liye 10% discount secure kar rakha hai. Kya aap abhi payment finish karna chahenge ya main kal reminder set kar doon?`;
      }
    }

    res.json({
      success: true,
      aiReply,
      isPromise,
      hoursAhead,
      promiseRecorded,
      promiseDetails,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
