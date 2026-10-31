# A.E.G.I.S. — assistente pessoal que ouve, fala e lembra

Site estático (HTML/CSS/JS) com visual de sala de comando. Roda no **GitHub Pages**; login e banco ficam no **Supabase** e a IA (Groq, Gemini ou OpenAI) é chamada direto do seu navegador.

```
GitHub Pages (index.html + assets)  ──►  Supabase (login + conversas + memórias, protegidos por usuário)
        └────────────────────────────►  Groq / Gemini / OpenAI (chave só no seu navegador)
```

## Testar agora (modo demonstração)

Abra o `index.html` (ou publique como abaixo) sem configurar nada: o app pede seu nome, guarda tudo no navegador e responde com texto de demonstração até você colocar uma chave de IA.

## 1. Criar o banco no Supabase (grátis)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, cole o conteúdo de `database/supabase.sql` e clique em **Run**. Isso cria as tabelas e as regras (RLS) que impedem qualquer usuário de ler dados de outro.
3. **Project Settings → API**: copie a **Project URL** e a chave **anon public**.
4. Cole os dois valores em `assets/config.js`. A chave anon é pública por natureza e segura com o RLS ligado. **Nunca use a `service_role` aqui.**
5. **Authentication → Providers → Email**: para testar rápido, desative *Confirm email*. Se mantiver ativado, o cadastro pede confirmação pelo link enviado ao e-mail.

## 2. Publicar no GitHub Pages

1. Crie um repositório e envie estes arquivos na raiz.
2. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
3. Quando o endereço (`https://SEU-USUARIO.github.io/SEU-REPO/`) estiver no ar, vá em Supabase → **Authentication → URL Configuration** e coloque esse endereço em **Site URL**.

## 3. Ligar a IA

No app, abra **Configurar IA**, escolha o provedor e cole a chave:

- **Groq** (tem plano grátis): chave em [console.groq.com](https://console.groq.com).
- **Google Gemini**: chave em [aistudio.google.com](https://aistudio.google.com).
- **OpenAI**: chave em [platform.openai.com](https://platform.openai.com) (cobrança separada do ChatGPT).

A chave fica no `localStorage` do seu navegador. Ela não vai para o repositório nem para o Supabase, então você a informa uma vez em cada aparelho. Os nomes de modelo padrão podem mudar com o tempo; se um deles for recusado, escreva outro no campo **Modelo**.

## Como usar

- **Voz:** clique em 🎙 e fale; a mensagem é enviada ao terminar. Com **Voz ativada**, o AEGIS fala as respostas e, se você perguntou falando, volta a ouvir sozinho (conversa contínua). Funciona melhor no Chrome e no Edge e precisa de HTTPS (o GitHub Pages já tem) e permissão de microfone.
- **Memória:** diga “lembre-se que …” no chat ou use a aba **Minha memória**, onde dá para editar e excluir. O interruptor controla se as memórias entram nas respostas.
- **Nome:** o AEGIS cumprimenta você pelo nome cadastrado. Para trocar o nome do assistente, faça uma busca e substituição de `AEGIS` no projeto.

## Privacidade e limites

- As mensagens (e as memórias, se ativadas) são enviadas ao provedor de IA que você escolheu, e ficam no seu Supabase. Quem tiver acesso ao seu navegador também tem acesso à chave; use uma chave com limite de gasto.
- Projetos gratuitos do Supabase podem ser pausados após um período sem uso; é só reativar no painel.
- Esta versão substitui o backend PHP/Python/SQLite do pacote anterior, que não roda no GitHub Pages.
