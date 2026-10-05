const state = { user: null, route: 'inicio' };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const roleNames = { collaborator: 'Colaborador', supporter: 'Apoiador', company: 'Empresa', admin: 'Administrador' };
const roleRoutes = { area: 'collaborator', apoiador: 'supporter', empresa: 'company', administracao: 'admin' };
const homeRoutes = { collaborator: 'area', supporter: 'apoiador', company: 'empresa', admin: 'administracao' };
const authPanes = ['login', 'register', 'company'];
const demoAccounts = {
  collaborator: ['ana@demo.mindly', 'Mindly123!'],
  supporter: ['lucas@demo.mindly', 'Mindly123!'],
  company: ['empresa@demo.mindly', 'Mindly123!'],
  admin: ['admin@demo.mindly', 'Mindly123!']
};

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a solicitação.');
  return payload;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatDate(value, includeTime = true) {
  if (!value) return 'A confirmar';
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'short', ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(value));
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function initials(name) {
  return String(name || 'MI').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function summaryCards(cards) {
  return cards.map(([label, value]) => `<article class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
}

let toastTimer;
function toast(message, error = false) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.toggle('is-error', error);
  element.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('is-visible'), 3200);
}

function setUser(user) {
  state.user = user;
  document.body.classList.toggle('is-authenticated', Boolean(user));
  document.body.dataset.role = user?.role || 'guest';
  if (user) {
    $('#user-alias').textContent = user.alias;
    $('#user-role').textContent = roleNames[user.role] || user.role;
    $('#user-avatar').textContent = initials(user.alias);
    $('#menu-name').textContent = user.alias;
    $('#menu-email').textContent = user.email;
  }
}

function openAuth(mode = 'login') {
  switchAuth(mode);
  $('#auth-dialog').showModal();
}

function switchAuth(mode) {
  authPanes.forEach((pane) => { $(`#${pane}-pane`).hidden = pane !== mode; });
}

async function navigate(route, updateHash = true) {
  if (!$$('.view').some((view) => view.dataset.view === route)) route = 'inicio';
  const requiredRole = roleRoutes[route];
  if (requiredRole && !state.user) {
    openAuth('login');
    toast('Entre para acessar seu espaço.');
    return;
  }
  if (requiredRole && state.user.role !== requiredRole) return navigate('inicio');
  state.route = route;
  $$('.view').forEach((view) => view.classList.toggle('is-active', view.dataset.view === route));
  $$('.nav-link').forEach((link) => link.classList.toggle('is-active', link.dataset.route === route));
  $('.nav').classList.remove('is-open');
  if (updateHash) history.replaceState(null, '', `#${route}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (route === 'espacos') await loadSpaces();
  if (route === 'rede') await loadNetwork();
  if (route === 'conteudos') await loadContents();
  if (route === 'area') await loadArea();
  if (route === 'apoiador') await loadSupporter();
  if (route === 'empresa') await loadCompany();
  if (route === 'administracao') await loadAdmin();
}

async function loadPlan() {
  try {
    const { plan, minimumForIndicators } = await request('/api/plan');
    $('#plan-name').textContent = plan.name;
    $('#plan-price').textContent = formatMoney(plan.monthlyPrice);
    $('#plan-seats').textContent = `Para até ${plan.seats} colaboradores.`;
    $('#privacy-minimum').textContent = minimumForIndicators;
  } catch { /* a página inicial continua com os valores padrão */ }
}

async function loadSpaces() {
  const query = encodeURIComponent($('#space-search').value.trim());
  const format = encodeURIComponent($('#format-filter').value);
  const grid = $('#space-grid');
  grid.innerHTML = '<div class="loading-card">Carregando espaços…</div>';
  try {
    const { spaces } = await request(`/api/spaces?q=${query}&format=${format}`);
    if (!spaces.length) {
      grid.innerHTML = '<div class="empty-state"><strong>Nenhum espaço encontrado.</strong><p>Tente remover algum filtro.</p></div>';
      return;
    }
    grid.innerHTML = spaces.map((space) => {
      let action = '<button class="button button-primary join-button" data-space-id="' + escapeHtml(space.id) + '">Quero participar</button>';
      if (space.membershipStatus === 'pending') action = '<button class="button status-button" disabled>Solicitação enviada</button>';
      if (space.membershipStatus === 'approved') action = '<button class="button status-button" disabled>Você participa</button>';
      if (space.membershipStatus === 'rejected') action = '<button class="button status-button" disabled>Solicitação recusada</button>';
      return `<article class="group-card">
        <div class="group-card-top"><span class="category-pill">${escapeHtml(space.category)}</span><span class="format-pill">${space.format === 'online' ? '● Online' : '● Presencial'}</span></div>
        <h2>${escapeHtml(space.title)}</h2><p>${escapeHtml(space.description)}</p>
        <div class="group-meta"><span>▣ <strong>${escapeHtml(space.weekdayLabel)}, ${escapeHtml(space.time)}</strong></span><span>♙ Conduzido por <strong>${escapeHtml(space.supporter)}</strong>${space.supporterType ? ` · ${escapeHtml(space.supporterType)}` : ''}</span><span>⌁ ${escapeHtml(space.format === 'online' ? 'Encontro por videochamada' : space.location)}</span></div>
        <div class="group-card-footer"><span class="spots"><strong>${space.available}</strong> vagas disponíveis</span>${action}</div>
      </article>`;
    }).join('');
  } catch (error) {
    grid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function joinSpace(spaceId) {
  if (!state.user) return openAuth('login');
  if (state.user.role !== 'collaborator') return toast('Use uma conta de colaborador para pedir uma vaga.', true);
  try {
    const result = await request(`/api/spaces/${spaceId}/join`, { method: 'POST', body: '{}' });
    toast(result.message);
    await loadSpaces();
  } catch (error) { toast(error.message, true); }
}

async function loadNetwork() {
  const grid = $('#network-grid');
  try {
    const { supporters } = await request('/api/network');
    grid.innerHTML = supporters.length ? supporters.map((person) => `<article class="group-card network-card">
      <div class="network-head"><span class="avatar">${escapeHtml(initials(person.alias))}</span><div><strong>${escapeHtml(person.alias)}</strong><span class="type-pill" data-type="${escapeHtml(person.type)}">${escapeHtml(person.typeLabel)}</span></div></div>
      <p>${escapeHtml(person.bio)}</p>
      <div class="group-meta">${person.supervisor ? `<span>Supervisão de <strong>${escapeHtml(person.supervisor)}</strong></span>` : ''}<span>${person.spaces.length ? `Conduz <strong>${escapeHtml(person.spaces.join(', '))}</strong>` : 'Apoia a rede nos encaminhamentos'}</span></div>
    </article>`).join('') : '<div class="empty-state">A rede de apoio aparecerá aqui.</div>';
  } catch (error) {
    grid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function loadContents() {
  const grid = $('#content-grid');
  try {
    const { locked, contents } = await request('/api/contents');
    $('#content-locked').hidden = !locked;
    grid.innerHTML = contents.map((content) => `<article class="content-card">
      <div class="content-meta"><span class="category-pill">${escapeHtml(content.category)}</span><small>${escapeHtml(content.minutes)} min de leitura</small></div>
      <h2>${escapeHtml(content.title)}</h2><p>${escapeHtml(content.summary)}</p>
      ${content.body ? `<details><summary>Ler orientação</summary>${content.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</details>` : '<button class="text-button" data-open-auth="login">Entrar para ler →</button>'}
    </article>`).join('');
  } catch (error) {
    grid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function referralItem(referral, extra = '') {
  const answered = referral.status === 'answered';
  return `<div class="referral-item">
    <header><strong>${escapeHtml(referral.topic)}</strong><span class="status-pill${answered ? ' is-done' : ''}">${answered ? 'Respondido' : 'Aguardando'}</span></header>
    <small>${referral.alias ? `${escapeHtml(referral.alias)} · ` : ''}${escapeHtml(referral.preference)} · ${escapeHtml(formatDate(referral.createdAt, false))}</small>
    ${referral.note ? `<p>${escapeHtml(referral.note)}</p>` : ''}
    ${answered ? `<div class="referral-response"><small>Orientação de ${escapeHtml(referral.answeredBy)}</small><p>${escapeHtml(referral.response)}</p></div>` : ''}
    ${extra}
  </div>`;
}

async function loadArea() {
  try {
    const dashboard = await request('/api/dashboard');
    $('#dashboard-name').textContent = dashboard.user.alias;
    $('#dashboard-company').textContent = dashboard.user.companyName || 'sua empresa';
    $('#space-count').textContent = dashboard.spaces.length;
    $('#checkin-count').textContent = dashboard.checkinCount;
    const meeting = dashboard.nextMeeting;
    $('#next-meeting-panel').innerHTML = meeting ? `<span class="panel-kicker">PRÓXIMO ENCONTRO</span><h2>${escapeHtml(meeting.title)}</h2><p>${escapeHtml(meeting.description)}</p><div class="next-details"><div><small>Data</small><strong>${escapeHtml(formatDate(meeting.nextMeeting))}</strong></div><div><small>Formato</small><strong>${escapeHtml(meeting.format)}</strong></div><div><small>Com</small><strong>${escapeHtml(meeting.supporter)}</strong></div></div>` : '<span class="panel-kicker">PRÓXIMO PASSO</span><h2>Encontre sua rede</h2><p>Você ainda não participa de nenhum espaço de conversa. Explore os espaços disponíveis e escolha um para começar.</p><button class="button button-primary" data-route="espacos">Explorar espaços</button>';
    $('#my-spaces').innerHTML = dashboard.spaces.length ? dashboard.spaces.map((space) => `<div class="mini-group"><div><strong>${escapeHtml(space.title)}</strong><small>${escapeHtml(space.weekdayLabel)} · ${escapeHtml(space.time)}</small></div><span class="format-pill">${escapeHtml(space.format)}</span></div>`).join('') : '<p>Seus espaços aprovados aparecerão aqui.</p>';
    $('#referral-topic').innerHTML = dashboard.referralTopics.map((topic) => `<option>${escapeHtml(topic)}</option>`).join('');
    $('#referral-preference').innerHTML = Object.entries(dashboard.referralPreferences).map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
    $('#my-referrals').innerHTML = dashboard.referrals.length ? dashboard.referrals.map((referral) => referralItem(referral)).join('') : '<p>Seus pedidos de encaminhamento aparecerão aqui.</p>';
  } catch (error) { toast(error.message, true); }
}

async function loadSupporter() {
  try {
    const data = await request('/api/supporter');
    const participants = data.spaces.reduce((sum, space) => sum + space.participants, 0);
    $('#supporter-stats').innerHTML = summaryCards([['Seu papel na rede', data.typeLabel], ['Espaços ativos', data.spaces.length], ['Participantes', participants], ['Pedidos em aberto', data.pending.length + data.referrals.length]]);
    $('#pending-list').innerHTML = data.pending.length ? data.pending.map((item) => `<div class="request-row"><div><strong>${escapeHtml(item.alias)}</strong><small>Pediu para participar</small></div><div><strong>${escapeHtml(item.space)}</strong><small>${escapeHtml(formatDate(item.joinedAt, false))}</small></div><div class="row-actions"><button class="button button-secondary membership-action" data-id="${escapeHtml(item.id)}" data-action="reject">Recusar</button><button class="button button-primary membership-action" data-id="${escapeHtml(item.id)}" data-action="approve">Aprovar</button></div></div>`).join('') : '<div class="empty-state">Nenhuma solicitação pendente.</div>';
    if (!data.canAnswerReferrals) {
      $('#referral-queue').innerHTML = '<div class="empty-state">Os pedidos de encaminhamento são respondidos por profissionais e estagiários supervisionados.</div>';
      return;
    }
    $('#referral-queue').innerHTML = data.referrals.length ? data.referrals.map((referral) => referralItem(referral, `<form class="answer-form" data-id="${escapeHtml(referral.id)}"><textarea name="response" maxlength="800" required placeholder="Oriente o próximo passo: onde procurar, o que levar, o que esperar."></textarea><button class="button button-primary" type="submit">Enviar orientação</button></form>`)).join('') : '<div class="empty-state">Nenhum pedido de encaminhamento em aberto.</div>';
  } catch (error) { toast(error.message, true); }
}

async function reviewMembership(id, action) {
  try {
    const result = await request(`/api/memberships/${id}/${action}`, { method: 'POST', body: '{}' });
    toast(result.message);
    await loadSupporter();
  } catch (error) { toast(error.message, true); }
}

async function answerReferral(form) {
  try {
    const result = await request(`/api/referrals/${form.dataset.id}/answer`, { method: 'POST', body: JSON.stringify({ response: form.response.value }) });
    toast(result.message);
    await loadSupporter();
  } catch (error) { toast(error.message, true); }
}

async function loadCompany() {
  try {
    const { company, plan, indicators } = await request('/api/company');
    $('#company-name').textContent = company.name;
    $('#company-plan').innerHTML = `<span class="panel-kicker">PLANO CONTRATADO</span><h2>${escapeHtml(plan.name)}</h2><div class="plan-price"><strong>${escapeHtml(formatMoney(plan.monthlyPrice))}</strong><span>por mês</span></div><progress class="seat-progress" max="${escapeHtml(plan.seats)}" value="${escapeHtml(plan.seatsUsed)}"></progress><p class="plan-note">${escapeHtml(plan.seatsUsed)} de ${escapeHtml(plan.seats)} vagas de colaboradores em uso.</p>`;
    $('#company-access').innerHTML = `<span class="panel-kicker">ACESSO DA EQUIPE</span><h2>Código da empresa</h2><div class="code-box">${escapeHtml(company.inviteCode)}</div><p>Compartilhe este código com a equipe. Cada pessoa cria a própria conta e escolhe um apelido.</p>`;
    $('#company-privacy').textContent = indicators.available
      ? `Indicadores somados dos últimos ${indicators.windowDays} dias. Você nunca vê quem usou, o que foi dito ou os check-ins de cada pessoa.`
      : `Os indicadores aparecem a partir de ${indicators.minimum} colaboradores ativos nos últimos ${indicators.windowDays} dias. Isso protege a identidade de quem usa.`;
    $('#company-indicators').innerHTML = indicators.available ? summaryCards([
      ['Colaboradores ativos', indicators.activeCollaborators],
      ['Adesão da equipe', `${indicators.engagement}%`],
      ['Check-ins realizados', indicators.checkins],
      ['Bem-estar médio (1 a 5)', indicators.averageMood === null ? 'Poucos dados' : indicators.averageMood.toLocaleString('pt-BR')],
      ['Participações em espaços', indicators.participations],
      ['Encaminhamentos pedidos', indicators.referrals]
    ]) : '';
  } catch (error) { toast(error.message, true); }
}

async function loadAdmin() {
  try {
    const data = await request('/api/admin');
    $('#admin-stats').innerHTML = summaryCards([['Empresas', data.stats.companies], ['Colaboradores', data.stats.collaborators], ['Espaços ativos', data.stats.spaces], ['Denúncias abertas', data.stats.openReports]]);
    $('#report-list').innerHTML = data.reports.length ? data.reports.map((report) => `<div class="request-row"><div><strong>${escapeHtml(report.reason)}</strong><small>${escapeHtml(report.details)}</small></div><div><strong>${escapeHtml(report.space)}</strong><small>Enviado por ${escapeHtml(report.reporter)}</small></div><div>${report.status === 'open' ? `<button class="button button-primary resolve-report" data-id="${escapeHtml(report.id)}">Marcar como analisada</button>` : '<span class="format-pill">Resolvida</span>'}</div></div>`).join('') : '<div class="empty-state">Nenhuma denúncia recebida.</div>';
  } catch (error) { toast(error.message, true); }
}

async function resolveReport(id) {
  try {
    const result = await request(`/api/reports/${id}/resolve`, { method: 'POST', body: '{}' });
    toast(result.message);
    await loadAdmin();
  } catch (error) { toast(error.message, true); }
}

async function enter(user, message) {
  setUser(user);
  $('#auth-dialog').close();
  toast(message);
  await navigate(homeRoutes[user.role] || 'inicio');
}

document.addEventListener('click', async (event) => {
  const routeButton = event.target.closest('[data-route]');
  if (routeButton) { event.preventDefault(); await navigate(routeButton.dataset.route); }
  const authButton = event.target.closest('[data-open-auth]');
  if (authButton) openAuth(authButton.dataset.openAuth);
  const switchButton = event.target.closest('[data-switch-auth]');
  if (switchButton) switchAuth(switchButton.dataset.switchAuth);
  const demoButton = event.target.closest('[data-demo]');
  if (demoButton) {
    const [email, password] = demoAccounts[demoButton.dataset.demo];
    const form = $('#login-form'); form.email.value = email; form.password.value = password; form.requestSubmit();
  }
  const joinButton = event.target.closest('.join-button');
  if (joinButton) await joinSpace(joinButton.dataset.spaceId);
  const membershipButton = event.target.closest('.membership-action');
  if (membershipButton) await reviewMembership(membershipButton.dataset.id, membershipButton.dataset.action);
  const reportButton = event.target.closest('.resolve-report');
  if (reportButton) await resolveReport(reportButton.dataset.id);
});

document.addEventListener('submit', async (event) => {
  const answerForm = event.target.closest('.answer-form');
  if (answerForm) { event.preventDefault(); await answerReferral(answerForm); }
});

$('#space-filter').addEventListener('submit', (event) => { event.preventDefault(); loadSpaces(); });
$('#format-filter').addEventListener('change', loadSpaces);
$('#mobile-menu-button').addEventListener('click', () => $('.nav').classList.toggle('is-open'));
$('#auth-close').addEventListener('click', () => $('#auth-dialog').close());
$('#profile-button').addEventListener('click', () => { $('#profile-menu').hidden = !$('#profile-menu').hidden; });

$('#referral-cta').addEventListener('click', async () => {
  if (!state.user) return openAuth('login');
  if (state.user.role !== 'collaborator') return toast('O pedido de encaminhamento fica na área do colaborador.');
  await navigate('area');
  $('#referral-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset();
    await enter(result.user, `Bem-vindo, ${result.user.alias}.`);
  } catch (error) { toast(error.message, true); }
});

$('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = { ...Object.fromEntries(new FormData(form)), consent: form.consent.checked };
  try {
    const result = await request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) });
    form.reset();
    await enter(result.user, 'Sua conta foi criada. Bem-vindo ao Mindly.');
  } catch (error) { toast(error.message, true); }
});

$('#company-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const result = await request('/api/companies', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset();
    await enter(result.user, 'Plano contratado. O código da equipe está no painel.');
  } catch (error) { toast(error.message, true); }
});

$('#checkin-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await request('/api/checkins', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset(); toast('Check-in salvo no seu espaço privado.'); await loadArea();
  } catch (error) { toast(error.message, true); }
});

$('#referral-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const result = await request('/api/referrals', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset(); toast(result.message); await loadArea();
  } catch (error) { toast(error.message, true); }
});

$('#logout-button').addEventListener('click', async () => {
  await request('/api/auth/logout', { method: 'POST', body: '{}' });
  setUser(null); $('#profile-menu').hidden = true; toast('Você saiu da conta.'); await navigate('inicio');
});

async function initialize() {
  loadPlan();
  try {
    const { user } = await request('/api/session');
    setUser(user);
    await navigate(location.hash.slice(1) || 'inicio', false);
  } catch {
    setUser(null); await navigate('inicio', false);
  }
}

initialize();
