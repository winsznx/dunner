import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Ticker from "./components/Ticker";
import Stat from "./components/Stat";
import HowItWorks from "./components/HowItWorks";
import DemoSection from "./components/DemoSection";
import VoiceSection from "./components/VoiceSection";
import StripeActions from "./components/StripeActions";
import TrustBar from "./components/TrustBar";
import Pricing from "./components/Pricing";
import ImageBreak from "./components/ImageBreak";
import EarlyAccess from "./components/EarlyAccess";
import Footer from "./components/Footer";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Ticker />
      <Stat />
      <HowItWorks />
      <DemoSection />
      <VoiceSection />
      <StripeActions />
      <TrustBar />
      <Pricing />
      <ImageBreak />
      <EarlyAccess />
      <Footer />
    </main>
  );
}
