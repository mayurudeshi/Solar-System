import { ErrorBoundary } from './ErrorBoundary.jsx';
import { Scene } from './scene/Scene.jsx';
import { ControlBar } from './ui/ControlBar.jsx';
import { InfoPanel } from './ui/InfoPanel.jsx';
import { VantageSelector } from './ui/VantageSelector.jsx';
import { DateScrubber } from './ui/DateScrubber.jsx';

export default function App() {
  return (
    <ErrorBoundary>
      <Scene />
      <header className="top-bar">
        <ControlBar />
        <VantageSelector />
        <DateScrubber />
      </header>
      <InfoPanel />
      <footer className="readout">v0.5 · wired clock / vantage / inclination · 4-reviewer fixes</footer>
    </ErrorBoundary>
  );
}
