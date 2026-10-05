const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const STORE_VERSION = 2;
const SESSION_COOKIE = 'mindly_session';
const sessions = new Map();

const PLANS = {
  inicial: { name: 'Plano inicial', monthlyPrice: 129.99, seats: 20 }
};
const MIN_ACTIVE_FOR_INDICATORS = 5;
const ACTIVE_WINDOW_DAYS = 30;
const SUPPORTER_TYPES = { voluntario: 'Voluntariado', estagiario: 'Estágio supervisionado', profissional: 'Profissional' };
const REFERRAL_ANSWERERS = ['profissional', 'estagiario'];
const REFERRAL_TOPICS = ['Ansiedade e estresse', 'Tristeza ou desânimo', 'Álcool e outras dependências', 'Luto e perdas', 'Outro assunto'];
const REFERRAL_PREFERENCES = { sus: 'Rede pública (SUS)', rede: 'Profissional da rede Mindly', indefinido: 'Ainda não sei' };
const WEEKDAYS = ['Domingos', 'Segundas-feiras', 'Terças-feiras', 'Quartas-feiras', 'Quintas-feiras', 'Sextas-feiras', 'Sábados'];

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function inviteCode() {
  return `MIND-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored).split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function seedStore() {
  const passwordHash = hashPassword('Mindly123!');
  const now = new Date();
  const daysAgo = (days) => new Date(now.getTime() - days * 86400000).toISOString();
  const createdAt = daysAgo(20);
  const collaborator = (key, name, alias, companyId) => ({ id: `usr_${key}`, name, email: `${key}@demo.mindly`, passwordHash, role: 'collaborator', alias, companyId, consentAt: createdAt, createdAt });

  return {
    version: STORE_VERSION,
    companies: [
      { id: 'cmp_vizinho', name: 'Mercado Bom Vizinho', plan: 'inicial', inviteCode: 'MIND-VIZINHO', createdAt },
      { id: 'cmp_aurora', name: 'Ateliê Aurora', plan: 'inicial', inviteCode: 'MIND-AURORA', createdAt }
    ],
    users: [
      collaborator('ana', 'Ana', 'Lua Serena', 'cmp_vizinho'),
      collaborator('bruno', 'Bruno', 'Beija-flor', 'cmp_vizinho'),
      collaborator('carla', 'Carla', 'Rio Calmo', 'cmp_vizinho'),
      collaborator('diego', 'Diego', 'Vento Leste', 'cmp_vizinho'),
      collaborator('elisa', 'Elisa', 'Sol de Maio', 'cmp_vizinho'),
      collaborator('fabio', 'Fábio', 'Pé de Serra', 'cmp_vizinho'),
      collaborator('gabi', 'Gabriela', 'Maré Mansa', 'cmp_vizinho'),
      collaborator('heitor', 'Heitor', 'Girassol', 'cmp_vizinho'),
      collaborator('iris', 'Íris', 'Nuvem Clara', 'cmp_aurora'),
      collaborator('jonas', 'Jonas', 'Folha Verde', 'cmp_aurora'),
      collaborator('karen', 'Karen', 'Estrela Guia', 'cmp_aurora'),
      { id: 'usr_empresa', name: 'Marta', email: 'empresa@demo.mindly', passwordHash, role: 'company', alias: 'Marta', companyId: 'cmp_vizinho', createdAt },
      { id: 'usr_aurora', name: 'Paulo', email: 'aurora@demo.mindly', passwordHash, role: 'company', alias: 'Paulo', companyId: 'cmp_aurora', createdAt },
      { id: 'usr_lucas', name: 'Lucas', email: 'lucas@demo.mindly', passwordHash, role: 'supporter', alias: 'Lucas M.', supporterType: 'profissional', bio: 'Psicólogo. Conduz espaços de conversa e orienta encaminhamentos.', createdAt },
      { id: 'usr_bia', name: 'Beatriz', email: 'bia@demo.mindly', passwordHash, role: 'supporter', alias: 'Bia R.', supporterType: 'estagiario', supervisorId: 'usr_lucas', bio: 'Estudante de Psicologia em estágio, com supervisão de profissional da rede.', createdAt },
      { id: 'usr_joao', name: 'João', email: 'joao@demo.mindly', passwordHash, role: 'supporter', alias: 'João P.', supporterType: 'voluntario', bio: 'Voluntário da comunidade, com formação em escuta acolhedora.', createdAt },
      { id: 'usr_admin', name: 'Equipe Mindly', email: 'admin@demo.mindly', passwordHash, role: 'admin', alias: 'Equipe Mindly', createdAt }
    ],
    spaces: [
      { id: 'spc_respiro', title: 'Respiro', category: 'Ansiedade e estresse', description: 'Um espaço para desacelerar, falar sobre pressão e ansiedade e trocar formas de cuidar da rotina.', format: 'online', weekday: 1, time: '19:00', capacity: 12, supporterId: 'usr_bia', tags: ['Ansiedade', 'Rotina'], status: 'active' },
      { id: 'spc_recomeco', title: 'Recomeço possível', category: 'Álcool e outras dependências', description: 'Um encontro acolhedor para conversar sobre escolhas, dificuldades e pequenas vitórias, sem julgamentos.', format: 'online', weekday: 2, time: '19:30', capacity: 12, supporterId: 'usr_lucas', tags: ['Redução de danos', 'Acolhimento'], status: 'active' },
      { id: 'spc_travessia', title: 'Travessia', category: 'Luto e perdas', description: 'Para quem atravessa uma perda e quer falar e ouvir no seu tempo, ao lado de quem entende.', format: 'online', weekday: 4, time: '20:00', capacity: 10, supporterId: 'usr_lucas', tags: ['Luto', 'Escuta'], status: 'active' },
      { id: 'spc_cafe', title: 'Café e conversa', category: 'Vida pessoal e trabalho', description: 'Encontro presencial sobre hábitos, autocuidado e construção de redes de apoio.', format: 'presencial', location: 'Centro Comunitário, sala 2', weekday: 6, time: '10:00', capacity: 16, supporterId: 'usr_joao', tags: ['Presencial', 'Hábitos'], status: 'active' }
    ],
    memberships: [
      { id: 'mem_ana', spaceId: 'spc_recomeco', userId: 'usr_ana', status: 'approved', joinedAt: daysAgo(12) },
      { id: 'mem_bruno', spaceId: 'spc_respiro', userId: 'usr_bruno', status: 'approved', joinedAt: daysAgo(10) },
      { id: 'mem_carla', spaceId: 'spc_travessia', userId: 'usr_carla', status: 'approved', joinedAt: daysAgo(9) },
      { id: 'mem_diego', spaceId: 'spc_cafe', userId: 'usr_diego', status: 'approved', joinedAt: daysAgo(6) },
      { id: 'mem_elisa', spaceId: 'spc_recomeco', userId: 'usr_elisa', status: 'pending', joinedAt: daysAgo(1) },
      { id: 'mem_iris', spaceId: 'spc_respiro', userId: 'usr_iris', status: 'approved', joinedAt: daysAgo(5) }
    ],
    checkins: [
      { id: 'chk_ana', userId: 'usr_ana', mood: 4, note: 'Consegui conversar com alguém do espaço quando precisei.', createdAt: daysAgo(1) },
      { id: 'chk_bruno', userId: 'usr_bruno', mood: 3, note: '', createdAt: daysAgo(2) },
      { id: 'chk_carla', userId: 'usr_carla', mood: 2, note: 'Semana pesada.', createdAt: daysAgo(3) },
      { id: 'chk_diego', userId: 'usr_diego', mood: 4, note: '', createdAt: daysAgo(4) },
      { id: 'chk_elisa', userId: 'usr_elisa', mood: 5, note: '', createdAt: daysAgo(2) },
      { id: 'chk_fabio', userId: 'usr_fabio', mood: 3, note: '', createdAt: daysAgo(6) },
      { id: 'chk_iris', userId: 'usr_iris', mood: 3, note: '', createdAt: daysAgo(2) },
      { id: 'chk_jonas', userId: 'usr_jonas', mood: 4, note: '', createdAt: daysAgo(3) }
    ],
    contents: [
      {
        id: 'cnt_pedir_ajuda', title: 'Como pedir ajuda quando é difícil falar', category: 'Primeiros passos', minutes: 3,
        summary: 'Pedir ajuda não exige ter tudo explicado. Veja formas simples de começar.',
        body: [
          'Você não precisa saber exatamente o que está sentindo para pedir ajuda. Uma frase como “não estou bem e queria conversar” já abre a porta.',
          'Escolha alguém ou um espaço em que você se sinta seguro. No Mindly, você participa com um apelido e fala só o que quiser.',
          'Se falar for difícil, escreva. Registrar um check-in ou mandar uma mensagem curta também é um jeito de começar.'
        ]
      },
      {
        id: 'cnt_respiracao', title: 'Um minuto de respiração para momentos de tensão', category: 'Ansiedade e estresse', minutes: 2,
        summary: 'Um exercício curto para fazer em qualquer lugar, inclusive no trabalho.',
        body: [
          'Sente-se com os pés no chão. Inspire pelo nariz contando até quatro, segure contando até quatro, solte o ar contando até quatro e espere mais quatro antes de recomeçar.',
          'Repita por cerca de um minuto. Se sentir tontura ou desconforto, volte a respirar normalmente.',
          'O exercício ajuda a atravessar um momento de tensão, mas não resolve a causa. Se a ansiedade aparece com frequência, vale conversar com alguém da rede.'
        ]
      },
      {
        id: 'cnt_quando_procurar', title: 'Quando vale procurar ajuda profissional', category: 'Encaminhamento', minutes: 3,
        summary: 'Alguns sinais indicam que o apoio entre pessoas precisa caminhar junto com o cuidado especializado.',
        body: [
          'Vale procurar um profissional quando tristeza, ansiedade ou irritação duram semanas e atrapalham o sono, o trabalho ou as relações.',
          'Também é um sinal importante usar álcool ou outras substâncias para aguentar o dia, ou sentir que perdeu o controle sobre esse uso.',
          'Peça um encaminhamento na sua área do Mindly: alguém da rede orienta o próximo passo.',
          'Se você pensa em se machucar ou está em risco agora, não espere: ligue para o CVV no 188 ou para o SAMU no 192, ou vá a uma UPA ou pronto-socorro.'
        ]
      },
      {
        id: 'cnt_sus', title: 'Como funciona o cuidado em saúde mental no SUS', category: 'Encaminhamento', minutes: 3,
        summary: 'Entenda por onde começar na rede pública e o que cada serviço faz.',
        body: [
          'A Unidade Básica de Saúde (UBS) é a porta de entrada. Lá você pode pedir acolhimento e ser orientado sobre o cuidado mais adequado.',
          'Os Centros de Atenção Psicossocial (CAPS) cuidam de situações de sofrimento mais intenso. O CAPS AD é voltado ao uso de álcool e outras drogas.',
          'Em urgência, procure uma UPA ou pronto-socorro, ou acione o SAMU pelo 192.'
        ]
      },
      {
        id: 'cnt_apoiar_colega', title: 'Como apoiar um colega sem invadir', category: 'Vida pessoal e trabalho', minutes: 3,
        summary: 'Estar presente ajuda mais do que ter a resposta certa.',
        body: [
          'Comece ouvindo. Perguntar “como você está de verdade?” e escutar sem interromper vale mais do que dar conselhos.',
          'Evite diagnosticar ou minimizar. Frases como “isso é frescura” ou “você tem que reagir” afastam quem precisa de apoio.',
          'Respeite o tempo e a privacidade da pessoa. Você pode sugerir o Mindly e se oferecer para acompanhar, sem insistir.'
        ]
      }
    ],
    referrals: [
      { id: 'ref_ana', userId: 'usr_ana', topic: 'Álcool e outras dependências', preference: 'sus', note: 'Queria saber por onde começar a buscar acompanhamento.', status: 'answered', response: 'Procure a UBS mais próxima da sua casa e peça acolhimento em saúde mental. Leve um documento com foto. A equipe avalia com você se o cuidado segue na própria UBS ou em um CAPS AD.', supporterId: 'usr_lucas', createdAt: daysAgo(8), answeredAt: daysAgo(7) },
      { id: 'ref_carla', userId: 'usr_carla', topic: 'Luto e perdas', preference: 'indefinido', note: 'Não sei se preciso de terapia ou se o espaço de conversa basta.', status: 'open', createdAt: daysAgo(1) }
    ],
    reports: [
      { id: 'rpt_demo', reporterId: 'usr_ana', spaceId: 'spc_recomeco', reason: 'Conteúdo fora do propósito do espaço', details: 'Registro demonstrativo para o painel administrativo.', status: 'open', createdAt: daysAgo(2) }
    ]
  };
}

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(STORE_FILE)) {
    if (JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')).version === STORE_VERSION) return;
    fs.renameSync(STORE_FILE, path.join(DATA_DIR, 'store.anterior.json'));
  }
  fs.writeFileSync(STORE_FILE, JSON.stringify(seedStore(), null, 2));
}

function readStore() {
  if (!fs.existsSync(STORE_FILE)) ensureStore();
  return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
}

function writeStore(store) {
  const temp = `${STORE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2));
  fs.renameSync(temp, STORE_FILE);
}

function userView(user, store) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  const company = store.companies.find((candidate) => candidate.id === user.companyId);
  return company ? { ...safe, companyName: company.name } : safe;
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { ...securityHeaders, ...jsonHeaders, ...extraHeaders });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((item) => item.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

function startSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  return { 'Set-Cookie': `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` };
}

function currentUser(req, store) {
  const token = parseCookies(req)[SESSION_COOKIE];
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return store.users.find((user) => user.id === session.userId) || null;
}

function requireUser(req, res, store, roles = []) {
  const user = currentUser(req, store);
  if (!user) {
    sendJson(res, 401, { error: 'Faça login para continuar.' });
    return null;
  }
  if (roles.length && !roles.includes(user.role)) {
    sendJson(res, 403, { error: 'Você não tem permissão para esta ação.' });
    return null;
  }
  return user;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('PAYLOAD_TOO_LARGE'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function accountError(name, email, password, store) {
  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 10) {
    return [400, 'Revise os dados. A senha deve ter pelo menos 10 caracteres.'];
  }
  if (store.users.some((candidate) => candidate.email.toLowerCase() === email)) {
    return [409, 'Este e-mail já está cadastrado.'];
  }
  return null;
}

function nextMeeting(space, now = new Date()) {
  const [hour, minute] = space.time.split(':').map(Number);
  const date = new Date(now);
  date.setHours(hour, minute, 0, 0);
  const diff = (space.weekday - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + (diff === 0 && date <= now ? 7 : diff));
  return date.toISOString();
}

function spaceView(space, store, user) {
  const supporter = store.users.find((candidate) => candidate.id === space.supporterId);
  const approved = store.memberships.filter((membership) => membership.spaceId === space.id && membership.status === 'approved');
  const mine = user && store.memberships.find((membership) => membership.spaceId === space.id && membership.userId === user.id);
  return {
    ...space,
    weekdayLabel: WEEKDAYS[space.weekday],
    nextMeeting: nextMeeting(space),
    supporter: supporter?.alias || 'Rede de apoio',
    supporterType: SUPPORTER_TYPES[supporter?.supporterType] || null,
    participants: approved.length,
    available: Math.max(0, space.capacity - approved.length),
    membershipStatus: mine?.status || null
  };
}

function referralView(referral, store) {
  const supporter = store.users.find((candidate) => candidate.id === referral.supporterId);
  return {
    id: referral.id,
    topic: referral.topic,
    preference: REFERRAL_PREFERENCES[referral.preference],
    note: referral.note,
    status: referral.status,
    response: referral.response || null,
    answeredBy: supporter ? `${supporter.alias} · ${SUPPORTER_TYPES[supporter.supporterType]}` : null,
    createdAt: referral.createdAt,
    answeredAt: referral.answeredAt || null
  };
}

function dashboardFor(user, store) {
  const memberships = store.memberships.filter((membership) => membership.userId === user.id && membership.status === 'approved');
  const spaces = memberships
    .map((membership) => store.spaces.find((space) => space.id === membership.spaceId))
    .filter(Boolean)
    .map((space) => spaceView(space, store, user));
  const checkins = store.checkins.filter((checkin) => checkin.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const referrals = store.referrals.filter((referral) => referral.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    user: userView(user, store),
    spaces,
    nextMeeting: spaces.slice().sort((a, b) => a.nextMeeting.localeCompare(b.nextMeeting))[0] || null,
    latestCheckin: checkins[0] || null,
    checkinCount: checkins.length,
    referrals: referrals.map((referral) => referralView(referral, store)),
    referralTopics: REFERRAL_TOPICS,
    referralPreferences: REFERRAL_PREFERENCES
  };
}

// A empresa só recebe números somados, e só quando há gente suficiente para ninguém ser identificado.
function companyIndicators(company, store, now = Date.now()) {
  const since = new Date(now - ACTIVE_WINDOW_DAYS * 86400000).toISOString();
  const collaborators = new Set(store.users.filter((user) => user.role === 'collaborator' && user.companyId === company.id).map((user) => user.id));
  const checkins = store.checkins.filter((checkin) => collaborators.has(checkin.userId) && checkin.createdAt >= since);
  const participations = store.memberships.filter((membership) => collaborators.has(membership.userId) && membership.status === 'approved');
  const referrals = store.referrals.filter((referral) => collaborators.has(referral.userId) && referral.createdAt >= since);
  const active = new Set([...checkins, ...participations, ...referrals].map((record) => record.userId));
  const base = { minimum: MIN_ACTIVE_FOR_INDICATORS, windowDays: ACTIVE_WINDOW_DAYS };
  if (active.size < MIN_ACTIVE_FOR_INDICATORS) return { available: false, ...base };
  const respondents = new Set(checkins.map((checkin) => checkin.userId));
  const moodTotal = checkins.reduce((sum, checkin) => sum + checkin.mood, 0);
  return {
    available: true,
    ...base,
    activeCollaborators: active.size,
    engagement: Math.round((active.size / collaborators.size) * 100),
    checkins: checkins.length,
    averageMood: respondents.size >= MIN_ACTIVE_FOR_INDICATORS ? Number((moodTotal / checkins.length).toFixed(1)) : null,
    participations: participations.length,
    referrals: referrals.length
  };
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
}

async function api(req, res, url) {
  const store = readStore();
  const method = req.method || 'GET';

  if (method !== 'GET' && !isSameOrigin(req)) {
    return sendJson(res, 403, { error: 'Origem da requisição não permitida.' });
  }

  if (method === 'GET' && url.pathname === '/api/session') {
    return sendJson(res, 200, { user: userView(currentUser(req, store), store) });
  }

  if (method === 'GET' && url.pathname === '/api/plan') {
    return sendJson(res, 200, { plan: PLANS.inicial, minimumForIndicators: MIN_ACTIVE_FOR_INDICATORS });
  }

  if (method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(req);
    const user = store.users.find((candidate) => candidate.email.toLowerCase() === String(body.email || '').trim().toLowerCase());
    if (!user || !verifyPassword(String(body.password || ''), user.passwordHash)) {
      return sendJson(res, 401, { error: 'E-mail ou senha inválidos.' });
    }
    return sendJson(res, 200, { user: userView(user, store) }, startSession(user));
  }

  if (method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const alias = String(body.alias || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const code = String(body.inviteCode || '').trim().toUpperCase();
    const invalid = alias.length < 2 ? [400, 'Escolha um apelido com pelo menos 2 caracteres.'] : accountError(name, email, password, store);
    if (invalid) return sendJson(res, invalid[0], { error: invalid[1] });
    if (body.consent !== true) return sendJson(res, 400, { error: 'É preciso aceitar o termo de uso dos dados para criar a conta.' });
    const company = store.companies.find((candidate) => candidate.inviteCode === code);
    if (!company) return sendJson(res, 400, { error: 'Código da empresa inválido. Confira com quem cuida do Mindly na sua empresa.' });
    const seatsUsed = store.users.filter((candidate) => candidate.role === 'collaborator' && candidate.companyId === company.id).length;
    if (seatsUsed >= PLANS[company.plan].seats) return sendJson(res, 409, { error: 'As vagas do plano desta empresa acabaram. Avise quem cuida do Mindly na sua empresa.' });
    const now = new Date().toISOString();
    const user = { id: id('usr'), name, alias, email, passwordHash: hashPassword(password), role: 'collaborator', companyId: company.id, consentAt: now, createdAt: now };
    store.users.push(user);
    writeStore(store);
    return sendJson(res, 201, { user: userView(user, store) }, startSession(user));
  }

  if (method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) sessions.delete(token);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
  }

  if (method === 'POST' && url.pathname === '/api/companies') {
    const body = await readBody(req);
    const companyName = String(body.companyName || '').trim();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const invalid = companyName.length < 2 ? [400, 'Informe o nome da empresa.'] : accountError(name, email, password, store);
    if (invalid) return sendJson(res, invalid[0], { error: invalid[1] });
    const now = new Date().toISOString();
    const company = { id: id('cmp'), name: companyName, plan: 'inicial', inviteCode: inviteCode(), createdAt: now };
    const user = { id: id('usr'), name, alias: name, email, passwordHash: hashPassword(password), role: 'company', companyId: company.id, createdAt: now };
    store.companies.push(company);
    store.users.push(user);
    writeStore(store);
    return sendJson(res, 201, { user: userView(user, store), inviteCode: company.inviteCode }, startSession(user));
  }

  if (method === 'GET' && url.pathname === '/api/spaces') {
    const user = currentUser(req, store);
    const query = String(url.searchParams.get('q') || '').toLowerCase();
    const format = String(url.searchParams.get('format') || 'all');
    const spaces = store.spaces
      .filter((space) => space.status === 'active')
      .filter((space) => !query || `${space.title} ${space.category} ${space.description} ${space.tags.join(' ')}`.toLowerCase().includes(query))
      .filter((space) => format === 'all' || space.format === format)
      .map((space) => spaceView(space, store, user));
    return sendJson(res, 200, { spaces });
  }

  if (method === 'GET' && url.pathname === '/api/network') {
    const supporters = store.users
      .filter((user) => user.role === 'supporter')
      .map((user) => ({
        alias: user.alias,
        type: user.supporterType,
        typeLabel: SUPPORTER_TYPES[user.supporterType],
        bio: user.bio || '',
        supervisor: store.users.find((candidate) => candidate.id === user.supervisorId)?.alias || null,
        spaces: store.spaces.filter((space) => space.supporterId === user.id && space.status === 'active').map((space) => space.title)
      }));
    return sendJson(res, 200, { supporters });
  }

  if (method === 'GET' && url.pathname === '/api/contents') {
    const user = currentUser(req, store);
    const contents = store.contents.map(({ body, ...preview }) => (user ? { ...preview, body } : preview));
    return sendJson(res, 200, { locked: !user, contents });
  }

  if (method === 'GET' && url.pathname === '/api/dashboard') {
    const user = requireUser(req, res, store, ['collaborator']);
    if (!user) return;
    return sendJson(res, 200, dashboardFor(user, store));
  }

  const joinMatch = url.pathname.match(/^\/api\/spaces\/([^/]+)\/join$/);
  if (method === 'POST' && joinMatch) {
    const user = requireUser(req, res, store, ['collaborator']);
    if (!user) return;
    const space = store.spaces.find((candidate) => candidate.id === joinMatch[1] && candidate.status === 'active');
    if (!space) return sendJson(res, 404, { error: 'Espaço não encontrado.' });
    if (store.memberships.some((membership) => membership.spaceId === space.id && membership.userId === user.id)) {
      return sendJson(res, 409, { error: 'Você já possui uma solicitação para este espaço.' });
    }
    const approvedCount = store.memberships.filter((membership) => membership.spaceId === space.id && membership.status === 'approved').length;
    if (approvedCount >= space.capacity) return sendJson(res, 409, { error: 'Este espaço está sem vagas no momento.' });
    store.memberships.push({ id: id('mem'), spaceId: space.id, userId: user.id, status: 'pending', joinedAt: new Date().toISOString() });
    writeStore(store);
    return sendJson(res, 201, { message: 'Solicitação enviada a quem conduz o espaço.' });
  }

  if (method === 'POST' && url.pathname === '/api/checkins') {
    const user = requireUser(req, res, store, ['collaborator']);
    if (!user) return;
    const body = await readBody(req);
    const mood = Number(body.mood);
    const note = String(body.note || '').trim().slice(0, 400);
    if (!Number.isInteger(mood) || mood < 1 || mood > 5) return sendJson(res, 400, { error: 'Selecione como você está se sentindo.' });
    const checkin = { id: id('chk'), userId: user.id, mood, note, createdAt: new Date().toISOString() };
    store.checkins.push(checkin);
    writeStore(store);
    return sendJson(res, 201, { checkin });
  }

  if (method === 'POST' && url.pathname === '/api/referrals') {
    const user = requireUser(req, res, store, ['collaborator']);
    if (!user) return;
    const body = await readBody(req);
    const topic = String(body.topic || '');
    const preference = String(body.preference || '');
    const note = String(body.note || '').trim().slice(0, 400);
    if (!REFERRAL_TOPICS.includes(topic) || !Object.hasOwn(REFERRAL_PREFERENCES, preference)) {
      return sendJson(res, 400, { error: 'Escolha o assunto e o tipo de ajuda que você procura.' });
    }
    store.referrals.push({ id: id('ref'), userId: user.id, topic, preference, note, status: 'open', createdAt: new Date().toISOString() });
    writeStore(store);
    return sendJson(res, 201, { message: 'Pedido enviado. Alguém da rede vai orientar o próximo passo.' });
  }

  if (method === 'GET' && url.pathname === '/api/supporter') {
    const user = requireUser(req, res, store, ['supporter']);
    if (!user) return;
    const spaces = store.spaces.filter((space) => space.supporterId === user.id);
    const aliasOf = (userId) => store.users.find((candidate) => candidate.id === userId)?.alias || 'Colaborador';
    const pending = store.memberships
      .filter((membership) => membership.status === 'pending' && spaces.some((space) => space.id === membership.spaceId))
      .map((membership) => ({
        id: membership.id,
        alias: aliasOf(membership.userId),
        space: spaces.find((space) => space.id === membership.spaceId).title,
        joinedAt: membership.joinedAt
      }));
    const canAnswerReferrals = REFERRAL_ANSWERERS.includes(user.supporterType);
    const referrals = canAnswerReferrals
      ? store.referrals.filter((referral) => referral.status === 'open').map((referral) => ({ ...referralView(referral, store), alias: aliasOf(referral.userId) }))
      : [];
    return sendJson(res, 200, {
      typeLabel: SUPPORTER_TYPES[user.supporterType],
      spaces: spaces.map((space) => spaceView(space, store, user)),
      pending,
      canAnswerReferrals,
      referrals
    });
  }

  const approvalMatch = url.pathname.match(/^\/api\/memberships\/([^/]+)\/(approve|reject)$/);
  if (method === 'POST' && approvalMatch) {
    const user = requireUser(req, res, store, ['supporter']);
    if (!user) return;
    const membership = store.memberships.find((candidate) => candidate.id === approvalMatch[1]);
    const space = membership && store.spaces.find((candidate) => candidate.id === membership.spaceId);
    if (!membership || !space || space.supporterId !== user.id) return sendJson(res, 404, { error: 'Solicitação não encontrada.' });
    membership.status = approvalMatch[2] === 'approve' ? 'approved' : 'rejected';
    membership.reviewedAt = new Date().toISOString();
    writeStore(store);
    return sendJson(res, 200, { message: membership.status === 'approved' ? 'Participante aprovado.' : 'Solicitação recusada.' });
  }

  const answerMatch = url.pathname.match(/^\/api\/referrals\/([^/]+)\/answer$/);
  if (method === 'POST' && answerMatch) {
    const user = requireUser(req, res, store, ['supporter']);
    if (!user) return;
    if (!REFERRAL_ANSWERERS.includes(user.supporterType)) {
      return sendJson(res, 403, { error: 'Encaminhamentos são respondidos por profissionais e estagiários supervisionados.' });
    }
    const body = await readBody(req);
    const response = String(body.response || '').trim().slice(0, 800);
    const referral = store.referrals.find((candidate) => candidate.id === answerMatch[1] && candidate.status === 'open');
    if (!referral) return sendJson(res, 404, { error: 'Pedido não encontrado.' });
    if (response.length < 10) return sendJson(res, 400, { error: 'Escreva uma orientação para a pessoa.' });
    Object.assign(referral, { status: 'answered', response, supporterId: user.id, answeredAt: new Date().toISOString() });
    writeStore(store);
    return sendJson(res, 200, { message: 'Orientação enviada.' });
  }

  if (method === 'GET' && url.pathname === '/api/company') {
    const user = requireUser(req, res, store, ['company']);
    if (!user) return;
    const company = store.companies.find((candidate) => candidate.id === user.companyId);
    if (!company) return sendJson(res, 404, { error: 'Empresa não encontrada.' });
    const seatsUsed = store.users.filter((candidate) => candidate.role === 'collaborator' && candidate.companyId === company.id).length;
    return sendJson(res, 200, {
      company: { name: company.name, inviteCode: company.inviteCode },
      plan: { ...PLANS[company.plan], seatsUsed },
      indicators: companyIndicators(company, store)
    });
  }

  if (method === 'GET' && url.pathname === '/api/admin') {
    const user = requireUser(req, res, store, ['admin']);
    if (!user) return;
    const reports = store.reports.map((report) => ({
      id: report.id,
      reason: report.reason,
      details: report.details,
      status: report.status,
      space: store.spaces.find((space) => space.id === report.spaceId)?.title || 'Espaço',
      reporter: store.users.find((candidate) => candidate.id === report.reporterId)?.alias || 'Colaborador'
    }));
    return sendJson(res, 200, {
      stats: {
        companies: store.companies.length,
        collaborators: store.users.filter((candidate) => candidate.role === 'collaborator').length,
        spaces: store.spaces.filter((space) => space.status === 'active').length,
        openReports: store.reports.filter((report) => report.status === 'open').length
      },
      reports
    });
  }

  const reportMatch = url.pathname.match(/^\/api\/reports\/([^/]+)\/resolve$/);
  if (method === 'POST' && reportMatch) {
    const user = requireUser(req, res, store, ['admin']);
    if (!user) return;
    const report = store.reports.find((candidate) => candidate.id === reportMatch[1]);
    if (!report) return sendJson(res, 404, { error: 'Denúncia não encontrada.' });
    report.status = 'resolved';
    report.resolvedAt = new Date().toISOString();
    writeStore(store);
    return sendJson(res, 200, { message: 'Denúncia marcada como analisada.' });
  }

  return sendJson(res, 404, { error: 'Rota não encontrada.' });
}

function serveStatic(req, res, url) {
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Página não encontrada.');
  }
  const extension = path.extname(filePath);
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
  res.writeHead(200, { ...securityHeaders, 'Content-Type': types[extension] || 'application/octet-stream', 'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=3600' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { error: error.message === 'INVALID_JSON' ? 'JSON inválido.' : 'Não foi possível concluir a solicitação.' });
    else res.end();
  }
});

ensureStore();

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Mindly disponível em http://${HOST}:${PORT}`);
  });
}

module.exports = { server, hashPassword, verifyPassword, seedStore, companyIndicators, MIN_ACTIVE_FOR_INDICATORS, PLANS };
