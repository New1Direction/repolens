import { Hero } from '@/components/home/Hero';
import { VerdictDemo } from '@/components/home/VerdictDemo';
import { FeatureBento } from '@/components/home/FeatureBento';
import { HowItWorks } from '@/components/home/HowItWorks';
import { ModelsPrivacy } from '@/components/home/ModelsPrivacy';
import { FinalCta } from '@/components/home/FinalCta';
import { SiteMotion } from '@/components/home/SiteMotion';
import './styles/home.css';

export default function HomePage() {
  return (
    <>
      <Hero />
      <VerdictDemo />
      <FeatureBento />
      <HowItWorks />
      <ModelsPrivacy />
      <FinalCta />
      <SiteMotion />
    </>
  );
}
