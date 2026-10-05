# Mindly

MVP funcional de uma plataforma que facilita o acesso ao apoio em saúde para colaboradores. A empresa contrata o Mindly como benefício corporativo e o colaborador acessa, em um único lugar, espaços de conversa, rede de apoio, conteúdos e encaminhamento para ajuda especializada. O Mindly acolhe, orienta e encaminha; não substitui tratamento.

A proposta completa está em `docs/proposta_refac.txt`.

## Executar

Requer Node.js 20 ou superior. Não há dependências externas.

```powershell
npm start
```

Abra `http://localhost:3000`. Para rodar os testes, use `npm test`.

## Contas de demonstração

Todas usam a senha `Mindly123!`.

| Papel | E-mail | O que mostra |
|---|---|---|
| Colaborador | `ana@demo.mindly` | Área do colaborador, check-in e encaminhamento |
| Apoiador (profissional) | `lucas@demo.mindly` | Solicitações de vaga e pedidos de encaminhamento |
| Apoiador (voluntário) | `joao@demo.mindly` | Painel sem acesso aos encaminhamentos |
| Empresa | `empresa@demo.mindly` | Plano, código da equipe e indicadores somados |
| Empresa pequena | `aurora@demo.mindly` | Indicadores ocultos por haver poucos colaboradores ativos |
| Administrador | `admin@demo.mindly` | Moderação |

Para testar o cadastro de um colaborador, use o código da empresa `MIND-VIZINHO`.

O banco demonstrativo é criado em `data/store.json` na primeira execução. Para reiniciar os dados, encerre o servidor e exclua somente esse arquivo.

## Funcionalidades do MVP

- contratação pela empresa, com geração do código de acesso da equipe (pagamento simulado);
- cadastro do colaborador com o código da empresa, apelido público e consentimento;
- limite de vagas por plano;
- catálogo pesquisável de espaços de conversa, com pedido de participação;
- rede de apoio com voluntários, estagiários supervisionados e profissionais;
- conteúdos e orientações, completos apenas para quem tem acesso;
- check-in privado de bem-estar;
- pedido de encaminhamento, respondido por profissional ou estagiário supervisionado;
- painel da empresa com indicadores somados;
- painel administrativo de denúncias;
- senha protegida por `scrypt` e sessões em cookie `HttpOnly`.

## Privacidade

A empresa paga, mas não vê. O painel da empresa nunca recebe nomes, apelidos, anotações ou check-ins individuais. Os indicadores só aparecem quando há pelo menos 5 colaboradores ativos nos últimos 30 dias, e o bem-estar médio só aparece quando pelo menos 5 pessoas fizeram check-in. Apoiadores e administradores veem apenas apelidos.

O preço do plano, o limite de vagas e o grupo mínimo ficam em constantes no início de `server.js` (`PLANS` e `MIN_ACTIVE_FOR_INDICATORS`).

## Limites desta versão

Esta é uma aplicação local para validação e demonstração. Antes de produção, será necessário usar banco transacional, HTTPS, armazenamento seguro de sessões, cobrança real, serviço de e-mail, auditoria, política de retenção, testes de segurança e revisão jurídica/LGPD.
