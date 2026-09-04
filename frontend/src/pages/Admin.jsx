import React, { useState, useEffect } from 'react';
import { ShieldAlert, Plus, Edit, Trash2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePolicyStore, useLiveFeedStore } from '@/store';

import { api } from '@/lib/api';

// Initial products state is now empty, fetched dynamically
const INITIAL_PRODUCTS = [];

function KillSwitch() {
  const [isActive, setIsActive] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const toggleSwitch = () => {
    setShowConfirm(true);
  };

  const confirmToggle = () => {
    setIsActive(!isActive);
    setShowConfirm(false);
    console.log(`Global Kill Switch is now: ${!isActive ? 'ACTIVE (Agents Halted)' : 'INACTIVE (Agents Running)'}`);
  };

  return (
    <>
      <div className="flex items-center gap-4 bg-muted/50 p-2 px-4 rounded-lg border border-border">
        <div className="flex flex-col">
          <span className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <ShieldAlert className="h-4 w-4 text-destructive" />
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
                ? "You are about to re-enable AI agents. They will resume processing any queued failures."
                : "You are about to HALT all AI agents. No new calls or messages will be sent until re-enabled."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmToggle}
              className={!isActive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {isActive ? "Re-enable Agents" : "Halt Agents"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AddItemView() {
  const [products, setProducts] = useState(INITIAL_PRODUCTS);
  const [isDeleting, setIsDeleting] = useState(null); // id of product to delete
  const [isEditing, setIsEditing] = useState(null); // product object to edit

  useEffect(() => {
    api('/api/products').then(data => setProducts(data.products)).catch(console.error);
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
      maxDiscountOverridePct: formData.get('max_discount_override_pct') ? parseInt(formData.get('max_discount_override_pct')) : null,
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
      maxDiscountOverridePct: formData.get('max_discount_override_pct') ? parseInt(formData.get('max_discount_override_pct')) : null,
      ratingValue: parseFloat(formData.get('rating_value')) || 0,
      ratingCount: parseInt(formData.get('rating_count')) || 0,
      imageUrl: formData.get('image_url') || '',
    };
    try {
      const res = await api(`/api/products/${isEditing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setProducts(products.map(p => p.id === isEditing.id ? res.product : p));
      setIsEditing(null);
    } catch (err) {
      console.error(err);
    }
  };

  const confirmDelete = async () => {
    try {
      await api(`/api/products/${isDeleting}`, { method: 'DELETE' });
      setProducts(products.map(p => p.id === isDeleting ? { ...p, active: false } : p));
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
              <Textarea name="description" required placeholder="Short description..." className="bg-background resize-none h-20" />
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
                <Input name="rating_value" type="number" required placeholder="4.5" min="1" max="5" step="0.1" className="bg-background" />
              </div>
              <div className="space-y-2">
                <Label>Rating Count</Label>
                <Input name="rating_count" type="number" required placeholder="120" min="0" className="bg-background" />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Switch name="discount_eligible" defaultChecked id="new-discount-eligible" />
              <Label htmlFor="new-discount-eligible">Discount Eligible</Label>
            </div>
            <div className="space-y-2">
              <Label>Item-Specific Discount Cap (%)</Label>
              <Input name="max_discount_override_pct" type="number" placeholder="Leave blank for global cap" min="0" max="100" className="bg-background" />
              <p className="text-xs text-muted-foreground">Overrides the global AI policy limit if set.</p>
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
            {products.map(product => (
              <div key={product.id} className="flex items-center justify-between p-4 border rounded-lg bg-background hover:border-primary/50 transition-colors">
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
                  <Button variant="ghost" size="icon" className="hover:text-destructive hover:bg-destructive/10" onClick={() => setIsDeleting(product.id)}>
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

      {/* Edit Dialog */}
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
              <Textarea name="description" required defaultValue={isEditing?.description} className="resize-none h-20" />
            </div>
            <div className="space-y-2">
              <Label>Image URL</Label>
              <Input name="image_url" type="url" required defaultValue={isEditing?.imageUrl} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select name="category" defaultValue={isEditing?.category || "Electronics"} required>
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
                <Input name="price" type="number" required defaultValue={isEditing ? Math.round(isEditing.priceInPaise / 100) : ''} min="1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rating (1-5)</Label>
                <Input name="rating_value" type="number" required defaultValue={isEditing?.ratingValue} min="1" max="5" step="0.1" />
              </div>
              <div className="space-y-2">
                <Label>Rating Count</Label>
                <Input name="rating_count" type="number" required defaultValue={isEditing?.ratingCount} min="0" />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Switch name="discount_eligible" defaultChecked={isEditing?.discountEligible} id="edit-discount-eligible" />
              <Label htmlFor="edit-discount-eligible">Discount Eligible</Label>
            </div>
            <div className="space-y-2">
              <Label>Item-Specific Discount Cap (%)</Label>
              <Input name="max_discount_override_pct" type="number" defaultValue={isEditing?.maxDiscountOverridePct || ''} placeholder="Leave blank for global cap" min="0" max="100" />
            </div>
            <DialogFooter className="pt-4">
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!isDeleting} onOpenChange={(open) => !open && setIsDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently remove the product from the store.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AiSetupView() {
  const policy = usePolicyStore(state => state.policy);
  const updatePolicy = usePolicyStore(state => state.updatePolicy);
  const [formData, setFormData] = useState(policy);
  const [isSavingG, setIsSavingG] = useState(false);
  const [isSavingP, setIsSavingP] = useState(false);

  useEffect(() => {
    setFormData(policy);
  }, [policy]);

  const handleSaveGuardrails = () => {
    setIsSavingG(true);
    updatePolicy(formData);
    setTimeout(() => setIsSavingG(false), 500);
  };

  const handleSavePersona = () => {
    setIsSavingP(true);
    updatePolicy(formData);
    setTimeout(() => setIsSavingP(false), 500);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      <Card>
        <CardHeader>
          <CardTitle>Current Guardrails</CardTitle>
          <CardDescription>AI agent behavior boundaries.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Max Contacts / 24h</Label>
            <Select 
              value={formData.maxContactsPerDay.toString()} 
              onValueChange={(val) => setFormData({...formData, maxContactsPerDay: parseInt(val)})}
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
              value={formData.maxDiscountPct} 
              min={0} max={100} step={1}
              onValueChange={(val) => setFormData({...formData, maxDiscountPct: val})}
              className="py-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quiet Hours Start</Label>
              <Input type="time" value={formData.quietHoursStart} onChange={(e) => setFormData({...formData, quietHoursStart: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Quiet Hours End</Label>
              <Input type="time" value={formData.quietHoursEnd} onChange={(e) => setFormData({...formData, quietHoursEnd: e.target.value})} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Min Order Value for Voice Call (₹)</Label>
            <Input 
              type="number" 
              value={formData.minOrderValue} 
              onChange={(e) => setFormData({...formData, minOrderValue: parseInt(e.target.value) || 0})}
              placeholder="e.g. 2000"
            />
          </div>

        </CardContent>
        <CardFooter className="border-t pt-6 bg-muted/20">
           <Button onClick={handleSaveGuardrails} className="w-full sm:w-auto">
             {isSavingG ? "Saved!" : "Save Policy"}
           </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Persona Settings</CardTitle>
          <CardDescription>Voice, tone, and language configuration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Voice Type</Label>
            <Select 
              value={formData.voiceType} 
              onValueChange={(val) => setFormData({...formData, voiceType: val})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select voice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Female (Professional / Empathetic)">Aditi (Polly - Female, Natural Hinglish)</SelectItem>
                <SelectItem value="Raveena (Polly - Female, Indian English)">Raveena (Polly - Female, Indian English)</SelectItem>
                <SelectItem value="Neural2-B (Google - Male, Professional)">Neural2-B (Google - Male, Professional)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Language Mode</Label>
            <Select 
              value={formData.languageMode} 
              onValueChange={(val) => setFormData({...formData, languageMode: val})}
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
              onChange={(e) => setFormData({...formData, personaPrompt: e.target.value})}
            />
            <p className="text-xs text-muted-foreground mt-1">Provide custom instructions on how the agent should speak and negotiate.</p>
          </div>

        </CardContent>
        <CardFooter className="border-t pt-6 bg-muted/20">
           <Button onClick={handleSavePersona} className="w-full sm:w-auto">
             {isSavingP ? "Synced!" : "Save & Sync"}
           </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// Mock audit data
const AUDIT_LOGS = [
  { id: 'a_1', time: '10:42 AM', user: 'Rahul Verma', trigger: 'Bank Timeout', status: 'Recovered', amount: 8999 },
  { id: 'a_2', time: '09:15 AM', user: 'Priya Sharma', trigger: 'Insufficient Funds', status: 'Failed (Retry later)', amount: 0 },
  { id: 'a_3', time: 'Yesterday', user: 'Amit Patel', trigger: 'UPI App Unreachable', status: 'Recovered', amount: 3499 },
];

function DashboardView() {
  const kpis = useLiveFeedStore(state => state.kpis);
  const events = useLiveFeedStore(state => state.events);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
      {/* KPI Cards */}
      <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue at Risk (Active)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{kpis.atRisk.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="bg-green-500/5 border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recovered Revenue (Total)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">₹{kpis.recovered.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Interventions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.activeInterventions}</div>
          </CardContent>
        </Card>
      </div>

      {/* Audit Table */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Intervention Audit Log</CardTitle>
          <CardDescription>Recent agent actions and outcomes.</CardDescription>
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
              {AUDIT_LOGS.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium text-foreground">{log.time}</TableCell>
                  <TableCell>{log.user}</TableCell>
                  <TableCell>{log.trigger}</TableCell>
                  <TableCell>
                    <Badge variant={log.status === 'Recovered' ? 'default' : 'secondary'} className={log.status === 'Recovered' ? 'bg-green-500 hover:bg-green-600 text-white' : ''}>
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">₹{log.amount.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Live Feed */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Agent Live Feed</CardTitle>
          <CardDescription>Real-time event stream.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] w-full rounded-md border bg-muted/20 p-4">
            {events.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground italic">
                Listening for webhook events...
              </div>
            ) : (
              <div className="space-y-4">
                {events.map((evt) => (
                  <div key={evt.id} className="flex flex-col space-y-1 text-sm border-b pb-2 last:border-0">
                    <span className="font-semibold text-primary">{evt.type.toUpperCase()}</span>
                    <span className="text-muted-foreground">{evt.message}</span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
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

      <Tabs defaultValue="inventory" className="w-full">
        <div className="sticky top-[108px] z-10 bg-background pb-2 pt-2 border-b">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="policy">AI Setup</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          </TabsList>
        </div>
        <div className="min-h-[600px] mt-4">
          <TabsContent value="inventory" className="mt-6 m-0">
            <AddItemView />
          </TabsContent>
          <TabsContent value="policy" className="mt-6 m-0">
            <AiSetupView />
          </TabsContent>
          <TabsContent value="dashboard" className="mt-6 m-0">
            <DashboardView />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
