import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Plus,
  Edit,
  Trash2,
  Zap,
  RotateCw,
  Clock,
  User,
  Phone,
  PhoneCall,
  Mail,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLiveFeedStore, useVoiceCallStore } from '@/store';
import { api } from '@/lib/api';

const INITIAL_PRODUCTS = [];

export function CaseStatusBadge({ status }) {
  const map = {
    RECOVERED: { label: 'Recovered', className: 'bg-green-600 text-white hover:bg-green-700' },
    SUPPRESSED: { label: 'Suppressed', className: 'bg-amber-500 text-white hover:bg-amber-600' },
    FAILED: { label: 'Failed', className: 'bg-red-600 text-white hover:bg-red-700' },
    INTERVENTION_EXECUTING: { label: 'In Progress', className: 'bg-blue-600 text-white hover:bg-blue-700' },
    INTERVENTION_SCHEDULED: { label: 'Scheduled', className: 'bg-indigo-600 text-white hover:bg-indigo-700' },
    DIAGNOSED: { label: 'Diagnosed', className: 'bg-slate-600 text-white hover:bg-slate-700' },
    DETECTED: { label: 'Detected', className: 'bg-slate-500 text-white hover:bg-slate-600' },
  };
  const s = map[status] ?? { label: status, className: 'bg-muted text-muted-foreground' };
  return <Badge className={`font-semibold ${s.className}`}>{s.label}</Badge>;
}

function KillSwitch() {
  const [isActive, setIsActive] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    api('/api/system/kill-switch')
      .then((data) => setIsActive(data.active))
      .catch((err) => console.warn('Kill switch fetch error:', err));
  }, []);

  const toggleSwitch = () => {
    setShowConfirm(true);
  };

  const confirmToggle = async () => {
    const nextState = !isActive;
    setIsActive(nextState);
    setShowConfirm(false);
    try {
      await api('/api/system/kill-switch', {
        method: 'POST',
        body: JSON.stringify({ active: nextState }),
      });
    } catch (err) {
      console.error('Failed to toggle kill switch:', err);
      setIsActive(!nextState);
    }
  };

  return (
    <>
      <div className="flex items-center gap-4 bg-muted/50 p-2 px-4 rounded-lg border border-border">
        <div className="flex flex-col">
          <span className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <ShieldAlert className={`h-4 w-4 ${isActive ? 'text-destructive' : 'text-primary'}`} />
            Global Kill Switch
          </span>
          <span className="text-xs text-muted-foreground">
            {isActive ? 'Agents are HALTED' : 'Agents are RUNNING'}
          </span>
        </div>
        <Switch
          checked={isActive}
          onCheckedChange={toggleSwitch}
          className={isActive ? 'data-[state=checked]:bg-destructive' : ''}
        />
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Kill Switch Toggle</AlertDialogTitle>
            <AlertDialogDescription>
              {isActive
                ? 'You are about to re-enable AI agents. They will resume processing recovery cases.'
                : 'You are about to HALT all AI agents. Interventions will be automatically SUPPRESSED.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggle}
              className={!isActive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {isActive ? 'Re-enable Agents' : 'Halt Agents'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AddItemView() {
  const [products, setProducts] = useState(INITIAL_PRODUCTS);
  const [isDeleting, setIsDeleting] = useState(null);
  const [isEditing, setIsEditing] = useState(null);

  useEffect(() => {
    api('/api/products')
      .then((data) => setProducts(data.products))
      .catch(console.error);
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const body = {
      name: formData.get('name'),
      category: formData.get('category'),
      priceInPaise: parseInt(formData.get('price')) * 100,
      description: formData.get('description'),
      discountEligible: formData.get('discount_eligible') === 'on',
      maxDiscountOverridePct: formData.get('max_discount_override_pct')
        ? parseInt(formData.get('max_discount_override_pct'))
        : null,
      ratingValue: parseFloat(formData.get('rating_value')) || 0,
      ratingCount: parseInt(formData.get('rating_count')) || 0,
      imageUrl: formData.get('image_url') || '',
    };
    try {
      const res = await api('/api/products', { method: 'POST', body: JSON.stringify(body) });
      setProducts([...products, res.product]);
      e.target.reset();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const body = {
      name: formData.get('name'),
      priceInPaise: parseInt(formData.get('price')) * 100,
      category: formData.get('category'),
      description: formData.get('description'),
      discountEligible: formData.get('discount_eligible') === 'on',
      maxDiscountOverridePct: formData.get('max_discount_override_pct')
        ? parseInt(formData.get('max_discount_override_pct'))
        : null,
      ratingValue: parseFloat(formData.get('rating_value')) || 0,
      ratingCount: parseInt(formData.get('rating_count')) || 0,
      imageUrl: formData.get('image_url') || '',
    };
    try {
      const res = await api(`/api/products/${isEditing.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setProducts(products.map((p) => (p.id === isEditing.id ? res.product : p)));
      setIsEditing(null);
    } catch (err) {
      console.error(err);
    }
  };

  const confirmDelete = async () => {
    try {
      await api(`/api/products/${isDeleting}`, { method: 'DELETE' });
      setProducts(products.map((p) => (p.id === isDeleting ? { ...p, active: false } : p)));
      setIsDeleting(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
      <Card className="md:col-span-1 border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle>Add New Product</CardTitle>
          <CardDescription>Create a new product for the store catalog.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>Product Name</Label>
              <Input name="name" required placeholder="e.g. Smart Watch" className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                name="description"
                required
                placeholder="Short description..."
                className="bg-background resize-none h-20"
              />
            </div>
            <div className="space-y-2">
              <Label>Image URL</Label>
              <Input name="image_url" type="url" required placeholder="https://..." className="bg-background" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select name="category" defaultValue="Electronics" required>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Electronics">Electronics</SelectItem>
                    <SelectItem value="Fashion/Dress">Fashion/Dress</SelectItem>
                    <SelectItem value="Furniture">Furniture</SelectItem>
                    <SelectItem value="Home & Household">Home & Household</SelectItem>
                    <SelectItem value="Subscriptions">Subscriptions</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Price (₹)</Label>
                <Input name="price" type="number" required placeholder="999" min="1" className="bg-background" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rating (1-5)</Label>
                <Input
                  name="rating_value"
                  type="number"
                  required
                  placeholder="4.5"
                  min="1"
                  max="5"
                  step="0.1"
                  className="bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label>Rating Count</Label>
                <Input
                  name="rating_count"
                  type="number"
                  required
                  placeholder="120"
                  min="0"
                  className="bg-background"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Switch name="discount_eligible" defaultChecked id="new-discount-eligible" />
              <Label htmlFor="new-discount-eligible">Discount Eligible</Label>
            </div>
            <div className="space-y-2">
              <Label>Item-Specific Discount Cap (%)</Label>
              <Input
                name="max_discount_override_pct"
                type="number"
                placeholder="Leave blank for global cap"
                min="0"
                max="100"
                className="bg-background"
              />
              <p className="text-xs text-muted-foreground">Overrides global AI policy limit if set.</p>
            </div>
            <Button type="submit" className="w-full">
              <Plus className="h-4 w-4 mr-2" /> Add Product
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
          <CardDescription>Manage your store's products.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {products.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-background hover:border-primary/50 transition-colors"
              >
                <div>
                  <h4 className="font-semibold text-foreground">{product.name}</h4>
                  <div className="flex gap-2 mt-1 text-sm text-muted-foreground">
                    <Badge variant="secondary">{product.category}</Badge>
                    <span>₹{Math.round(product.priceInPaise / 100).toLocaleString()}</span>
                    {!product.active && <Badge variant="destructive">Inactive</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setIsEditing(product)}>
                    <Edit className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setIsDeleting(product.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {products.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No products found.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!isEditing} onOpenChange={(open) => !open && setIsEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Product Name</Label>
              <Input name="name" required defaultValue={isEditing?.name} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                name="description"
                required
                defaultValue={isEditing?.description}
                className="resize-none h-20"
              />
            </div>
            <div className="space-y-2">
              <Label>Image URL</Label>
              <Input name="image_url" type="url" required defaultValue={isEditing?.imageUrl} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select name="category" defaultValue={isEditing?.category || 'Electronics'} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Electronics">Electronics</SelectItem>
                    <SelectItem value="Fashion/Dress">Fashion/Dress</SelectItem>
                    <SelectItem value="Furniture">Furniture</SelectItem>
                    <SelectItem value="Home & Household">Home & Household</SelectItem>
                    <SelectItem value="Subscriptions">Subscriptions</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Price (₹)</Label>
                <Input
                  name="price"
                  type="number"
                  required
                  defaultValue={isEditing ? Math.round(isEditing.priceInPaise / 100) : ''}
                  min="1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rating (1-5)</Label>
                <Input
                  name="rating_value"
                  type="number"
                  required
                  defaultValue={isEditing?.ratingValue}
                  min="1"
                  max="5"
                  step="0.1"
                />
              </div>
              <div className="space-y-2">
                <Label>Rating Count</Label>
                <Input
                  name="rating_count"
                  type="number"
                  required
                  defaultValue={isEditing?.ratingCount}
                  min="0"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Switch name="discount_eligible" defaultChecked={isEditing?.discountEligible} id="edit-discount-eligible" />
              <Label htmlFor="edit-discount-eligible">Discount Eligible</Label>
            </div>
            <div className="space-y-2">
              <Label>Item-Specific Discount Cap (%)</Label>
              <Input
                name="max_discount_override_pct"
                type="number"
                defaultValue={isEditing?.maxDiscountOverridePct || ''}
                placeholder="Leave blank for global cap"
                min="0"
                max="100"
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!isDeleting} onOpenChange={(open) => !open && setIsDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will soft-delete the product from the store.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AiSetupView() {
  const [formData, setFormData] = useState({
    maxContactsPerDay: 2,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    maxDiscountPct: 15,
    minOrderValue: 2000,
    voiceType: 'Female (Professional / Empathetic)',
    languageMode: 'Hinglish (Hindi + English blend)',
    personaPrompt:
      'You are a friendly, empathetic customer support agent for demo.pay. Speak in Hinglish. Offer a 10% discount if the customer hesitates.',
  });
  const [isSavingG, setIsSavingG] = useState(false);
  const [isSavingP, setIsSavingP] = useState(false);

  useEffect(() => {
    api('/api/policies')
      .then((res) => {
        if (res.policy) {
          setFormData({
            maxContactsPerDay: res.policy.maxContactsPer24h ?? 2,
            maxDiscountPct: res.policy.maxDiscountPct ?? 15,
            quietHoursStart: res.policy.quietHoursStart ?? '22:00',
            quietHoursEnd: res.policy.quietHoursEnd ?? '08:00',
            minOrderValue: Math.round((res.policy.minOrderValuePaise ?? 200000) / 100),
            voiceType: res.policy.voiceType ?? 'Female (Professional / Empathetic)',
            languageMode: res.policy.languageMode ?? 'Hinglish (Hindi + English blend)',
            personaPrompt: res.policy.personaPrompt ?? '',
          });
        }
      })
      .catch((err) => console.warn('Policy fetch error:', err));
  }, []);

  const handleSaveGuardrails = async () => {
    setIsSavingG(true);
    try {
      await api('/api/policies', {
        method: 'PUT',
        body: JSON.stringify({
          maxContactsPerDay: formData.maxContactsPerDay,
          maxDiscountPct: formData.maxDiscountPct,
          quietHoursStart: formData.quietHoursStart,
          quietHoursEnd: formData.quietHoursEnd,
          minOrderValue: formData.minOrderValue,
        }),
      });
      setTimeout(() => setIsSavingG(false), 800);
    } catch (err) {
      console.error('Failed to save policy guardrails:', err);
      setIsSavingG(false);
    }
  };

  const handleSavePersona = async () => {
    setIsSavingP(true);
    try {
      await api('/api/policies', {
        method: 'PUT',
        body: JSON.stringify({
          voiceType: formData.voiceType,
          languageMode: formData.languageMode,
          personaPrompt: formData.personaPrompt,
        }),
      });
      setTimeout(() => setIsSavingP(false), 800);
    } catch (err) {
      console.error('Failed to save persona:', err);
      setIsSavingP(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      <Card>
        <CardHeader>
          <CardTitle>Current Guardrails</CardTitle>
          <CardDescription>Deterministic AI policy constraints enforced before intervention.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Max Contacts / 24h</Label>
            <Select
              value={formData.maxContactsPerDay?.toString() ?? '2'}
              onValueChange={(val) => setFormData({ ...formData, maxContactsPerDay: parseInt(val) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select attempts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 attempt</SelectItem>
                <SelectItem value="2">2 attempts</SelectItem>
                <SelectItem value="3">3 attempts</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Maximum Authorized Discount (%)</Label>
              <span className="text-sm text-muted-foreground font-semibold">{formData.maxDiscountPct}% off</span>
            </div>
            <Slider
              value={[formData.maxDiscountPct ?? 15]}
              min={0}
              max={100}
              step={1}
              onValueChange={(val) => {
                const discount = Array.isArray(val) ? val[0] : val;
                setFormData((prev) => ({ ...prev, maxDiscountPct: Number(discount) }));
              }}
              className="py-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quiet Hours Start</Label>
              <Input
                type="time"
                value={formData.quietHoursStart}
                onChange={(e) => setFormData({ ...formData, quietHoursStart: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Quiet Hours End</Label>
              <Input
                type="time"
                value={formData.quietHoursEnd}
                onChange={(e) => setFormData({ ...formData, quietHoursEnd: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Min Order Value for Voice Call (₹)</Label>
            <Input
              type="number"
              value={formData.minOrderValue}
              onChange={(e) => setFormData({ ...formData, minOrderValue: parseInt(e.target.value) || 0 })}
              placeholder="e.g. 2000"
            />
          </div>
        </CardContent>
        <CardFooter className="border-t pt-6 bg-muted/20">
          <Button onClick={handleSaveGuardrails} className="w-full sm:w-auto">
            {isSavingG ? 'Saved!' : 'Save Policy'}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Persona Settings</CardTitle>
          <CardDescription>Voice, tone, and language configuration for customer interactions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Voice Type</Label>
            <Select
              value={formData.voiceType}
              onValueChange={(val) => setFormData({ ...formData, voiceType: val })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select voice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ritu (Sarvam Bulbul v3 - Female, Expressive Hinglish)">Ritu (Sarvam Bulbul v3 - Female, Expressive Hinglish)</SelectItem>
                <SelectItem value="priya (Sarvam Bulbul v3 - Female, Indian English)">Priya (Sarvam Bulbul v3 - Female, Indian English)</SelectItem>
                <SelectItem value="shubh (Sarvam Bulbul v3 - Male, Professional)">Shubh (Sarvam Bulbul v3 - Male, Professional)</SelectItem>
                <SelectItem value="arun (Sarvam Bulbul v3 - Male, Dynamic)">Arun (Sarvam Bulbul v3 - Male, Dynamic)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Language Mode</Label>
            <Select
              value={formData.languageMode}
              onValueChange={(val) => setFormData({ ...formData, languageMode: val })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Hinglish (Hindi + English blend)">Hinglish (Hindi + English blend)</SelectItem>
                <SelectItem value="Pure English (Indian Accent)">Pure English (Indian Accent)</SelectItem>
                <SelectItem value="Pure Hindi">Pure Hindi</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Agent Persona Prompt</Label>
            <Textarea
              className="h-32 resize-none"
              placeholder="Enter the system prompt for the AI agent..."
              value={formData.personaPrompt}
              onChange={(e) => setFormData({ ...formData, personaPrompt: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Custom instructions guiding negotiation, tone, and recovery strategy.
            </p>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-6 bg-muted/20">
          <Button onClick={handleSavePersona} className="w-full sm:w-auto">
            {isSavingP ? 'Synced!' : 'Save & Sync'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function CaseDetailDialog({ caseId, open, onOpenChange }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const triggerCall = useVoiceCallStore((state) => state.triggerCall);

  useEffect(() => {
    if (!caseId || !open) {
      setDetail(null);
      return;
    }
    setLoading(true);
    api(`/api/cases/${caseId}`)
      .then((res) => setDetail(res.case))
      .catch((err) => console.error('Case detail fetch error:', err))
      .finally(() => setLoading(false));
  }, [caseId, open]);

  const handleLaunchVoiceCall = () => {
    if (!detail) return;
    onOpenChange(false);
    const amountInRs = Math.round((detail.atRiskAmountInPaise || 249900) / 100);
    const custName = detail.customer?.name || 'Customer';
    triggerCall({
      caseId: detail.id,
      customerName: custName,
      productName: 'Store Order',
      amountInRs,
      discountPct: 0,
      agentName: 'Aarav',
      agentGender: 'male',
      script: `Namaste ${custName}! Main Demo.pay recovery desk se baat kar raha hoon. Maine dekha aapka ₹${amountInRs.toLocaleString()} ka order complete nahi ho paya tha. Kya main payment complete karne mein aapki koi madad kar sakta hoon?`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4 mr-6">
            <DialogTitle className="text-xl">Case Details</DialogTitle>
            {detail && <CaseStatusBadge status={detail.status} />}
          </div>
          <DialogDescription className="text-xs font-mono">
            {caseId}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
            <RotateCw className="h-5 w-5 animate-spin" /> Loading case telemetry...
          </div>
        ) : detail ? (
          <div className="space-y-6 py-2">
            {/* Direct Voice Call Trigger Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="space-y-0.5">
                <h5 className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <PhoneCall className="h-3.5 w-3.5" /> Interactive AI Voice Recovery
                </h5>
                <p className="text-[11px] text-muted-foreground">Test live conversation, persuasion & promise recording.</p>
              </div>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs h-8 whitespace-nowrap"
                onClick={handleLaunchVoiceCall}
              >
                <Phone className="h-3.5 w-3.5 animate-pulse" /> Launch AI Call
              </Button>
            </div>

            {/* Customer & Order Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/30 p-3 rounded-lg border text-sm">
              <div>
                <span className="text-xs text-muted-foreground block">Customer</span>
                <span className="font-semibold">{detail.customer?.name ?? 'Guest'}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Contact</span>
                <span className="font-mono text-xs truncate block">{detail.customer?.phone || detail.customer?.email || 'N/A'}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">At Risk</span>
                <span className="font-semibold text-destructive">
                  ₹{(detail.atRiskAmountInPaise / 100).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Trigger Mode</span>
                <span className="font-medium">{detail.triggerLabel}</span>
              </div>
            </div>

            {/* AI Diagnosis Transcript */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Clock className="h-4 w-4 text-primary" /> AI Diagnosis & Reasoning Transcript
              </h4>
              <div className="bg-muted/40 p-3 rounded-lg border space-y-2">
                {detail.logs && detail.logs.length > 0 ? (
                  detail.logs.map((log) => (
                    <div key={log.id} className="text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                          {log.level}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-foreground leading-relaxed pl-1">{log.message}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground italic">No diagnostic logs recorded yet.</p>
                )}
              </div>
            </div>

            {/* Recovery Actions Dispatched */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Zap className="h-4 w-4 text-amber-500" /> Dispatched Interventions
              </h4>
              <div className="space-y-2">
                {detail.actions && detail.actions.length > 0 ? (
                  detail.actions.map((act) => (
                    <div key={act.id} className="p-3 border rounded-lg bg-background text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="font-mono font-bold">
                          {act.channel}
                        </Badge>
                        <span className="text-muted-foreground text-[10px]">
                          Outcome: <strong className="text-foreground">{act.outcome}</strong>
                        </span>
                      </div>
                      <p className="text-foreground">{act.rationale}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground italic p-2 border rounded-lg">
                    No outbound recovery actions dispatched yet.
                  </p>
                )}
              </div>
            </div>

            {/* Payment Promises */}
            {detail.promises && detail.promises.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-600" /> Payment Promises Recorded
                </h4>
                <div className="space-y-2">
                  {detail.promises.map((p) => (
                    <div key={p.id} className="p-3 border rounded-lg bg-green-500/5 text-xs flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-green-800 dark:text-green-300">
                          Promised for: {new Date(p.promisedFor).toLocaleString()}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          Captured via: {p.source}
                        </span>
                      </div>
                      <Badge variant="outline" className="uppercase text-[10px]">
                        {p.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Case not found.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DashboardView() {
  const kpis = useLiveFeedStore((state) => state.kpis);
  const events = useLiveFeedStore((state) => state.events);
  const updateKpis = useLiveFeedStore((state) => state.updateKpis);
  const addEvent = useLiveFeedStore((state) => state.addEvent);

  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [isSimulatingBatch, setIsSimulatingBatch] = useState(false);
  const [batchCount, setBatchCount] = useState('10');

  const fetchKpisAndCases = () => {
    api('/api/analytics/summary')
      .then((data) => {
        updateKpis({
          atRisk: data.atRisk,
          recovered: data.recovered,
          activeInterventions: data.activeInterventions,
          recoveryRate: data.recoveryRate,
        });
      })
      .catch((err) => console.warn('KPI summary fetch error:', err));

    api('/api/cases')
      .then((data) => setCases(data.cases))
      .catch((err) => console.warn('Cases fetch error:', err))
      .finally(() => setLoadingCases(false));
  };

  useEffect(() => {
    fetchKpisAndCases();

    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
    let sse;
    try {
      sse = new EventSource(`${baseUrl}/api/stream/events`);
      sse.addEventListener('event', (msg) => {
        try {
          const parsed = JSON.parse(msg.data);
          addEvent({
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            type: parsed.type || 'info',
            message:
              parsed.message ||
              `Event: ${parsed.type}${parsed.channel ? ` via ${parsed.channel}` : ''}${
                parsed.caseId ? ` for Case ${parsed.caseId.slice(0, 8)}...` : ''
              }`,
          });
          fetchKpisAndCases();
        } catch (e) {
          console.warn('SSE parse error:', e);
        }
      });
    } catch (sseErr) {
      console.warn('SSE connection failed:', sseErr);
    }

    return () => {
      if (sse) sse.close();
    };
  }, []);

  const handleRunBatch = async () => {
    setIsSimulatingBatch(true);
    try {
      const count = parseInt(batchCount, 10) || 10;
      await api('/api/simulate/batch', {
        method: 'POST',
        body: JSON.stringify({ count }),
      });
      fetchKpisAndCases();
    } catch (err) {
      console.error('Batch simulation error:', err);
    } finally {
      setIsSimulatingBatch(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
      {/* KPI Cards */}
      <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue at Risk (Active)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{kpis.atRisk?.toLocaleString() ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Pending recovery intervention</p>
          </CardContent>
        </Card>
        <Card className="bg-green-500/5 border-green-500/20">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-medium text-muted-foreground">Recovered Revenue (Total)</CardTitle>
              <Badge variant="outline" className="text-green-700 bg-green-50 text-[10px]">
                {kpis.recoveryRate ?? 0}% Rate
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">₹{kpis.recovered?.toLocaleString() ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Successfully rescued orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Interventions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.activeInterventions ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Calls, WhatsApp & Emails dispatched</p>
          </CardContent>
        </Card>
      </div>

      {/* Batch Simulation Bar (Phase 10) */}
      <div className="lg:col-span-3">
        <Card className="bg-gradient-to-r from-muted/50 to-primary/5 border-border">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-sm">Batch Stress & Load Simulator (Phase 10)</h4>
                <p className="text-xs text-muted-foreground">
                  Simulate mixed high-volume checkout failures through diagnosis, guardrails & recovery.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select value={batchCount} onValueChange={setBatchCount}>
                <SelectTrigger className="w-[120px] bg-background">
                  <SelectValue placeholder="Count" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 Events</SelectItem>
                  <SelectItem value="25">25 Events</SelectItem>
                  <SelectItem value="50">50 Events</SelectItem>
                  <SelectItem value="100">100 Events</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleRunBatch} disabled={isSimulatingBatch} className="whitespace-nowrap">
                {isSimulatingBatch ? (
                  <>
                    <RotateCw className="h-4 w-4 mr-2 animate-spin" /> Simulating...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" /> Run Batch
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Audit Table */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle>Intervention Audit Log</CardTitle>
            <CardDescription>Click any row to inspect real-time AI reasoning & actions.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchKpisAndCases} className="h-8 px-2 text-xs">
            <RotateCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingCases ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Loading audit records...
                  </TableCell>
                </TableRow>
              ) : cases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No recovery cases recorded yet. Trigger a simulate button or run a batch above!
                  </TableCell>
                </TableRow>
              ) : (
                cases.map((c) => (
                  <TableRow
                    key={c.id}
                    onClick={() => setSelectedCaseId(c.id)}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <TableCell className="font-medium text-foreground text-xs">{c.time}</TableCell>
                    <TableCell className="text-sm font-semibold">{c.user}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.trigger}</TableCell>
                    <TableCell>
                      <CaseStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-right font-medium">₹{c.amount.toLocaleString()}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Live Feed */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Agent Live Feed</CardTitle>
          <CardDescription>Real-time event stream from SSE.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[380px] w-full rounded-md border bg-muted/20 p-4">
            {events.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground italic">
                Listening for real-time recovery events...
              </div>
            ) : (
              <div className="space-y-4">
                {events.map((evt) => (
                  <div key={evt.id} className="flex flex-col space-y-1 text-sm border-b pb-2 last:border-0">
                    <span className="font-semibold text-primary text-xs uppercase tracking-wider">{evt.type}</span>
                    <span className="text-muted-foreground text-xs">{evt.message}</span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <CaseDetailDialog
        caseId={selectedCaseId}
        open={Boolean(selectedCaseId)}
        onOpenChange={(open) => !open && setSelectedCaseId(null)}
      />
    </div>
  );
}

export default function Admin() {
  return (
    <div className="flex flex-col w-full max-w-7xl mx-auto pb-12 gap-0">
      <div className="sticky top-0 z-10 bg-background pt-6 pb-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg border mb-4 shadow-sm">
          <div>
            <h1 className="font-bold text-2xl text-foreground">Admin Portal</h1>
            <p className="text-sm text-muted-foreground">Manage inventory, guardrails, and monitor AI agents.</p>
          </div>
          <KillSwitch />
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <div className="sticky top-[108px] z-10 bg-background pb-2 pt-2 border-b">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="policy">AI Setup</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
          </TabsList>
        </div>
        <div className="min-h-[600px] mt-4">
          <TabsContent value="dashboard" className="mt-6 m-0">
            <DashboardView />
          </TabsContent>
          <TabsContent value="policy" className="mt-6 m-0">
            <AiSetupView />
          </TabsContent>
          <TabsContent value="inventory" className="mt-6 m-0">
            <AddItemView />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
