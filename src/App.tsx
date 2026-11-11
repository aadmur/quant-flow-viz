import { useCallback, useState } from 'react';
import CinematicIntro from './cinema/CinematicIntro';
import TeachingApp from './teaching/TeachingApp';

export default function App() {
  const [showIntro, setShowIntro] = useState(true);
  const [introKey, setIntroKey] = useState(0);
  const finishIntro = useCallback(() => setShowIntro(false), []);
  const replayIntro = useCallback(() => {
    setIntroKey((k) => k + 1);
    setShowIntro(true);
  }, []);

  return showIntro
    ? <CinematicIntro key={introKey} onComplete={finishIntro} />
    : <TeachingApp onReplay={replayIntro} />;
}
