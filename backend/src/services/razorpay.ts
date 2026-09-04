import Razorpay from 'razorpay';
import { env } from '../env';

export const razorpayClient = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

export const createRazorpayOrder = async (amountInPaise: number, receiptId: string) => {
  return razorpayClient.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt: receiptId,
  });
};
