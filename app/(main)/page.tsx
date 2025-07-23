import HeroSection from '@/components/homepage/HeroSection';
import FeaturesSection from '@/components/homepage/FeaturesSection';
import ProductDemo from '@/components/homepage/ProductDemo';
import BenefitsSection from '@/components/homepage/BenefitsSection';
import TechStack from '@/components/homepage/TechStack';
import PricingSection from '@/components/homepage/PricingSection';
import Footer from '@/components/homepage/Footer';

export default function Home() {
  return (
    <main className="min-h-screen">
      <HeroSection />
      <FeaturesSection />
      <ProductDemo />
      <BenefitsSection />
      <TechStack />
      <PricingSection />
      <Footer />
    </main>
  );
}