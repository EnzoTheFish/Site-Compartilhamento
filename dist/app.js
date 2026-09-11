(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    lobby: $("lobby"), app: $("appShell"), name: $("displayName"), createChoice: $("createChoice"), joinChoice: $("joinChoice"),
    joinField: $("joinField"), joinCode: $("joinCode"), start: $("startButton"), error: $("lobbyError"), roomCode: $("roomCode"),
    roomLabel: $("roomLabel"), topStatus: $("topStatus"), userState: $("userState"), emptyStage: $("emptyStage"), videoGrid: $("videoGrid"),
    remoteVideo: $("remoteVideo"), localVideo: $("localVideo"), remotePlaceholder: $("remotePlaceholder"), localPlaceholder: $("localPlaceholder"),
    mic: $("micButton"), sideMic: $("sidebarMic"), deafen: $("deafenButton"), share: $("shareButton"), leave: $("leaveButton"),
    copyCode: $("copyCode"), invite: $("inviteButton"), sidebarInvite: $("sidebarInvite"), toast: $("toast"), banner: $("connectionBanner"),
    sidebarFriend: $("sidebarFriend"), friendMember: $("friendMember"), memberCount: $("memberCount"), remoteLabel: $("remoteLabel"),
    remoteWaitingText: $("remoteWaitingText"), memberList: $("memberList"), memberToggle: $("memberToggle"), closeMembers: $("closeMembers")
  };

  const state = {
    mode: "create", name: "Você", code: "", peer: null, call: null, data: null, localStream: null,
    micStream: null, placeholderTrack: null, displayStream: null, mixedAudioTrack: null, audioContext: null,
    muted: false, deafened: false, connected: false, sharing: false, toastTimer: null
  };

  function setMode(mode) {
    state.mode = mode;
    const joining = mode === "join";
    els.createChoice.classList.toggle("selected", !joining);
    els.joinChoice.classList.toggle("selected", joining);
    els.joinField.classList.toggle("hidden", !joining);
    els.start.innerHTML = joining ? "Entrar na sala <span>→</span>" : "Criar sala <span>→</span>";
    if (joining) setTimeout(() => els.joinCode.focus(), 50);
  }

  function sanitizeCode(value) { return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); }
  function randomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    return Array.from(bytes, (n) => chars[n % chars.length]).join("");
  }
  function peerId(code) { return `lume-${code.toLowerCase()}`; }
  function initial(name) { return (name.trim()[0] || "V").toUpperCase(); }
  function showError(message) { els.error.textContent = message; els.error.classList.remove("hidden"); }
  function clearError() { els.error.classList.add("hidden"); }
  function showToast(message) {
    els.toast.textContent = message; els.toast.classList.add("show"); clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }
  function setStatus(label, detail = label) { els.topStatus.textContent = label; els.userState.textContent = detail; }

  async function getMicrophone() {
    try {
      state.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (error) {
      state.micStream = new MediaStream();
      showToast("Sala aberta sem microfone");
    }
  }

  function makePlaceholderTrack() {
    const canvas = document.createElement("canvas"); canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext("2d");
    const draw = () => {
      const gradient = ctx.createRadialGradient(640, 310, 20, 640, 360, 650);
      gradient.addColorStop(0, "#222735"); gradient.addColorStop(1, "#0b0d12");
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#80f7bf"; ctx.font = "700 30px system-ui"; ctx.textAlign = "center"; ctx.fillText("LUME", 640, 350);
      ctx.fillStyle = "#9198a7"; ctx.font = "22px system-ui"; ctx.fillText("Tela não compartilhada", 640, 390);
    };
    draw();
    const stream = canvas.captureStream(1);
    return stream.getVideoTracks()[0];
  }

  async function prepareMedia() {
    if (!navigator.mediaDevices?.getUserMedia || !window.Peer) throw new Error("Seu navegador não oferece os recursos necessários para esta chamada.");
    await getMicrophone();
    state.placeholderTrack = makePlaceholderTrack();
    state.localStream = new MediaStream([state.placeholderTrack, ...state.micStream.getAudioTracks()]);
  }

  function updateIdentity() {
    const ids = ["railAvatar", "sidebarAvatar", "userAvatar", "localAvatar", "memberAvatar"];
    ids.forEach((id) => $(id).textContent = initial(state.name));
    ["sidebarName", "userName", "memberName"].forEach((id) => $(id).textContent = state.name);
  }

  function openApp() {
    updateIdentity();
    els.roomCode.textContent = state.code;
    els.roomLabel.textContent = `Sala ${state.code}`;
    els.lobby.classList.add("hidden");
    els.app.removeAttribute("aria-hidden");
    els.emptyStage.classList.remove("hidden");
    setStatus(state.mode === "create" ? "Aguardando seu amigo" : "Entrando na sala…", "online");
    history.replaceState(null, "", `${location.pathname}?room=${state.code}`);
  }

  function bindPeerEvents() {
    state.peer.on("call", (call) => {
      if (state.call) { call.close(); return; }
      state.call = call;
      updateRemoteName(call.metadata?.name || "Seu amigo");
      call.answer(state.localStream);
      attachCall(call);
    });
    state.peer.on("connection", (connection) => attachData(connection));
    state.peer.on("disconnected", () => {
      els.banner.textContent = "Conexão com o serviço interrompida. Tentando reconectar…"; els.banner.classList.remove("hidden");
      setTimeout(() => { if (state.peer && !state.peer.destroyed) state.peer.reconnect(); }, 1500);
    });
    state.peer.on("open", () => els.banner.classList.add("hidden"));
    state.peer.on("error", (error) => {
      const map = { "peer-unavailable": "Sala não encontrada. Confira o código e tente novamente.", "unavailable-id": "Esse código já está em uso. Tente criar outra sala.", "network": "Não foi possível acessar a rede. Verifique sua conexão." };
      const message = map[error.type] || "Não foi possível estabelecer a conexão.";
      if (!els.lobby.classList.contains("hidden")) { showError(message); els.start.disabled = false; }
      else { els.banner.textContent = message; els.banner.classList.remove("hidden"); }
    });
  }

  async function launch() {
    clearError();
    state.name = els.name.value.trim() || "Você";
    state.code = state.mode === "create" ? randomCode() : sanitizeCode(els.joinCode.value);
    if (state.mode === "join" && state.code.length < 4) { showError("Digite um código de sala válido."); return; }
    els.start.disabled = true; els.start.textContent = "Preparando áudio…";
    try {
      await prepareMedia();
      state.peer = state.mode === "create" ? new Peer(peerId(state.code), { debug: 1 }) : new Peer(undefined, { debug: 1 });
      bindPeerEvents();
      state.peer.on("open", () => {
        openApp(); els.start.disabled = false;
        if (state.mode === "join") connectToHost();
      });
    } catch (error) {
      showError(error.message || "Não foi possível iniciar a sala."); els.start.disabled = false; els.start.textContent = state.mode === "join" ? "Entrar na sala →" : "Criar sala →";
    }
  }

  function connectToHost() {
    const target = peerId(state.code);
    attachData(state.peer.connect(target, { reliable: true, metadata: { name: state.name } }));
    const call = state.peer.call(target, state.localStream, { metadata: { name: state.name } });
    state.call = call; attachCall(call);
  }

  function attachData(connection) {
    state.data = connection;
    connection.on("open", () => {
      connection.send({ type: "profile", name: state.name, sharing: state.sharing });
    });
    connection.on("data", (message) => {
      if (message?.type === "profile") { updateRemoteName(message.name || "Seu amigo"); setRemoteSharing(Boolean(message.sharing)); }
      if (message?.type === "sharing") setRemoteSharing(Boolean(message.active));
      if (message?.type === "muted") showToast(message.active ? "Seu amigo silenciou o microfone" : "Microfone do seu amigo ativado");
    });
  }

  function attachCall(call) {
    call.on("stream", (stream) => {
      state.connected = true;
      els.remoteVideo.srcObject = stream;
      els.remoteVideo.play().catch(() => {});
      els.emptyStage.classList.add("hidden"); els.videoGrid.classList.remove("hidden");
      els.sidebarFriend.classList.remove("muted"); els.friendMember.classList.remove("muted");
      els.memberCount.textContent = "2"; setStatus("2 pessoas na sala", "online");
    });
    call.on("close", friendLeft); call.on("error", friendLeft);
  }

  function updateRemoteName(name) {
    els.remoteLabel.textContent = name;
    els.sidebarFriend.querySelector("span").textContent = name;
    els.friendMember.querySelector("strong").textContent = name;
    document.querySelectorAll(".avatar.friend").forEach((avatar) => avatar.textContent = initial(name));
  }

  function setRemoteSharing(active) {
    els.remotePlaceholder.classList.toggle("hidden", active);
    els.remoteWaitingText.textContent = active ? "Compartilhando tela" : "Aguardando transmissão";
  }

  function friendLeft() {
    state.connected = false; state.call = null;
    els.sidebarFriend.classList.add("muted"); els.friendMember.classList.add("muted"); els.memberCount.textContent = "1";
    els.remotePlaceholder.classList.remove("hidden"); setStatus("Seu amigo saiu da sala", "online"); showToast("Seu amigo saiu");
  }

  function sender(kind) {
    return state.call?.peerConnection?.getSenders().find((item) => item.track?.kind === kind);
  }

  async function mixAudio(displayStream) {
    const screenAudio = displayStream.getAudioTracks()[0];
    const micAudio = state.micStream.getAudioTracks()[0];
    if (!screenAudio) return micAudio || null;
    state.audioContext = state.audioContext || new AudioContext();
    const destination = state.audioContext.createMediaStreamDestination();
    [micAudio, screenAudio].filter(Boolean).forEach((track) => state.audioContext.createMediaStreamSource(new MediaStream([track])).connect(destination));
    state.mixedAudioTrack = destination.stream.getAudioTracks()[0];
    state.mixedAudioTrack.enabled = !state.muted;
    return state.mixedAudioTrack;
  }

  async function startSharing() {
    if (!state.call) { showToast("Espere seu amigo entrar para compartilhar"); return; }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 } }, audio: true });
      state.displayStream = display;
      const videoTrack = display.getVideoTracks()[0];
      const audioTrack = await mixAudio(display);
      await sender("video")?.replaceTrack(videoTrack);
      if (audioTrack && sender("audio")) await sender("audio").replaceTrack(audioTrack);
      els.localVideo.srcObject = display; els.localVideo.play().catch(() => {}); els.localPlaceholder.classList.add("hidden");
      state.sharing = true; els.share.classList.add("active"); els.share.querySelector("span").textContent = "Parar transmissão";
      state.data?.send({ type: "sharing", active: true });
      videoTrack.addEventListener("ended", stopSharing, { once: true });
      showToast("Sua tela está ao vivo");
    } catch (error) {
      if (error.name !== "NotAllowedError") showToast("Não foi possível compartilhar esta tela");
    }
  }

  async function stopSharing() {
    if (!state.sharing) return;
    const stream = state.displayStream; state.displayStream = null; state.sharing = false;
    await sender("video")?.replaceTrack(state.placeholderTrack);
    const micAudio = state.micStream.getAudioTracks()[0]; if (sender("audio") && micAudio) await sender("audio").replaceTrack(micAudio);
    stream?.getTracks().forEach((track) => track.stop()); state.mixedAudioTrack?.stop(); state.mixedAudioTrack = null;
    els.localVideo.srcObject = null; els.localPlaceholder.classList.remove("hidden");
    els.share.classList.remove("active"); els.share.querySelector("span").textContent = "Compartilhar tela";
    state.data?.send({ type: "sharing", active: false }); showToast("Compartilhamento encerrado");
  }

  function toggleMic() {
    state.muted = !state.muted;
    state.micStream?.getAudioTracks().forEach((track) => track.enabled = !state.muted);
    if (state.mixedAudioTrack) state.mixedAudioTrack.enabled = !state.muted;
    [els.mic, els.sideMic].forEach((button) => button?.setAttribute("aria-pressed", String(state.muted)));
    $("localMutedBadge").classList.toggle("hidden", !state.muted);
    state.data?.send({ type: "muted", active: state.muted }); showToast(state.muted ? "Microfone desligado" : "Microfone ligado");
  }

  function toggleDeafen() {
    state.deafened = !state.deafened; els.remoteVideo.muted = state.deafened;
    els.deafen.setAttribute("aria-pressed", String(state.deafened)); showToast(state.deafened ? "Áudio recebido desligado" : "Áudio recebido ligado");
  }

  async function copyInvite() {
    const url = `${location.origin}${location.pathname}?room=${state.code}`;
    try { await navigator.clipboard.writeText(url); showToast("Link do convite copiado"); }
    catch { await navigator.clipboard.writeText(state.code); showToast("Código copiado"); }
  }

  function leave() {
    state.displayStream?.getTracks().forEach((track) => track.stop()); state.localStream?.getTracks().forEach((track) => track.stop());
    state.micStream?.getTracks().forEach((track) => track.stop()); state.call?.close(); state.data?.close(); state.peer?.destroy();
    history.replaceState(null, "", location.pathname); location.reload();
  }

  function registerWebMcp() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const register = (tool) => { try { Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch {} };
    register({ name: "read_call_status", title: "Ler status da chamada", description: "Mostra o estado atual da sala Lume sem alterar a chamada.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => ({ screen: els.lobby.classList.contains("hidden") ? "call" : "lobby", mode: state.mode, roomCode: state.code || null, connected: state.connected, sharing: state.sharing, muted: state.muted }) });
    register({ name: "stage_room_join", title: "Preparar entrada na sala", description: "Preenche o código de uma sala no formulário visível para a pessoa revisar antes de entrar.", inputSchema: { type: "object", properties: { code: { type: "string", minLength: 4, maxLength: 8 } }, required: ["code"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: ({ code }) => { const clean = sanitizeCode(code); if (clean.length < 4) throw new Error("Código inválido"); setMode("join"); els.joinCode.value = clean; return { staged: true, code: clean }; } });
  }

  els.createChoice.addEventListener("click", () => setMode("create"));
  els.joinChoice.addEventListener("click", () => setMode("join"));
  els.joinCode.addEventListener("input", () => els.joinCode.value = sanitizeCode(els.joinCode.value));
  els.start.addEventListener("click", launch);
  [els.name, els.joinCode].forEach((input) => input.addEventListener("keydown", (event) => { if (event.key === "Enter") launch(); }));
  els.mic.addEventListener("click", toggleMic); els.sideMic.addEventListener("click", toggleMic); els.deafen.addEventListener("click", toggleDeafen);
  els.share.addEventListener("click", () => state.sharing ? stopSharing() : startSharing()); els.leave.addEventListener("click", leave);
  [els.copyCode, els.invite, els.sidebarInvite].forEach((button) => button.addEventListener("click", copyInvite));
  els.memberToggle.addEventListener("click", () => els.memberList.classList.add("open")); els.closeMembers.addEventListener("click", () => els.memberList.classList.remove("open"));
  window.addEventListener("beforeunload", () => { state.displayStream?.getTracks().forEach((track) => track.stop()); state.peer?.destroy(); });

  const roomFromUrl = sanitizeCode(new URLSearchParams(location.search).get("room") || "");
  if (roomFromUrl) { setMode("join"); els.joinCode.value = roomFromUrl; }
  registerWebMcp(); els.name.focus();
})();
