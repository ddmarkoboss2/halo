import { create } from 'zustand';
import type { Socket } from 'socket.io-client';

/**
 * WebRTC mesh engine for Halo voice channels and 1:1 calls.
 *
 * Every participant keeps one RTCPeerConnection per remote socket and negotiates
 * with the "perfect negotiation" pattern, so either side can add or replace
 * tracks (mic, camera, screen share) without glare.
 */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface PeerView {
  socketId: string;
  userId: string | null;
  stream: MediaStream | null;
  micOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  speaking: boolean;
  connection: ConnectionState;
}

interface VoiceStoreState {
  status: 'idle' | 'connecting' | 'live';
  mode: 'channel' | 'call' | null;
  scopeId: string | null;
  callId: string | null;
  label: string;
  micOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  deafened: boolean;
  localSpeaking: boolean;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  peers: PeerView[];
  error: string | null;
}

export const useVoiceStore = create<VoiceStoreState>(() => ({
  status: 'idle',
  mode: null,
  scopeId: null,
  callId: null,
  label: '',
  micOn: false,
  cameraOn: false,
  screenOn: false,
  deafened: false,
  localSpeaking: false,
  localStream: null,
  screenStream: null,
  peers: [],
  error: null,
}));

interface Peer {
  socketId: string;
  userId: string | null;
  pc: RTCPeerConnection;
  stream: MediaStream;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  audioSender: RTCRtpSender | null;
  videoSender: RTCRtpSender | null;
  analyser: AnalyserNode | null;
  speaking: boolean;
  connection: ConnectionState;
}

const SPEAK_THRESHOLD = 0.035;
const LEVEL_POLL_MS = 220;

class VoiceEngine {
  private socket: Socket | null = null;
  private peers = new Map<string, Peer>();
  private micTrack: MediaStreamTrack | null = null;
  private cameraTrack: MediaStreamTrack | null = null;
  private screenTrack: MediaStreamTrack | null = null;
  private outbound = new MediaStream();
  private audioContext: AudioContext | null = null;
  private audioElements = new Map<string, HTMLAudioElement>();
  private localAnalyser: AnalyserNode | null = null;
  private level = new Uint8Array(128);
  private poller: number | null = null;
  private peerFlags = new Map<string, { micOn: boolean; video: boolean; screen: boolean }>();
  private mode: 'channel' | 'call' | null = null;
  private scopeId: string | null = null;
  private callId: string | null = null;

  setSocket(socket: Socket) {
    this.socket = socket;
  }

  private patch(partial: Partial<VoiceStoreState>) {
    useVoiceStore.setState(partial);
  }

  private signal(to: string, payload: unknown) {
    this.socket?.emit('signal', { to, callId: this.callId, payload });
  }

  /* -------------------------------------------------------------- lifecycle */

  async joinChannel(channelId: string, label: string, options: { video?: boolean } = {}) {
    await this.teardownMedia();
    this.mode = 'channel';
    this.scopeId = channelId;
    this.callId = null;
    this.patch({
      status: 'connecting',
      mode: 'channel',
      scopeId: channelId,
      callId: null,
      label,
      peers: [],
      error: null,
      screenOn: false,
    });
    await this.acquireMic();
    if (options.video) await this.setCamera(true);
    this.startPolling();
    this.patch({ status: 'live' });
    this.socket?.emit('voice:join', {
      scope: 'channel',
      scopeId: channelId,
      muted: !useVoiceStore.getState().micOn,
      video: useVoiceStore.getState().cameraOn,
      screen: false,
    });
    this.publishState();
  }

  /** Joins the media side of an accepted 1:1 call. */
  async joinCall(callId: string, label: string, peerSocketIds: string[], options: { video?: boolean } = {}) {
    await this.teardownMedia();
    this.mode = 'call';
    this.scopeId = null;
    this.callId = callId;
    this.patch({
      status: 'connecting',
      mode: 'call',
      scopeId: null,
      callId,
      label,
      peers: [],
      error: null,
      screenOn: false,
    });
    await this.acquireMic();
    if (options.video) await this.setCamera(true);
    this.startPolling();
    for (const socketId of peerSocketIds) this.addPeer(socketId);
    this.patch({ status: 'live' });
    this.publishState();
  }

  /** Leaves the current voice room or call and releases the devices. */
  async leave() {
    if (this.mode === 'channel' && this.scopeId) {
      this.socket?.emit('voice:leave', { scope: 'channel', scopeId: this.scopeId });
    }
    for (const peer of this.peers.values()) this.closePeer(peer);
    this.peers.clear();
    await this.teardownMedia();
    this.mode = null;
    this.scopeId = null;
    this.callId = null;
    this.patch({
      status: 'idle',
      mode: null,
      scopeId: null,
      callId: null,
      label: '',
      peers: [],
      micOn: false,
      cameraOn: false,
      screenOn: false,
      localSpeaking: false,
      error: null,
    });
  }

  private async teardownMedia() {
    this.peerFlags.clear();
    this.stopPolling();
    for (const track of [this.micTrack, this.cameraTrack, this.screenTrack]) track?.stop();
    this.micTrack = null;
    this.cameraTrack = null;
    this.screenTrack = null;
    this.outbound = new MediaStream();
    this.localAnalyser = null;
    for (const [socketId, el] of [...this.audioElements.entries()]) {
      el.srcObject = null;
      el.remove();
      this.audioElements.delete(socketId);
    }
    this.patch({ localStream: null, screenStream: null });
  }

  /* ------------------------------------------------------------ local media */

  private async acquireMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.micTrack = stream.getAudioTracks()[0] ?? null;
      if (this.micTrack) this.outbound.addTrack(this.micTrack);
      await this.ensureAudioContext();
      if (this.micTrack) this.localAnalyser = this.attachAnalyser(new MediaStream([this.micTrack]));
      this.patch({ micOn: Boolean(this.micTrack), localStream: this.outbound, error: null });
    } catch {
      this.patch({
        micOn: false,
        localStream: this.outbound,
        error: 'Microphone unavailable — you joined as a listener.',
      });
    }
  }

  async setMic(on: boolean) {
    if (on && !this.micTrack) {
      await this.acquireMic();
      await this.attachAudioTrack();
    }
    if (this.micTrack) this.micTrack.enabled = on;
    this.patch({ micOn: on && Boolean(this.micTrack) });
    this.publishState();
  }

  async setCamera(on: boolean) {
    if (!on) {
      if (this.screenTrack) await this.stopScreen();
      await this.detachVideoTrack();
      this.cameraTrack?.stop();
      this.cameraTrack = null;
      this.patch({ cameraOn: false });
      this.publishState();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      this.cameraTrack = stream.getVideoTracks()[0] ?? null;
      if (!this.cameraTrack) throw new Error('no camera track');
      await this.attachVideoTrack(this.cameraTrack);
      await this.ensureAudioContext();
      this.patch({ cameraOn: true, error: null });
      this.publishState();
    } catch {
      this.patch({ cameraOn: false, error: 'Camera unavailable or permission denied.' });
    }
  }

  async setScreen(on: boolean) {
    if (!on) {
      await this.stopScreen();
      this.publishState();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      this.screenTrack = stream.getVideoTracks()[0] ?? null;
      if (!this.screenTrack) throw new Error('no screen track');
      this.screenTrack.addEventListener('ended', () => {
        void this.stopScreen();
      });
      await this.attachVideoTrack(this.screenTrack);
      this.patch({ screenOn: true, screenStream: new MediaStream([this.screenTrack]), error: null });
      this.publishState();
    } catch {
      this.patch({ screenOn: false });
    }
  }

  private async stopScreen() {
    this.screenTrack?.stop();
    this.screenTrack = null;
    for (const peer of this.peers.values()) {
      if (peer.videoSender) await peer.videoSender.replaceTrack(this.cameraTrack ?? null);
    }
    this.patch({ screenOn: false, screenStream: null });
  }

  setDeafened(deafened: boolean) {
    this.patch({ deafened });
    for (const el of this.audioElements.values()) el.muted = deafened;
    if (!deafened) for (const el of this.audioElements.values()) void el.play().catch(() => undefined);
  }

  /* ---------------------------------------------------------------- tracks */

  private async attachAudioTrack() {
    if (!this.micTrack) return;
    for (const peer of this.peers.values()) {
      if (peer.audioSender) {
        await peer.audioSender.replaceTrack(this.micTrack);
      } else {
        peer.audioSender = peer.pc.addTrack(this.micTrack, this.outbound);
      }
    }
  }

  /** Removes the outbound video track from every peer connection. */
  private async detachVideoTrack() {
    for (const peer of this.peers.values()) {
      if (peer.videoSender) await peer.videoSender.replaceTrack(null);
    }
  }

  /** Adds or replaces the outbound video track on every peer connection. */
  private async attachVideoTrack(track: MediaStreamTrack) {
    for (const peer of this.peers.values()) {
      if (peer.videoSender) {
        await peer.videoSender.replaceTrack(track);
      } else {
        peer.videoSender = peer.pc.addTrack(track, this.outbound);
      }
    }
  }

  private publishState() {
    const state = useVoiceStore.getState();
    if (this.mode === 'channel' && this.scopeId) {
      this.socket?.emit('voice:state', {
        scope: 'channel',
        scopeId: this.scopeId,
        muted: !state.micOn,
        video: state.cameraOn,
        screen: state.screenOn,
        speaking: state.localSpeaking,
      });
    } else if (this.mode === 'call' && this.callId) {
      this.socket?.emit('call:state', {
        callId: this.callId,
        muted: !state.micOn,
        video: state.cameraOn,
        screen: state.screenOn,
      });
    }
  }

  /* ------------------------------------------------------------------ peers */

  addPeer(socketId: string, userId: string | null = null, polite?: boolean) {
    const existing = this.peers.get(socketId);
    if (existing) {
      if (userId) existing.userId = userId;
      this.syncPeers();
      return;
    }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const stream = new MediaStream();
    const peer: Peer = {
      socketId,
      userId,
      pc,
      stream,
      polite: polite ?? (this.socket ? this.socket.id! > socketId : false),
      makingOffer: false,
      ignoreOffer: false,
      audioSender: null,
      videoSender: null,
      analyser: null,
      speaking: false,
      connection: 'new',
    };

    if (this.micTrack) peer.audioSender = pc.addTrack(this.micTrack, this.outbound);
    const outboundVideo = this.screenTrack ?? this.cameraTrack;
    if (outboundVideo) peer.videoSender = pc.addTrack(outboundVideo, this.outbound);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.signal(socketId, { candidate: candidate.toJSON() });
    };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription) this.signal(socketId, { description: pc.localDescription.toJSON() });
      } catch (error) {
        console.warn('[halo] negotiation failed', error);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.ontrack = ({ track, streams }) => {
      const incoming = streams[0] ?? new MediaStream([track]);
      if (!stream.getTracks().includes(track)) stream.addTrack(track);
      track.addEventListener('ended', () => {
        if (stream.getTracks().includes(track)) stream.removeTrack(track);
        this.syncPeers();
      });
      if (track.kind === 'audio') {
        this.ensureAudioElement(socketId, incoming);
        peer.analyser = this.attachAnalyser(incoming);
      }
      this.syncPeers();
    };
    pc.onconnectionstatechange = () => {
      peer.connection = mapConnection(pc.connectionState);
      if (pc.connectionState === 'failed') {
        try {
          pc.restartIce();
        } catch {
          /* ignore */
        }
      }
      this.syncPeers();
    };

    this.peers.set(socketId, peer);
    this.syncPeers();
  }

  removePeer(socketId: string) {
    const peer = this.peers.get(socketId);
    if (!peer) return;
    this.closePeer(peer);
    this.peers.delete(socketId);
    const el = this.audioElements.get(socketId);
    if (el) {
      el.srcObject = null;
      el.remove();
      this.audioElements.delete(socketId);
    }
    this.syncPeers();
  }

  private closePeer(peer: Peer) {
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onnegotiationneeded = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
  }

  setPeerFlags(socketId: string, flags: { micOn?: boolean; video?: boolean; screen?: boolean }) {
    if (!this.peers.has(socketId)) this.addPeer(socketId);
    this.syncPeerFlags(socketId, flags);
  }

  private syncPeerFlags(socketId: string, flags: { micOn?: boolean; video?: boolean; screen?: boolean }) {
    const current = this.peerFlags.get(socketId) ?? { micOn: true, video: false, screen: false };
    const next = {
      micOn: flags.micOn ?? current.micOn,
      video: flags.video ?? current.video,
      screen: flags.screen ?? current.screen,
    };
    this.peerFlags.set(socketId, next);
    this.syncPeers();
  }

  /* ---------------------------------------------------------------- signals */

  async handleSignal(from: string, payload: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
    let peer = this.peers.get(from);
    if (!peer) {
      this.addPeer(from);
      peer = this.peers.get(from);
      if (!peer) return;
    }
    try {
      if (payload.description) {
        const offerCollision =
          payload.description.type === 'offer' && (peer.makingOffer || peer.pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;
        await peer.pc.setRemoteDescription(payload.description);
        if (payload.description.type === 'offer') {
          await peer.pc.setLocalDescription();
          if (peer.pc.localDescription) {
            this.signal(from, { description: peer.pc.localDescription.toJSON() });
          }
        }
      } else if (payload.candidate) {
        try {
          await peer.pc.addIceCandidate(payload.candidate);
        } catch (error) {
          if (!peer.ignoreOffer) throw error;
        }
      }
    } catch (error) {
      console.warn('[halo] signal handling failed', error);
    }
  }

  /* ------------------------------------------------------------- rendering */

  private ensureAudioElement(socketId: string, stream: MediaStream) {
    let el = this.audioElements.get(socketId);
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      el.dataset.haloPeer = socketId;
      el.style.display = 'none';
      document.body.appendChild(el);
      this.audioElements.set(socketId, el);
    }
    el.srcObject = stream;
    el.muted = useVoiceStore.getState().deafened;
    void el.play().catch(() => undefined);
  }

  private syncPeers() {
    const list: PeerView[] = [...this.peers.values()].map((peer) => {
      const flags = this.peerFlags.get(peer.socketId);
      return {
        socketId: peer.socketId,
        userId: peer.userId,
        stream: peer.stream,
        micOn: flags?.micOn ?? true,
        cameraOn: flags?.video ?? false,
        screenOn: flags?.screen ?? false,
        speaking: peer.speaking,
        connection: peer.connection,
      };
    });
    list.sort((a, b) => a.socketId.localeCompare(b.socketId));
    this.patch({ peers: list });
  }

  /* --------------------------------------------------------------- speaking */

  private async ensureAudioContext() {
    if (this.audioContext) {
      if (this.audioContext.state === 'suspended') await this.audioContext.resume().catch(() => undefined);
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.audioContext = new Ctor();
  }

  private attachAnalyser(stream: MediaStream) {
    if (!this.audioContext) return null;
    try {
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      return analyser;
    } catch {
      return null;
    }
  }

  private startPolling() {
    if (this.poller !== null) return;
    this.poller = window.setInterval(() => this.tickLevels(), LEVEL_POLL_MS);
  }

  private stopPolling() {
    if (this.poller !== null) {
      window.clearInterval(this.poller);
      this.poller = null;
    }
  }

  private tickLevels() {
    const localLevel = this.localAnalyser ? this.levelOf(this.localAnalyser) : 0;
    const localSpeaking = localLevel > SPEAK_THRESHOLD;
    if (localSpeaking !== useVoiceStore.getState().localSpeaking) {
      this.patch({ localSpeaking });
      this.publishState();
    }
    let changed = false;
    for (const peer of this.peers.values()) {
      if (!peer.analyser) continue;
      const speaking = this.levelOf(peer.analyser) > SPEAK_THRESHOLD;
      if (speaking !== peer.speaking) {
        peer.speaking = speaking;
        changed = true;
      }
    }
    if (changed) this.syncPeers();
  }

  private levelOf(analyser: AnalyserNode): number {
    analyser.getByteTimeDomainData(this.level);
    let sum = 0;
    for (let i = 0; i < this.level.length; i += 1) {
      const value = (this.level[i] - 128) / 128;
      sum += value * value;
    }
    return Math.sqrt(sum / this.level.length);
  }

  /** Restores the engine after a socket reconnect. */
  rejoin() {
    if (this.mode === 'channel' && this.scopeId) {
      this.socket?.emit('voice:join', {
        scope: 'channel',
        scopeId: this.scopeId,
        muted: !useVoiceStore.getState().micOn,
        video: useVoiceStore.getState().cameraOn,
        screen: useVoiceStore.getState().screenOn,
      });
    }
  }
}

function mapConnection(state: RTCPeerConnectionState): ConnectionState {
  switch (state) {
    case 'connected':
      return 'connected';
    case 'connecting':
      return 'connecting';
    case 'disconnected':
      return 'disconnected';
    case 'failed':
      return 'failed';
    default:
      return 'new';
  }
}

export const voiceEngine = new VoiceEngine();
