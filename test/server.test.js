const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mindly-test-'));
const { server, hashPassword, verifyPassword, seedStore, companyIndicators, MIN_ACTIVE_FOR_INDICATORS, PLANS } = require('../server');

const PASSWORD = 'Mindly123!';
let base;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
});

function call(route, { method = 'GET', body, cookie } = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
}

function sessionOf(response) {
  return response.headers.get('set-cookie').split(';')[0];
}

async function login(email) {
  const response = await call('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  assert.equal(response.status, 200);
  return sessionOf(response);
}

function newCollaborator(key, inviteCode, extra = {}) {
  return { name: `Pessoa ${key}`, alias: `Apelido ${key}`, email: `${key}@teste.mindly`, password: PASSWORD, inviteCode, consent: true, ...extra };
}

test('hash de senha aceita a senha correta e rejeita outra', () => {
  const stored = hashPassword('uma-senha-segura');
  assert.equal(verifyPassword('uma-senha-segura', stored), true);
  assert.equal(verifyPassword('senha-incorreta', stored), false);
  assert.equal(stored.includes('uma-senha-segura'), false);
});

test('colaborador autentica e a área dele fica protegida', async () => {
  assert.equal((await call('/api/dashboard')).status, 401);

  const response = await call('/api/auth/login', { method: 'POST', body: { email: 'ana@demo.mindly', password: PASSWORD } });
  assert.equal(response.status, 200);
  const { user } = await response.json();
  assert.equal(user.role, 'collaborator');
  assert.equal(user.companyName, 'Mercado Bom Vizinho');
  assert.equal(Object.hasOwn(user, 'passwordHash'), false);

  const dashboard = await (await call('/api/dashboard', { cookie: sessionOf(response) })).json();
  assert.equal(dashboard.user.alias, 'Lua Serena');
  assert.equal(dashboard.spaces.length, 1);
  assert.equal(dashboard.referrals[0].status, 'answered');
});

test('catálogo público retorna apenas espaços ativos com próximo encontro no futuro', async () => {
  const { spaces } = await (await call('/api/spaces')).json();
  assert.ok(spaces.length >= 4);
  assert.ok(spaces.every((space) => space.status === 'active'));
  assert.ok(spaces.every((space) => new Date(space.nextMeeting) > new Date()));
});

test('cadastro de colaborador exige código da empresa e consentimento', async () => {
  const invalidCode = await call('/api/auth/register', { method: 'POST', body: newCollaborator('semcodigo', 'MIND-NAOEXISTE') });
  assert.equal(invalidCode.status, 400);

  const noConsent = await call('/api/auth/register', { method: 'POST', body: newCollaborator('semtermo', 'MIND-VIZINHO', { consent: false }) });
  assert.equal(noConsent.status, 400);

  const created = await call('/api/auth/register', { method: 'POST', body: newCollaborator('nova', 'mind-vizinho') });
  assert.equal(created.status, 201);
  const { user } = await created.json();
  assert.equal(user.role, 'collaborator');
  assert.equal(user.companyName, 'Mercado Bom Vizinho');
});

test('painel da empresa mostra só números somados', async () => {
  const cookie = await login('empresa@demo.mindly');
  const response = await call('/api/company', { cookie });
  assert.equal(response.status, 200);
  const text = await response.text();
  const payload = JSON.parse(text);

  assert.equal(payload.indicators.available, true);
  assert.equal(payload.indicators.activeCollaborators, 6);
  assert.equal(payload.indicators.averageMood, 3.5);
  assert.equal(payload.company.inviteCode, 'MIND-VIZINHO');

  const seed = seedStore();
  const privateValues = seed.users.filter((user) => user.role === 'collaborator').flatMap((user) => [user.alias, user.email, user.id]);
  const notes = seed.checkins.concat(seed.referrals).map((record) => record.note).filter(Boolean);
  for (const value of [...privateValues, ...notes]) assert.equal(text.includes(value), false, `o painel expôs "${value}"`);

  assert.equal((await call('/api/dashboard', { cookie })).status, 403);
  assert.equal((await call('/api/company', { cookie: await login('ana@demo.mindly') })).status, 403);
});

test('empresa com poucos colaboradores ativos não recebe indicadores', async () => {
  const payload = await (await call('/api/company', { cookie: await login('aurora@demo.mindly') })).json();
  assert.deepEqual(payload.indicators, { available: false, minimum: MIN_ACTIVE_FOR_INDICATORS, windowDays: 30 });
});

test('indicadores respeitam o grupo mínimo', () => {
  const company = { id: 'cmp_teste' };
  const now = Date.now();
  const recent = new Date(now - 86400000).toISOString();
  const storeWith = (activeCount, respondents) => ({
    users: Array.from({ length: 8 }, (_, index) => ({ id: `u${index}`, role: 'collaborator', companyId: company.id })),
    checkins: Array.from({ length: respondents }, (_, index) => ({ userId: `u${index}`, mood: 4, createdAt: recent })),
    memberships: Array.from({ length: activeCount }, (_, index) => ({ userId: `u${index}`, status: 'approved' })),
    referrals: []
  });

  assert.equal(companyIndicators(company, storeWith(MIN_ACTIVE_FOR_INDICATORS - 1, 2), now).available, false);

  const fewRespondents = companyIndicators(company, storeWith(MIN_ACTIVE_FOR_INDICATORS, MIN_ACTIVE_FOR_INDICATORS - 1), now);
  assert.equal(fewRespondents.available, true);
  assert.equal(fewRespondents.averageMood, null);

  const enough = companyIndicators(company, storeWith(MIN_ACTIVE_FOR_INDICATORS, MIN_ACTIVE_FOR_INDICATORS), now);
  assert.equal(enough.averageMood, 4);
  assert.equal(enough.engagement, 63);

  const old = storeWith(0, MIN_ACTIVE_FOR_INDICATORS);
  old.checkins.forEach((checkin) => { checkin.createdAt = new Date(now - 45 * 86400000).toISOString(); });
  assert.equal(companyIndicators(company, old, now).available, false);
});

test('apoiador vê apenas apelidos e só profissional ou estagiário responde encaminhamento', async () => {
  const professional = await login('lucas@demo.mindly');
  const response = await call('/api/supporter', { cookie: professional });
  const text = await response.text();
  const panel = JSON.parse(text);
  assert.equal(panel.pending[0].alias, 'Sol de Maio');
  assert.equal(panel.canAnswerReferrals, true);
  assert.equal(text.includes('@demo.mindly'), false);
  assert.equal(text.includes('Elisa'), false);

  const referral = panel.referrals.find((item) => item.alias === 'Rio Calmo');
  const volunteer = await login('joao@demo.mindly');
  assert.equal((await (await call('/api/supporter', { cookie: volunteer })).json()).referrals.length, 0);
  const answer = { response: 'Procure a UBS do seu bairro e peça acolhimento em saúde mental.' };
  assert.equal((await call(`/api/referrals/${referral.id}/answer`, { method: 'POST', body: answer, cookie: volunteer })).status, 403);
  assert.equal((await call(`/api/referrals/${referral.id}/answer`, { method: 'POST', body: answer, cookie: professional })).status, 200);

  const dashboard = await (await call('/api/dashboard', { cookie: await login('carla@demo.mindly') })).json();
  assert.equal(dashboard.referrals[0].response, answer.response);
  assert.equal(dashboard.referrals[0].answeredBy, 'Lucas M. · Profissional');
});

test('colaborador pede vaga, o apoiador aprova e o espaço aparece na área', async () => {
  const collaborator = await login('gabi@demo.mindly');
  assert.equal((await call('/api/spaces/spc_travessia/join', { method: 'POST', body: {}, cookie: collaborator })).status, 201);
  assert.equal((await call('/api/spaces/spc_travessia/join', { method: 'POST', body: {}, cookie: collaborator })).status, 409);

  const supporter = await login('lucas@demo.mindly');
  const { pending } = await (await call('/api/supporter', { cookie: supporter })).json();
  const request = pending.find((item) => item.alias === 'Maré Mansa');
  assert.equal((await call(`/api/memberships/${request.id}/approve`, { method: 'POST', body: {}, cookie: supporter })).status, 200);

  const dashboard = await (await call('/api/dashboard', { cookie: collaborator })).json();
  assert.deepEqual(dashboard.spaces.map((space) => space.id), ['spc_travessia']);
});

test('conteúdo completo só aparece para quem tem acesso', async () => {
  const guest = await (await call('/api/contents')).json();
  assert.equal(guest.locked, true);
  assert.ok(guest.contents.every((content) => content.summary && !content.body));

  const member = await (await call('/api/contents', { cookie: await login('ana@demo.mindly') })).json();
  assert.equal(member.locked, false);
  assert.ok(member.contents.every((content) => content.body.length > 0));
});

test('empresa contrata, recebe código e o plano limita as vagas', async () => {
  const contract = await call('/api/companies', { method: 'POST', body: { companyName: 'Padaria Teste', name: 'Rita', email: 'rita@teste.mindly', password: PASSWORD } });
  assert.equal(contract.status, 201);
  const { user, inviteCode } = await contract.json();
  assert.equal(user.role, 'company');
  assert.match(inviteCode, /^MIND-[0-9A-F]{6}$/);

  for (let seat = 1; seat <= PLANS.inicial.seats; seat += 1) {
    const response = await call('/api/auth/register', { method: 'POST', body: newCollaborator(`vaga${seat}`, inviteCode) });
    assert.equal(response.status, 201);
  }
  const overLimit = await call('/api/auth/register', { method: 'POST', body: newCollaborator('semvaga', inviteCode) });
  assert.equal(overLimit.status, 409);

  const panel = await (await call('/api/company', { cookie: sessionOf(contract) })).json();
  assert.equal(panel.plan.seatsUsed, PLANS.inicial.seats);
  assert.equal(panel.indicators.available, false);
});
