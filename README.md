# Colmeia CRM 2 — Netlify Database + MCP

CRM pessoal com React, Vite, TypeScript e Tailwind. Salões, clientes, histórico, configurações e lixeira ficam no **Netlify Database (Postgres)**. A interface e o ChatGPT usam a mesma camada de operações e as mesmas regras de negócio.

## Estado desta entrega

O código-fonte do CRM está neste repositório. O destino de publicação é o projeto existente `crmreceptionist`, em `https://crmreceptionist.netlify.app/`. A publicação automática exige conectar a branch `main` deste repositório ao projeto Netlify e configurar as variáveis privadas antes do primeiro build. Colocar o código no GitHub não altera o site publicado nem conecta automaticamente o ChatGPT.

A cada push em `main`, o GitHub Actions executa `npm ci`, os testes e o build. A integração Git da Netlify publica o código da mesma branch após ser vinculada. Não use GitHub Pages: este CRM precisa das Functions e do banco Netlify.

O banco usa as cotas/créditos do plano Netlify. Não há garantia de uso ilimitado gratuito. Confirme disponibilidade e consumo em Data & Storage e Billing da equipe antes de publicar.

## Requisitos

- Node.js 22 e npm.
- Projeto Netlify com acesso a Netlify Database, Functions e variáveis de ambiente.
- Netlify CLI 26 ou superior (use `npx netlify` ou instale a versão atual).
- Para controlar pelo ChatGPT: acesso à criação de um MCP personalizado na sua conta/workspace.

## Publicar no projeto existente

1. Faça um **backup JSON na versão atual** do CRM antes da atualização. Os dados antigos ficam no IndexedDB do seu navegador; não estão na hospedagem.
2. Coloque este código em um repositório conectado ao **mesmo projeto** Netlify ou publique pela CLI, vinculando ao projeto correto. Não publique apenas `dist` via Drop: esta versão precisa das funções e das migrations.
3. Build command: `npm run build`. Publish directory: `dist`. `netlify.toml` já define isso e a pasta de funções.
4. Cadastre as variáveis abaixo na Netlify, com escopo **Functions** e contexto **Production**. Marque os segredos como secretos. Não use prefixo `VITE_` e não coloque segredos no TOML.
5. Faça um deploy com build. A dependência `@netlify/database` permite o provisionamento do banco e a Netlify aplica `netlify/database/migrations/20261116180000_crm_cloud.sql` antes de publicar. Migrations devem estar versionadas; nunca execute DDL manual contra produção.
6. Valide a página de login, entre no CRM e abra Configurações → Banco conectado e ChatGPT → **Migrar dados locais** no mesmo navegador e domínio da versão anterior.
7. Se você estiver em outro dispositivo/domínio, use Importar backup JSON em vez da migração direta.

Exemplo pela CLI, depois de autenticar e vincular o projeto:

```sh
npm ci
npm test
npm run build
npx netlify login
npx netlify link
npx netlify deploy --build
# após validar o deploy e configurar a origem correta para produção:
npx netlify deploy --build --prod
```

Em projetos com deploy contínuo, atualize também o repositório conectado: o próximo push da branch de produção substituirá um deploy manual. A pasta `.netlify` é ignorada pelo Git.

### Variáveis do servidor

| Variável                  | Conteúdo                                                                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CRM_ORIGIN`              | Origem exata, por exemplo `https://crmreceptionist.netlify.app` sem caminho                                                                                                                              |
| `CRM_OWNER_PASSWORD_HASH` | Hash scrypt da senha que você escolher; formato `scrypt$salt$hex`                                                                                                                                        |
| `CRM_SIGNING_SECRET`      | Segredo aleatório de no mínimo 32 caracteres para o consentimento OAuth                                                                                                                                  |
| `CRM_OAUTH_CLIENT_ID`     | ID aleatório do cliente ChatGPT pré-cadastrado                                                                                                                                                           |
| `CRM_OAUTH_CLIENT_SECRET` | Segredo aleatório desse cliente OAuth                                                                                                                                                                    |
| `CRM_OAUTH_REDIRECT_URIS` | Callbacks exatos permitidos, separados por vírgulas. Copie o callback mostrado pelo ChatGPT ao criar a conexão. O callback estável documentado é `https://chatgpt.com/connector_platform_oauth_redirect` |
| `NETLIFY_DB_URL`          | Provisionada pela plataforma. Nunca exponha ao navegador, ao ChatGPT ou no repositório                                                                                                                   |

`npm run setup:local` ajuda a gerar a configuração em um terminal **no seu computador**: pede URL e senha com entrada oculta e grava um `.env` com permissões restritas, ignorado pelo Git. Não sobrescreve um arquivo existente. Guarde sua senha; ela não é gravada em texto puro. **Não envie o `.env` em uma conversa e não o publique**. Os campos OAuth desse arquivo são os que você usará ao cadastrar a conexão no ChatGPT. Para produção, configure esses valores pelo painel seguro da Netlify. Não importe a origem de localhost em produção.

A origem precisa corresponder ao domínio usado para abrir o CRM. Para desenvolvimento use `http://localhost:8888`. Para um Deploy Preview, configure a origem exata daquele preview em um contexto de teste separado; a origem de produção rejeita gravações feitas de outro domínio por proteção contra CSRF. Não compartilhe previews contendo dados de produção: branches de preview podem receber uma cópia desses dados.

## Ativação inicial com senha escolhida por você

A publicação assistida pode configurar um link privado `/setup#TOKEN`. O token é validado pelo hash secreto `CRM_SETUP_TOKEN_HASH` na Netlify. Ele só funciona enquanto não houver proprietário no banco: o primeiro cadastro de senha vence atomicamente, e todos os usos posteriores são recusados. O token fica no fragmento do URL, não nos logs HTTP, e é removido do histórico da barra de endereço ao abrir.

Escolha uma senha de pelo menos 12 caracteres nessa página. O servidor salva somente um hash scrypt e cria sua sessão no CRM. Ninguém precisa receber sua senha pela conversa. Depois da ativação, a senha cadastrada no banco prevalece sobre o hash de contingência da variável `CRM_OWNER_PASSWORD_HASH`.

Após entrar, Configurações → Exibir dados para conectar ao ChatGPT permite copiar as credenciais OAuth da sua integração. A API exige sessão do proprietário e responde com `no-store`; o segredo OAuth não é incluído no código-fonte nem no build estático. A senha do banco nunca é fornecida ao navegador.

## Conectar ao ChatGPT

Depois de publicar e validar o servidor:

1. No ChatGPT web, abra Plugins/Apps e escolha adicionar um servidor MCP personalizado. A disponibilidade e o nome dessa opção dependem da conta e das políticas do workspace.
2. Nome: **Colmeia CRM**. URL: `https://crmreceptionist.netlify.app/mcp`.
3. Escolha **OAuth**, com credenciais estáticas/pré-cadastradas, e informe os valores de `CRM_OAUTH_CLIENT_ID` e `CRM_OAUTH_CLIENT_SECRET` que você configurou. Não escolha “Sem autenticação”.
4. Confira o callback exibido pelo ChatGPT e garanta que esteja exatamente em `CRM_OAUTH_REDIRECT_URIS`; mudanças de variáveis exigem novo deploy.
5. Na janela de autorização do seu CRM, entre com sua senha e autorize a conexão.
6. Instale/habilite o app e selecione-o na conversa (por exemplo, digitando `@`). As confirmações de ações seguem as permissões do ChatGPT.

O servidor usa Streamable HTTP, descoberta de servidor OAuth e de recurso protegido, authorization code com PKCE S256, códigos de cinco minutos de uso único, access tokens de uma hora e refresh tokens rotativos de trinta dias. São armazenados somente hashes de tokens e códigos. Esta implementação é para **um proprietário e um cliente OAuth pré-cadastrado**, sem cadastro público, DCR ou CIMD. Não é um provedor de identidade multiusuário.

As ferramentas disponíveis são:

- Salões: buscar, obter com histórico, adicionar, editar e excluir.
- Clientes: buscar, adicionar, editar e excluir.
- Lixeira: listar e restaurar registros e seus históricos.
- Rotina: consultar pendências, agendar/adiar/cancelar próxima ação, preparar mensagem e registrar interação confirmada.
- Gestão: obter/salvar configurações (incluindo os 24 modelos A/B), consultar painel e consultar auditoria.

Exemplos de pedidos:

> Use o Colmeia CRM para cadastrar o salão Bella Beauty em Orlando, responsável Ana, WhatsApp +1…

> Mostre os contatos atrasados e adie o próximo passo do salão da Camila por três dias.

> A Juliana respondeu que quer uma demonstração. Registre a resposta e agende a próxima ação para sexta às 14h no fuso de São Paulo.

> Atualize o preço do plano Duplo e mantenha as outras configurações.

> Exclua o cliente de teste. Depois, mostre a lixeira.

Não há envio de mensagens pelo MCP. Ele prepara o texto ou registra um envio que você confirmou que realizou. O CRM não lê respostas no WhatsApp, Gmail ou Instagram. Pedidos de SAIR devem virar Não contatar. O MCP permite operações quando é invocado; não transforma esta conversa em um agente rodando continuamente com o ChatGPT fechado.

Documentação oficial: https://developers.openai.com/api/docs/guides/custom-mcp-server e https://developers.openai.com/plugins/build/auth.

## Migração e backups

- A migração direta lê o IndexedDB existente, sem gerar exemplos novos e sem apagar a cópia local.
- Importações são aditivas: IDs existentes e contatos duplicados por telefone, e-mail ou Instagram são ignorados. Configurações do backup só são importadas se o banco estiver vazio.
- O backup JSON inclui salões, interações, clientes, configurações e lixeira. CSV continua exportando apenas os salões.
- Cada navegador passa a consultar o mesmo banco, e a tela atualiza a cada 20 segundos enquanto visível e ao recuperar foco. Não há gravações offline nem fila de sincronização oculta. Com internet indisponível, nenhuma gravação é confirmada.
- Exclusões são lógicas e recuperáveis em Configurações → Lixeira. Não há botão de exclusão definitiva de dados nesta versão.
- Backups locais ainda são úteis, mesmo com banco na nuvem. O lembrete semanal continua disponível.

## Segurança e consistência

- A página estática é pública, mas todos os endpoints de dados exigem autenticação. Não há senha ou conexão do banco no JavaScript publicado.
- O site usa cookie de sessão HttpOnly, Secure, SameSite=Lax, válido por sete dias, e valida Origin em gravações. A senha é verificada por scrypt.
- O MCP usa tokens OAuth diferentes da sessão do navegador. Configurações → Revogar conexões do ChatGPT invalida os tokens OAuth, preservando sua sessão no site.
- Cada registro e configuração possui uma revisão. Gravações desatualizadas retornam conflito e não sobrescrevem silenciosamente edições de outra sessão. Se receber conflito no editor, reabra o registro/modelo para carregar a revisão atual.
- Mutações usam transação e bloqueio da linha do espaço pessoal. Um `request_id` evita repetir a mesma alteração por falha de rede. O ChatGPT deve reaproveitar o UUID para repetir a mesma operação.
- A auditoria registra autor, ação, data, versão e estados anteriores/posteriores. Não há senhas ou tokens na auditoria. Dados de contatos e históricos permanecem privados ao proprietário autenticado.
- O espaço pessoal usa um documento JSONB de até 4 MB, protegido por transações, adequado ao uso individual deste CRM. A auditoria guarda apenas os registros alterados em cada operação e consome armazenamento. Para volumes maiores, particione registros em tabelas e defina retenção da auditoria.
- Rate limiting está declarado nas funções. Não há CORS aberto nem ferramentas de SQL arbitrário.
- Textos de contatos são dados não confiáveis: o servidor instrui o modelo a não tratar observações como instruções.

## Desenvolvimento local e testes

```sh
npm ci
npm run setup:local
npx netlify dev
# em outro terminal, com o banco local ativo:
npx netlify database migrations apply
```

Use o endereço `http://localhost:8888` do Netlify Dev, que encaminha a interface Vite e emula as funções. `npm run dev` sozinho serve apenas a interface, sem API. Se a versão do CLI não iniciar o banco, confira o suporte à dependência `@netlify/database` e a versão exigida; não use um banco de produção para testes locais.

```sh
npm test
npm run build
```

A suíte inclui os 18 testes originais e integração com banco local `@netlify/database-dev`: migrations, CRUD, revisões, duplicados, idempotência, lixeira, importação, cadência no servidor, autenticação, OAuth PKCE, renovação, ferramentas MCP e revogação. Os testes nunca se conectam ao banco hospedado: substituem o cliente por um Postgres local temporário.

O build verifica também os arquivos TypeScript do servidor. A confirmação final de provisionamento, migrations e execução no ambiente Netlify precisa de um deploy autenticado no projeto correto. A instalação da PWA e o comportamento visual devem ser conferidos no navegador de destino.

## Organização

- `src/domain.ts`: regras compartilhadas e tipos de salões, interações e configurações.
- `src/cloud.ts`: cliente HTTP da interface.
- `src/db.ts`: acesso ao legado IndexedDB, usado somente pela migração.
- `src/App.tsx` e `src/components/`: interface, login, Clientes, migração, lixeira e auditoria.
- `netlify/lib/schema.ts`: validação de dados no servidor.
- `netlify/lib/store.ts`: transações, revisões, idempotência e auditoria compartilhadas pela API e pelo MCP.
- `netlify/lib/auth.ts`: sessão, tokens, hashes e validação de origem.
- `netlify/lib/mcp-server.ts`: ferramentas do ChatGPT.
- `netlify/functions/`: endpoints de API, sessão, OAuth e MCP.
- `netlify/database/migrations/`: schema aplicado pela plataforma no deploy.
- `scripts/create-local-config.mjs`: gerador local de configuração, sem segredos no código.
