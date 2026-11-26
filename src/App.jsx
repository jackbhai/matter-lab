import React, { useCallback, useState } from 'react';
import * as SandlabNS from './tools/sandlab.jsx';
import { Toaster } from './ui/kit.jsx';
import HomePage from './home/HomePage.jsx';

/* v2 shell: a real landing homepage is the default screen. Launching a mode
   stores the launch config (fresh nonce per launch) and shows the tool;
   the tool's onHome returns here in one tap. MatterLab is read through the
   namespace so the shell never hard-fails on contract timing. */
const MatterLab = SandlabNS.MatterLab;

export default function App() {
  const [screen, setScreen] = useState('home');
  const [launch, setLaunch] = useState(null);

  const openTool = useCallback((cfg) => {
    setLaunch({ ...(cfg || { mode: 'free' }), nonce: Date.now() });
    setScreen('tool');
  }, []);
  const goHome = useCallback(() => setScreen('home'), []);

  return (
    <div data-ml-shell>
      {screen === 'home' ? (
        <HomePage onLaunch={openTool} />
      ) : (
        <div className="ml-toolwrap">
          <main style={{ padding: 10, overflowY: 'auto' }}>
            {typeof MatterLab === 'function'
              ? <MatterLab launch={launch} onHome={goHome} />
              : <p style={{ padding: 20 }}>The lab is unavailable right now.</p>}
          </main>
        </div>
      )}
      <Toaster />
    </div>
  );
}
