# Lume — compartilhamento de tela e áudio

Aplicação web simples para duas pessoas conversarem e compartilharem a tela em tempo real, com uma interface inspirada no Discord.

## Funcionalidades

- criação de sala privada com código e link de convite;
- transmissão de tela com áudio do computador e microfone;
- controles separados de microfone, volume enviado e volume recebido;
- modo de tela cheia para quem assiste à transmissão;
- conexão direta entre os navegadores usando WebRTC;
- interface responsiva para computador e celular.

## Como usar

1. Abra o [Lume](https://lume-sala-tralhoto.mrenzoplays95.chatgpt.site).
2. Crie uma sala e envie o link ou código ao seu amigo.
3. Quando compartilhar a tela, selecione uma aba ou tela compatível e marque **Compartilhar áudio** no navegador.

## Executar localmente

Sirva a pasta `dist` com qualquer servidor HTTP estático. Por exemplo:

```bash
python -m http.server 4173 --directory dist
```

Depois acesse `http://localhost:4173`.

## Tecnologias

HTML, CSS, JavaScript, WebRTC, Web Audio API e PeerJS.
