import { ErrorBoundary } from './ErrorBoundary.jsx';
import { Scene } from './scene/Scene.jsx';
import { ControlBar } from './ui/ControlBar.jsx';
import { InfoPanel } from './ui/InfoPanel.jsx';
import { VantageSelector } from './ui/VantageSelector.jsx';
import { BodyVisibilityPanel } from './ui/BodyVisibilityPanel.jsx';
import { DateScrubber } from './ui/DateScrubber.jsx';
import { SimDateReadout } from './ui/SimDateReadout.jsx';

export default function App() {
  return (
    <ErrorBoundary>
      <Scene />
      <header className="top-bar">
        <ControlBar />
        <VantageSelector />
        <BodyVisibilityPanel />
        <DateScrubber />
      </header>
      <InfoPanel />
      <SimDateReadout />
    </ErrorBoundary>
  );
}
