"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Rocket,
  ShieldCheck,
  Sparkles,
  PlugZap,
  BarChart3,
  Database,
  Timer,
  Target,
  Megaphone,
  LayoutPanelLeft,
} from "lucide-react";

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white via-white to-gray-50">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-gradient-to-br from-violet-100 via-white to-white blur-3xl" />
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-6 py-24 md:grid-cols-2 md:py-28">
        <div className="flex flex-col justify-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">
            <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
            Built for affiliate marketers
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Turn more visitors into commissions
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-gray-600">
            Offerbase helps affiliates personalize pages in real time. Understand intent, highlight the most relevant offer, and trigger it when visitors are most likely to convert.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button className="bg-gray-900 text-white hover:bg-gray-800">Start free</Button>
            <Button variant="outline">Book a demo</Button>
          </div>
          <div className="mt-6 flex items-center gap-4 text-xs text-gray-500">
            <div className="flex -space-x-2 overflow-hidden">
              <span className="inline-block h-7 w-7 rounded-full bg-gray-200" />
              <span className="inline-block h-7 w-7 rounded-full bg-gray-200" />
              <span className="inline-block h-7 w-7 rounded-full bg-gray-200" />
            </div>
            <span>Trusted by growing affiliate teams</span>
          </div>
        </div>
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <Sparkles className="h-5 w-5 text-violet-600" />
              Highlights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {["Personalize per visitor", "Engage at the right moment", "Match the best offer", "Measure real impact"].map((t, i) => (
              <div key={t} className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-gray-100 text-gray-700">{i + 1}</Badge>
                  <span className="text-sm text-gray-800">{t}</span>
                </div>
                <Check className="h-4 w-4 text-emerald-600" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function ChatShowcase() {
  return (
    <section className="bg-gray-50 py-24 md:py-28">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-6 md:grid-cols-3">
        <div className="hidden md:block" />
        <Card className="col-span-2 border-gray-200">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Badge variant="secondary" className="bg-gray-100 text-gray-700">Live preview</Badge>
              <span>On‑page assistant</span>
            </div>
            <CardTitle className="text-base text-gray-900">Offerbase Helper</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Conversation */}
            <div className="flex flex-col gap-3">
              <div className="self-start max-w-[80%] rounded-2xl bg-white px-4 py-2 text-sm text-gray-800 shadow-sm">Hey! I’m scouting for the best web‑builder deal.</div>
              <div className="self-end max-w-[80%] rounded-2xl bg-gray-900 px-4 py-2 text-sm text-white">Got it. Based on this page, here’s a top pick with a limited offer.</div>
              <div className="self-start max-w-[80%] rounded-2xl bg-white px-4 py-2 text-sm text-gray-800 shadow-sm">Perfect. Show me the details.</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function HowItWorks() {
  const categories = [
    { key: "homepage", label: "Homepage" },
    { key: "blog", label: "Blog post" },
    { key: "review", label: "Review page" },
    { key: "compare", label: "Comparison" },
  ];
  const items: Record<string, string[]> = {
    homepage: [
      "Detect intent from page context",
      "Surface a relevant headline offer",
      "Use gentle prompts to engage",
      "Track clicks and follow‑through",
    ],
    blog: [
      "Read the post’s topic",
      "Suggest products that fit the theme",
      "Offer in‑content tips or a subtle box",
      "Measure time on page uplift",
    ],
    review: [
      "Highlight the top benefits",
      "Show a clear CTA with your link",
      "Answer common pre‑click questions",
      "Capture intent before they bounce",
    ],
    compare: [
      "Tailor recommendation to the visitor’s use‑case",
      "Call out decisive differences",
      "Place the ‘best for you’ offer",
      "Record which messages convert",
    ],
  };

  return (
    <section className="bg-white py-24 md:py-28">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="mb-6 text-center">
          <h2 className="text-3xl font-semibold text-gray-900 md:text-4xl">How does it work in practice?</h2>
          <p className="mt-3 text-gray-600">Choose a page type to see what Offerbase optimizes.</p>
        </div>

        <Tabs defaultValue="marketing" className="w-full">
          <div className="flex items-center justify-center">
            <TabsList className="mb-6 grid grid-cols-4">
              {categories.map((c) => (
                <TabsTrigger key={c.key} value={c.key} className="capitalize">{c.label}</TabsTrigger>
              ))}
            </TabsList>
          </div>

          {categories.map((c) => (
            <TabsContent key={c.key} value={c.key} className="mt-0">
              <Card className="border-gray-200">
                <CardContent className="grid grid-cols-1 gap-8 p-6 md:grid-cols-2">
                  <ul className="space-y-3">
                    {items[c.key].map((it) => (
                      <li key={it} className="flex items-start gap-3 text-sm text-gray-700">
                        <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                        {it}
                      </li>
                    ))}
                  </ul>
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
                    Placeholder for contextual UI preview
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}

function DarkCallout() {
  return (
    <section className="relative overflow-hidden bg-gray-950 py-28 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_50%_-10rem,#3b82f622,transparent)]" />
      <div className="mx-auto w-full max-w-4xl px-6 text-center">
        <Badge variant="secondary" className="mb-4 bg-white/10 text-white">Benchmark</Badge>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your competitors are already personalizing</h2>
        <p className="mx-auto mt-3 max-w-2xl text-gray-300">Don’t leave conversions on the table. Offerbase helps you show the right offer at the right moment—without slowing your site.</p>
      </div>
    </section>
  );
}

function LeftFeature() {
  const bullets = [
    { icon: Megaphone, text: "Helpful prompts—not pop‑up spam" },
    { icon: LayoutPanelLeft, text: "Inline, floating, or sidebar placements" },
    { icon: BarChart3, text: "Clear reporting on clicks and conversions" },
  ];
  return (
    <section className="bg-white py-24 md:py-28">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-6 md:grid-cols-2">
        <div>
          <Badge variant="secondary" className="mb-3 bg-gray-100 text-gray-700">Personalization that helps</Badge>
          <h3 className="text-3xl font-semibold text-gray-900 md:text-4xl">Give every visitor a reason to click</h3>
          <p className="mt-3 text-gray-600">Offerbase adapts messages and placements to your content and visitor context, so the most relevant offer is always in view.</p>
          <ul className="mt-6 space-y-3">
            {bullets.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-gray-700">
                <Icon className="mt-0.5 h-5 w-5 text-violet-600" /> {text}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex gap-3">
            <Button className="bg-gray-900 text-white hover:bg-gray-800">Start now</Button>
            <Button variant="outline">See examples</Button>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
          Visual preview placeholder
        </div>
      </div>
    </section>
  );
}

function SetupSteps() {
  const steps = [
    { title: "Install", text: "Paste the lightweight script on your site.", icon: PlugZap },
    { title: "Add offers", text: "Create your links and messages in minutes.", icon: Database },
    { title: "Launch", text: "Go live and track performance instantly.", icon: Rocket },
  ];
  return (
    <section className="bg-gray-50 py-24 md:py-28">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="mb-8 text-center">
          <Badge variant="secondary" className="mb-2 bg-gray-100 text-gray-700">No heavy setup</Badge>
          <h3 className="text-3xl font-semibold text-gray-900 md:text-4xl">How easy is it to set up?</h3>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map(({ title, text, icon: Icon }, i) => (
            <Card key={title} className="border-gray-200">
              <CardContent className="p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-sm text-gray-500">Step {i + 1}</div>
                <h4 className="text-lg font-medium text-gray-900">{title}</h4>
                <p className="mt-2 text-sm text-gray-600">{text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function Safeguards() {
  const bullets = [
    "Fail‑closed defaults—widgets hide when settings are missing",
    "No layout flicker—rules evaluated before inject",
    "Lightweight by design and privacy‑friendly",
    "Resilient to API timeouts and network issues",
  ];
  return (
    <section className="bg-white py-24 md:py-28">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-6 md:grid-cols-2">
        <div>
          <Badge variant="secondary" className="mb-3 bg-gray-100 text-gray-700">Performance & resilience</Badge>
          <h3 className="text-3xl font-semibold text-gray-900 md:text-4xl">Built to protect the experience</h3>
          <p className="mt-3 text-gray-600">Offerbase follows practical rules to keep pages fast and stable across devices and languages.</p>
          <ul className="mt-6 space-y-3">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm text-gray-700">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" /> {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center text-sm text-gray-500">
          Subtle grid illustration placeholder
        </div>
      </div>
    </section>
  );
}

function FeatureGrid() {
  const features = [
    { title: "Right offer, right time", icon: Target },
    { title: "Inline prompts & banners", icon: Megaphone },
    { title: "Smart placement rules", icon: Timer },
    { title: "Conversion insights", icon: BarChart3 },
    { title: "Lightweight embed", icon: PlugZap },
    { title: "Safe by default", icon: ShieldCheck },
  ];
  return (
    <section className="bg-gray-50 py-24 md:py-28">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="mb-8 text-center">
          <Badge variant="secondary" className="mb-2 bg-gray-100 text-gray-700">Covers your use‑cases</Badge>
          <h3 className="text-3xl font-semibold text-gray-900 md:text-4xl">Offerbase does it all</h3>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
          {features.map(({ title, icon: Icon }) => (
            <Card key={title} className="border-gray-200">
              <CardContent className="p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h4 className="text-base font-medium text-gray-900">{title}</h4>
                <p className="mt-2 text-sm text-gray-600">Tools that help affiliates increase conversion rate and time on site.</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const qa = [
    { q: "Will it work with my CMS?", a: "Yes. Keep your current stack—add a single script tag and configure from the dashboard." },
    { q: "Is it international?", a: "Yes. It’s designed for global audiences and adapts to the visitor’s context." },
  ];
  return (
    <section className="bg-white py-24 md:py-28">
      <div className="mx-auto w-full max-w-3xl px-6">
        <h3 className="mb-6 text-center text-2xl font-semibold text-gray-900">Frequently asked</h3>
        <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
          {qa.map((item, i) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-medium text-gray-800">
                {item.q}
                <span className="ml-4 text-gray-500 group-open:rotate-45">+</span>
              </summary>
              <div className="border-t border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white py-14">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <img src="/offerbase-logo.svg" alt="Offerbase" className="h-6 w-auto" />
            <span className="text-sm text-gray-600">Personalized conversions for affiliates</span>
          </div>
          <nav className="flex flex-wrap gap-5 text-sm text-gray-600">
            <a className="hover:text-gray-900" href="#">Product</a>
            <a className="hover:text-gray-900" href="#">Docs</a>
            <a className="hover:text-gray-900" href="#">Pricing</a>
            <a className="hover:text-gray-900" href="#">Contact</a>
          </nav>
        </div>
        <div className="mt-6 text-xs text-gray-500">© {new Date().getFullYear()} Offerbase. All rights reserved.</div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen">
      <Hero />
      <ChatShowcase />
      <HowItWorks />
      <DarkCallout />
      <LeftFeature />
      <SetupSteps />
      <Safeguards />
      <FeatureGrid />
      <FAQ />
      <Footer />
    </main>
  );
}
