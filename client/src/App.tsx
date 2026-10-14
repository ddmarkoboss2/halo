import { useEffect } from 'react';
import { useApp } from './store';
import { AuthScreen } from './components/AuthScreen';
import { ChatView } from './components/ChatView';
import { FriendsView } from './components/FriendsView';
import { HomeView } from './components/HomeView';
import { Modals } from './components/Modals';
import { ProfilePanel } from './components/ProfilePanel';
import { SearchPalette } from './components/SearchPalette';
import { ServerRail } from './components/ServerRail';
import { Sidebar } from './components/Sidebar';
import { CallStage, IncomingCallPrompt, VoiceDock } from './components/Voice';
import { Toasts } from './components/ui';
import { SparklesIcon } from './components/icons';

let initialized = false;

export default function App() {
  const authState = useApp((state) => state.authState);
  const init = useApp((state) => state.init);
  const refresh = useApp((state) => state.refresh);
  const setSearchOpen = useApp((state) => state.setSearchOpen);
  const view = useApp((state) => state.view);

  useEffect(() => {
    if (initialized) return;
    initialized = true;
    void init();
  }, [init]);

  // Reconnect after the machine wakes up or the tab regains focus.
  useEffect(() => {
    const onFocus = () => {
      if (useApp.getState().authState === 'signed-in') void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSearchOpen]);

  return (
    <div className="relative h-full overflow-hidden bg-ink-950 text-mist-100">
      <div className="aurora">
        <div className="aurora-grain" />
      </div>

      {authState === 'loading' && (
        <div className="relative z-10 grid h-full place-items-center">
          <div className="flex flex-col items-center gap-3">
            <span className="grid h-14 w-14 animate-pulse place-items-center rounded-3xl bg-gradient-to-br from-halo-500 to-aqua-500">
              <SparklesIcon size={24} className="text-white" />
            </span>
            <p className="text-sm text-mist-400">Waking up Halo…</p>
          </div>
        </div>
      )}

      {authState === 'signed-out' && <AuthScreen />}

      {authState === 'signed-in' && (
        <>
          <div className="relative z-10 flex h-full gap-3 p-3">
            <ServerRail />
            <Sidebar />
            {view.kind === 'home' ? <HomeView /> : view.kind === 'friends' ? <FriendsView /> : <ChatView />}
          </div>
          <VoiceDock />
          <CallStage />
          <IncomingCallPrompt />
          <ProfilePanel />
          <SearchPalette />
          <Modals />
          <Toasts />
        </>
      )}
    </div>
  );
}
