import EnsureSelectedPackage from "./_components/EnsureSelectedPackage";
import ExitDemoBanner from "./_components/ExitDemoBanner";
import ReviewPrompt from "./_components/ReviewPrompt";
import SharePopup from "./_components/SharePopup";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <EnsureSelectedPackage>
      <>
        <ExitDemoBanner />
        {children}
        <SharePopup />
        <ReviewPrompt />
      </>
    </EnsureSelectedPackage>
  );
}
