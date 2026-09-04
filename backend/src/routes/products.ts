import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { products } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { validate } from '../middleware/validate';
import { productCreateSchema } from '../schemas';
import { env } from '../env';

const router = Router();

// GET /api/products (Admin - all products)
router.get('/products', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const allProducts = await db
      .select()
      .from(products)
      .where(eq(products.merchantId, env.MERCHANT_ID));
    res.json({ success: true, products: allProducts });
  } catch (err) {
    next(err);
  }
});

// GET /api/store/products (Customer - only active products)
router.get('/store/products', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const activeProducts = await db
      .select()
      .from(products)
      .where(and(eq(products.merchantId, env.MERCHANT_ID), eq(products.active, true)));
    res.json({ success: true, products: activeProducts });
  } catch (err) {
    next(err);
  }
});

// POST /api/products (Admin - create)
router.post(
  '/products',
  validate(productCreateSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [newProduct] = await db.insert(products).values({
        merchantId: env.MERCHANT_ID,
        ...req.body,
      }).returning();
      res.json({ success: true, product: newProduct });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/products/:id (Admin - update)
router.patch('/products/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const [updatedProduct] = await db.update(products)
      .set(req.body as Partial<typeof products.$inferInsert>)
      .where(and(eq(products.id, id as string), eq(products.merchantId, env.MERCHANT_ID as string)))
      .returning();
    
    if (!updatedProduct) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, product: updatedProduct });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id (Admin - soft delete)
router.delete('/products/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const [deletedProduct] = await db.update(products)
      .set({ active: false })
      .where(and(eq(products.id, id as string), eq(products.merchantId, env.MERCHANT_ID as string)))
      .returning();
    
    if (!deletedProduct) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, message: 'Product deactivated' });
  } catch (err) {
    next(err);
  }
});

export default router;
