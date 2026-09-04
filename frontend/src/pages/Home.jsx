import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Search, Bot, Phone, CheckCircle, ShieldAlert, Briefcase } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const flowSteps = [
  { id: 1, title: 'Detect', icon: Search, desc: 'Listen to Razorpay webhooks for payment failures or checkout drops.' },
  { id: 2, title: 'Diagnose', icon: Bot, desc: 'AI agents analyze the root cause and determine the best intervention.' },
  { id: 3, title: 'Intervene', icon: Phone, desc: 'Reach out via Sarvam AI Voice (Hinglish) or Meta WhatsApp immediately.' },
  { id: 4, title: 'Recover', icon: CheckCircle, desc: 'Customer completes payment via recovery link. Revenue secured.' },
];

const techStack = [
  { title: 'Razorpay', desc: 'Core payment gateway, test mode API, and real-time HMAC-signed webhooks for event triggers.' },
  { title: 'Google ADK', desc: 'Gemini-flash models orchestrating diagnosis and interactive voice reasoning agents.' },
  { title: 'Sarvam AI & Meta', desc: 'Bulbul v3 neural voice synthesis for real-time recovery calls and Meta WhatsApp Cloud API.' },
];

const walkthroughSteps = [
  'Navigate to the Store tab and enter your details (with optional phone for WhatsApp recovery).',
  'Click on any product and hit "Add to Bag" to open the Checkout Drawer.',
  'Instead of a real payment, click one of the "Simulate Outcome" buttons to inject a synthetic failure.',
  'Wait ~3 seconds. An interactive AI Voice Agent will call you right in the browser, offering a discount and convincing you to recover the order.',
  'Navigate to the Admin tab to see the live KPI updates, Audit Table, and Agent Reasoning traces.',
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-12">
      {/* Hero Section */}
      <section className="text-center space-y-4 pt-24">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground">
          Stop revenue leakage. <br className="hidden md:inline" />
          <span className="text-primary">Autonomously.</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          An autonomous, policy-bounded revenue recovery engine that detects failures,
          diagnoses root causes, and executes compliant interventions via voice and WhatsApp.
        </p>
      </section>

      {/* Flow Diagram */}
      <section>
        <motion.div
          className="grid grid-cols-1 md:grid-cols-4 gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {flowSteps.map((step, index) => (
            <motion.div key={step.id} variants={itemVariants} className="relative">
              <Card className="h-full relative z-10 border-muted">
                <CardHeader className="pb-2">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </CardContent>
              </Card>
              {index < flowSteps.length - 1 && (
                <div className="hidden md:block absolute top-1/2 -right-6 z-0 -translate-y-1/2 text-muted">
                  <ArrowRight className="h-8 w-8" />
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </section>

      <Separator />

      {/* How We Built It */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">How We Built It</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {techStack.map((tech, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle>{tech.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{tech.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Walkthrough */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">How to Test This Yourself</h2>
        <div className="grid gap-3">
          {walkthroughSteps.map((step, i) => (
            <div key={i} className="flex gap-4 p-4 rounded-lg bg-card border">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                {i + 1}
              </div>
              <p className="text-sm pt-1.5 text-card-foreground">{step}</p>
            </div>
          ))}
        </div>
        <div className="pt-4 flex justify-center">
          <Button asChild size="lg">
            <Link to="/store">Go to Store & Start Testing</Link>
          </Button>
        </div>
      </section>

      <Separator />

      {/* Safety & B2B Note */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-destructive/5 border-destructive/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Safety & Guardrails
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              This engine is bounded. It strictly enforces quiet hours, contact frequency caps, and maximum discount limits.
            </p>
            <p>
              A <strong>Global Kill Switch</strong> is pinned to the top of the Admin tab, allowing operators to instantly halt all agent activity.
            </p>
            <Button variant="link" asChild className="p-0 h-auto text-destructive">
              <Link to="/admin">View Admin Guardrails →</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-secondary/50 border-secondary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-secondary-foreground" />
              B2B Receivables (Roadmap)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              While this demo focuses on B2C checkout abandonment and immediate payment failures, the exact same autonomous reasoning engine can be applied to B2B invoice chasing.
            </p>
            <p className="mt-2">
              This involves parsing PDF invoices, tracking net-30 terms, and initiating polite follow-up emails before escalating to phone calls. Planned for v2.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
