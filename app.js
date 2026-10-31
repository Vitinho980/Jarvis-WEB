(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const C = window.AEGIS_CONFIG || {};
  const cloud = Boolean(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase);
  const sb = cloud ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;
  const LS = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  };
  const MODELS = { groq: "llama-3.3-70b-versatile", gemini: "gemini-flash-latest", openai: "gpt-4o-mini" };
  const NAMES = { groq: "Groq", gemini: "Gemini", openai: "OpenAI" };
  const TITLES = { chatPanel: "Como posso ajudar?", memoryPanel: "Minha memória", settingsPanel: "Núcleo de IA" };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const history = [];
  let user = null, name = "Operador", isRegister = false, busy = false;
  let voice = false, viaVoice = false, rec = null, editId = null;

  // ---------- camada de dados: Supabase (nuvem) ou localStorage (demonstração) ----------
  const ok = ({ error, data }) => { if (error) throw error; return data; };
  const db = cloud ? {
    async msgs() { return ok(await sb.from("messages").select("id,role,content").order("id", { ascending: false }).limit(60)).reverse(); },
    async addMsg(role, content) { ok(await sb.from("messages").insert({ role, content })); },
    async clearMsgs() { ok(await sb.from("messages").delete().eq("user_id", user.id)); },
    async mems() { return ok(await sb.from("memories").select("id,title,content").order("id")); },
    async saveMem(m) {
      ok(m.id ? await sb.from("memories").update({ title: m.title, content: m.content }).eq("id", m.id)
              : await sb.from("memories").insert({ title: m.title, content: m.content }));
    },
    async delMem(id) { ok(await sb.from("memories").delete().eq("id", id)); },
    async setPref(v) { ok(await sb.from("profiles").update({ memory_enabled: v }).eq("id", user.id)); }
  } : {
    async msgs() { return LS.get("aegis:msgs", []); },
    async addMsg(role, content) { LS.set("aegis:msgs", [...LS.get("aegis:msgs", []), { id: Date.now() + Math.random(), role, content }].slice(-200)); },
    async clearMsgs() { LS.set("aegis:msgs", []); },
    async mems() { return LS.get("aegis:mems", []); },
    async saveMem(m) {
      const a = LS.get("aegis:mems", []), i = a.findIndex((x) => x.id === m.id);
      if (i >= 0) Object.assign(a[i], { title: m.title, content: m.content });
      else a.push({ id: Date.now(), title: m.title, content: m.content });
      LS.set("aegis:mems", a);
    },
    async delMem(id) { LS.set("aegis:mems", LS.get("aegis:mems", []).filter((x) => x.id !== id)); },
    async setPref(v) { LS.set("aegis:pref", v); }
  };

  // ---------- utilidades ----------
  const first = () => name.trim().split(/\s+/)[0];
  const greeting = () => {
    const h = new Date().getHours();
    return `${h < 5 || h >= 18 ? "Boa noite" : h < 12 ? "Bom dia" : "Boa tarde"}, ${first()}.`;
  };
  const setState = (s) => { document.body.dataset.state = s || "idle"; };
  function toast(message) {
    const n = $("toast");
    n.textContent = message; n.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => n.classList.remove("show"), 3400);
  }
  const ptErr = (e) => {
    const m = (e && e.message) || "Erro inesperado.";
    if (/Invalid login/i.test(m)) return "E-mail ou senha incorretos.";
    if (/already registered/i.test(m)) return "Este e-mail já tem conta. Use Entrar.";
    if (/relation .* does not exist|schema cache/i.test(m)) return "Tabelas não encontradas. Rode o arquivo database/supabase.sql no Supabase.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com o serviço. Verifique a internet e a chave/CORS.";
    return m;
  };

  // ---------- autenticação ----------
  function setAuthMode(reg) {
    isRegister = reg;
    const demo = !cloud;
    $("authTitle").textContent = demo ? "Modo demonstração" : reg ? "Crie sua conta" : "Acesse o AEGIS";
    $("authSubtitle").textContent = demo ? "Supabase não configurado: seus dados ficam só neste navegador." : reg ? "Seu espaço pessoal começa aqui." : "Entre na sua conta para continuar.";
    $("nameField").classList.toggle("hidden", !(reg || demo));
    $("displayName").required = reg || demo;
    $("emailField").classList.toggle("hidden", demo);
    $("passField").classList.toggle("hidden", demo);
    $("email").required = $("password").required = !demo;
    $("password").autocomplete = reg ? "new-password" : "current-password";
    $("authSubmit").innerHTML = demo ? "Iniciar sistema <span>→</span>" : reg ? "Criar minha conta <span>→</span>" : "Entrar <span>→</span>";
    $("authSwitch").classList.toggle("hidden", demo);
    $("authSwitch").textContent = reg ? "Já tem uma conta? Entrar" : "Ainda não tem conta? Criar conta";
    $("authError").textContent = ""; $("authError").style.color = "";
  }

  $("authSwitch").addEventListener("click", () => setAuthMode(!isRegister));
  $("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("authError").textContent = ""; $("authSubmit").disabled = true;
    try {
      if (!cloud) {
        name = $("displayName").value.trim(); LS.set("aegis:name", name); user = { id: "local" };
        return await enter();
      }
      const email = $("email").value.trim(), password = $("password").value;
      if (isRegister) {
        const r = await sb.auth.signUp({ email, password, options: { data: { display_name: $("displayName").value.trim() } } });
        if (r.error) throw r.error;
        if (!r.data.session) {
          setAuthMode(false);
          $("authError").style.color = "var(--green)";
          $("authError").textContent = "Conta criada. Confirme o link enviado ao seu e-mail e depois entre.";
          return;
        }
        user = r.data.session.user;
      } else {
        const r = await sb.auth.signInWithPassword({ email, password });
        if (r.error) throw r.error;
        user = r.data.user;
      }
      await enter();
    } catch (err) { $("authError").textContent = ptErr(err); }
    finally { $("authSubmit").disabled = false; }
  });

  $("logoutButton").addEventListener("click", async () => {
    if (cloud) await sb.auth.signOut(); else localStorage.removeItem("aegis:name");
    location.reload();
  });

  async function enter() {
    if (cloud) {
      const p = ok(await sb.from("profiles").select("display_name,memory_enabled").maybeSingle());
      name = (p && p.display_name) || (user.user_metadata && user.user_metadata.display_name) || "Operador";
      $("memoryEnabled").checked = p ? p.memory_enabled : true;
      $("userEmail").textContent = user.email;
    } else {
      $("memoryEnabled").checked = LS.get("aegis:pref", true);
      $("userEmail").textContent = "modo demonstração";
    }
    $("userName").textContent = name;
    $("userAvatar").textContent = first().charAt(0).toUpperCase();
    $("greeting").textContent = greeting();
    $("authView").classList.add("hidden"); $("appView").classList.remove("hidden");
    loadAI();
    try {
      history.length = 0; $("messages").replaceChildren();
      const ms = await db.msgs();
      ms.forEach((m) => { renderMessage(m.role, m.content); history.push({ role: m.role, content: m.content }); });
      await loadMemories();
    } catch (e) { toast(ptErr(e)); }
  }

  // ---------- mensagens ----------
  function renderMessage(role, content) {
    $("welcome").classList.add("hidden");
    const item = document.createElement("article");
    item.className = `message ${role}`;
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "assistant" ? "A" : $("userAvatar").textContent;
    const body = document.createElement("div"); body.className = "message-body";
    const label = document.createElement("div"); label.className = "message-label";
    label.textContent = role === "assistant" ? "AEGIS" : "VOCÊ";
    const text = document.createElement("div"); text.className = "message-text";
    text.textContent = content;
    body.append(label, text);
    if (role === "assistant") {
      const actions = document.createElement("div"); actions.className = "message-actions";
      const b = document.createElement("button"); b.type = "button"; b.textContent = "Ouvir resposta";
      b.addEventListener("click", () => speak(content));
      actions.append(b); body.append(actions);
    }
    item.append(avatar, body);
    $("messages").append(item);
    $("chatContent").scrollTop = $("chatContent").scrollHeight;
    return item;
  }

  // ---------- IA ----------
  const loadAI = () => {
    const c = LS.get("aegis:ai", {});
    $("aiProvider").value = c.provider || "groq";
    $("aiKey").value = c.key || ""; $("aiModel").value = c.model || "";
    $("aiModel").placeholder = MODELS[$("aiProvider").value];
    $("connectionLabel").textContent = cloud ? "Nuvem conectada" : "Modo demonstração";
    $("connectionSub").textContent = c.key ? `IA: ${NAMES[c.provider || "groq"]}` : "Sem chave de IA";
  };
  $("aiProvider").addEventListener("change", () => { $("aiModel").placeholder = MODELS[$("aiProvider").value]; });
  $("aiForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const key = $("aiKey").value.trim();
    LS.set("aegis:ai", key ? { provider: $("aiProvider").value, key, model: $("aiModel").value.trim() } : {});
    loadAI(); toast(key ? "Chave salva somente neste navegador." : "Chave removida. Voltando ao modo demonstração.");
  });

  async function askAI() {
    const c = LS.get("aegis:ai", {});
    if (!c.key) {
      const last = history[history.length - 1].content.slice(0, 90);
      return `Modo demonstração, ${first()}. Ouvi: “${last}”. Para respostas reais, abra Configurar IA e cole uma chave (a do Groq tem plano grátis).`;
    }
    const p = c.provider || "groq", model = c.model || MODELS[p];
    const mems = $("memoryEnabled").checked ? await db.mems() : [];
    const sys = `Você é o AEGIS, assistente pessoal de voz e texto com tom de sala de comando: preciso, calmo, levemente formal e com um toque de ironia elegante. Responda sempre em português do Brasil e chame o usuário de ${first()}. Suas respostas também são faladas em voz alta: seja breve (até 4 frases), sem markdown, listas longas ou emojis. Se não souber, diga; nunca invente fatos sobre a vida do usuário. Agora: ${new Date().toLocaleString("pt-BR")}.` +
      (mems.length ? `\n\nO que o usuário pediu para você lembrar:\n- ${mems.map((m) => `${m.title}: ${m.content}`).join("\n- ")}` : "");
    const msgs = history.slice(-14);
    while (msgs.length && msgs[0].role !== "user") msgs.shift();
    let r, j;
    if (p === "gemini") {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(c.key)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: msgs.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] })) })
      });
      j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j.error && j.error.message) || `Erro ${r.status} no Gemini.`);
      const t = ((j.candidates || [])[0]?.content?.parts || []).map((x) => x.text || "").join("").trim();
      if (!t) throw new Error("O Gemini não devolveu texto (possível bloqueio de segurança).");
      return t;
    }
    const url = p === "groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
    r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.key}` },
      body: JSON.stringify({ model, temperature: 0.6, messages: [{ role: "system", content: sys }, ...msgs] })
    });
    j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 401 ? "Chave de API recusada (401). Confira em Configurar IA." : (j.error && j.error.message) || `Erro ${r.status} em ${NAMES[p]}.`);
    return (j.choices[0].message.content || "").trim();
  }

  const MEMCMD = /^(?:aegis[,:]?\s*)?(?:(?:lembre-se|guarde|anote)(?:\s+(?:de|que))?|lembra\s+que)\s+(.{3,})/i;
  async function send(raw) {
    const text = raw.trim();
    if (busy || !text) return;
    busy = true; $("sendButton").disabled = true; $("messageInput").value = ""; $("messageInput").style.height = "";
    renderMessage("user", text); history.push({ role: "user", content: text });
    const typing = renderMessage("assistant", "Processando..."); typing.classList.add("typing");
    setState("thinking");
    let answer, good = true;
    try {
      await db.addMsg("user", text);
      const cmd = text.match(MEMCMD);
      if (cmd) {
        const c = cmd[1].trim().replace(/[.!]+$/, "");
        await db.saveMem({ title: c.slice(0, 60), content: c.slice(0, 500) });
        await loadMemories();
        answer = `Registrado, ${first()}. Guardei na sua memória: “${c.slice(0, 120)}”.`;
      } else answer = await askAI();
      await db.addMsg("assistant", answer);
    } catch (e) { good = false; answer = `Não consegui concluir. ${ptErr(e)}`; }
    typing.remove(); renderMessage("assistant", answer);
    if (good) history.push({ role: "assistant", content: answer });
    busy = false; $("sendButton").disabled = false;
    if (voice) speak(answer, () => { if (viaVoice && good) listen(); }); else setState();
  }

  // ---------- voz ----------
  function speak(text, done) {
    if (!("speechSynthesis" in window)) { if (done) done(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*_`#]/g, ""));
    u.lang = "pt-BR";
    const v = speechSynthesis.getVoices().find((x) => x.lang.replace("_", "-").startsWith("pt-BR"));
    if (v) u.voice = v;
    u.onstart = () => setState("speaking");
    u.onend = u.onerror = () => { setState(); if (done) done(); };
    speechSynthesis.speak(u);
  }
  function listen() {
    if (!SR) return toast("Este navegador não tem reconhecimento de voz. Use Chrome ou Edge.");
    if (rec) { rec.stop(); return; }
    speechSynthesis.cancel();
    rec = new SR(); rec.lang = "pt-BR"; rec.interimResults = true;
    rec.onstart = () => { setState("listening"); $("micButton").classList.add("recording"); };
    rec.onresult = (ev) => {
      const r = ev.results[ev.results.length - 1];
      $("messageInput").value = r[0].transcript;
      if (r.isFinal) { viaVoice = true; send(r[0].transcript); }
    };
    rec.onerror = (ev) => { if (ev.error === "not-allowed") toast("Permita o uso do microfone no navegador."); };
    rec.onend = () => { rec = null; $("micButton").classList.remove("recording"); if (!busy) setState(); };
    rec.start();
  }
  $("micButton").addEventListener("click", listen);
  $("voiceToggle").addEventListener("click", () => {
    voice = !voice;
    $("voiceToggle").classList.toggle("enabled", voice);
    $("voiceToggle").innerHTML = `<span>◖</span> Voz ${voice ? "ativada" : "desativada"}`;
    if (voice) speak(`${greeting()} AEGIS online e à sua disposição.`); else { viaVoice = false; speechSynthesis.cancel(); setState(); }
  });

  // ---------- memória ----------
  async function loadMemories() {
    const list = await db.mems();
    $("memoryList").replaceChildren();
    $("memoryCount").textContent = `${list.length} ${list.length === 1 ? "item" : "itens"}`;
    if (!list.length) {
      const d = document.createElement("div"); d.className = "empty-memory";
      d.textContent = "Nenhuma memória salva. Adicione aqui ou diga no chat: “lembre-se que…”.";
      $("memoryList").append(d); return;
    }
    list.forEach((m) => {
      const card = document.createElement("div"); card.className = "memory-card";
      const copy = document.createElement("div");
      const t = document.createElement("strong"); t.textContent = m.title;
      const p = document.createElement("p"); p.textContent = m.content;
      copy.append(t, p);
      const acts = document.createElement("div"); acts.style.cssText = "display:flex;gap:6px;flex-shrink:0";
      const ed = document.createElement("button"); ed.className = "delete-button"; ed.type = "button"; ed.textContent = "Editar";
      ed.style.cssText = "color:#8fe3ff;border-color:rgba(85,217,255,.3)";
      ed.addEventListener("click", () => {
        editId = m.id; $("memoryTitle").value = m.title; $("memoryContent").value = m.content;
        $("memorySubmit").textContent = "✓ Atualizar memória"; $("memoryCancel").classList.remove("hidden");
        $("memoryTitle").focus(); $("memoryForm").scrollIntoView({ behavior: "smooth", block: "center" });
      });
      const del = document.createElement("button"); del.className = "delete-button"; del.type = "button"; del.textContent = "Excluir";
      del.addEventListener("click", async () => {
        if (!confirm("Apagar esta memória?")) return;
        try { await db.delMem(m.id); await loadMemories(); toast("Memória apagada."); } catch (e) { toast(ptErr(e)); }
      });
      acts.append(ed, del); card.append(copy, acts); $("memoryList").append(card);
    });
  }
  function resetMemoryForm() {
    editId = null; $("memoryForm").reset();
    $("memorySubmit").textContent = "＋ Salvar na memória"; $("memoryCancel").classList.add("hidden");
  }
  $("memoryCancel").addEventListener("click", resetMemoryForm);
  $("memoryForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await db.saveMem({ id: editId, title: $("memoryTitle").value.trim(), content: $("memoryContent").value.trim() });
      toast(editId ? "Memória atualizada." : "Memória salva."); resetMemoryForm(); await loadMemories();
    } catch (err) { toast(ptErr(err)); }
  });
  $("memoryEnabled").addEventListener("change", () => db.setPref($("memoryEnabled").checked).catch((e) => toast(ptErr(e))));

  // ---------- interface ----------
  document.querySelectorAll(".nav-button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".nav-button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("hidden", p.id !== b.dataset.panel));
    $("pageTitle").textContent = TITLES[b.dataset.panel];
  }));
  document.querySelectorAll(".suggestion").forEach((b) => b.addEventListener("click", () => { viaVoice = false; send(b.dataset.prompt); }));
  async function newChat() {
    if (!confirm("Apagar esta conversa e começar outra?")) return;
    try { await db.clearMsgs(); history.length = 0; $("messages").replaceChildren(); $("welcome").classList.remove("hidden"); }
    catch (e) { toast(ptErr(e)); }
  }
  $("newChatButton").addEventListener("click", newChat);
  $("newChatTop").addEventListener("click", newChat);
  $("chatForm").addEventListener("submit", (e) => { e.preventDefault(); viaVoice = false; send($("messageInput").value); });
  $("messageInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); viaVoice = false; send($("messageInput").value); }
  });
  $("messageInput").addEventListener("input", (e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; });

  // ---------- início ----------
  (async () => {
    setAuthMode(false);
    if ("speechSynthesis" in window) speechSynthesis.getVoices();
    if (cloud) {
      const { data } = await sb.auth.getSession();
      if (data.session) { user = data.session.user; await enter(); }
    } else if (LS.get("aegis:name")) {
      name = LS.get("aegis:name"); user = { id: "local" }; await enter();
    }
  })();
})();
