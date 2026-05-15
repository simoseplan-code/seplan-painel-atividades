#!/usr/bin/env node
/**
 * Busca tarefas, projetos, usuários e departamentos do Bitrix24
 * e gera o arquivo data.json consumido pelo painel.
 *
 * Lê a URL base do webhook da env BITRIX_WEBHOOK
 * (ex: https://seplan.bitrix24.com.br/rest/9/SEU_TOKEN/)
 */

const fs = require('fs');
const path = require('path');

const WEBHOOK = process.env.BITRIX_WEBHOOK;
if (!WEBHOOK) {
  console.error('❌ Variável de ambiente BITRIX_WEBHOOK não definida.');
  process.exit(1);
}

const BASE = WEBHOOK.endsWith('/') ? WEBHOOK : WEBHOOK + '/';

// --- Helpers --------------------------------------------------------------

async function callBitrix(method, params = {}) {
  const url = new URL(BASE + method + '.json');
  // params podem conter objetos aninhados; usamos POST com form-urlencoded
  const body = new URLSearchParams();
  const flatten = (obj, prefix = '') => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (v === null || v === undefined) continue;
      if (Array.isArray(v)) {
        v.forEach((item, i) => {
          if (typeof item === 'object') flatten(item, `${key}[${i}]`);
          else body.append(`${key}[${i}]`, item);
        });
      } else if (typeof v === 'object') {
        flatten(v, key);
      } else {
        body.append(key, v);
      }
    }
  };
  flatten(params);

  const res = await fetch(url, {
    method: 'POST',
    body,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} em ${method}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.error) {
    throw new Error(`Bitrix erro em ${method}: ${json.error_description || json.error}`);
  }
  return json;
}

async function callPaginated(method, params = {}, resultKey = null) {
  let start = 0;
  const all = [];
  while (true) {
    const res = await callBitrix(method, { ...params, start });
    let chunk;
    if (resultKey && res.result && res.result[resultKey]) {
      chunk = res.result[resultKey];
    } else if (Array.isArray(res.result)) {
      chunk = res.result;
    } else if (res.result && Array.isArray(res.result.tasks)) {
      chunk = res.result.tasks;
    } else {
      chunk = res.result || [];
    }
    all.push(...chunk);
    if (res.next !== undefined && res.next !== null) {
      start = res.next;
    } else {
      break;
    }
    if (start > 50000) break; // safety
  }
  return all;
}

// --- Main -----------------------------------------------------------------

async function main() {
  console.log('🔄 Buscando dados do Bitrix24…');

  // 1. Usuários (pra mapear responsável -> nome + departamento)
  console.log('  • Usuários…');
  const users = await callPaginated('user.get', { ACTIVE: true });
  const usersById = {};
  for (const u of users) {
    usersById[u.ID] = {
      id: u.ID,
      name: [u.NAME, u.LAST_NAME].filter(Boolean).join(' ').trim() || u.EMAIL || `Usuário ${u.ID}`,
      email: u.EMAIL || '',
      position: u.WORK_POSITION || '',
      departmentIds: u.UF_DEPARTMENT || [],
      photo: u.PERSONAL_PHOTO || '',
    };
  }

  // 2. Departamentos
  console.log('  • Departamentos…');
  let departments = [];
  try {
    departments = await callPaginated('department.get', {});
  } catch (e) {
    console.warn('  ⚠ department.get falhou:', e.message);
  }
  const departmentsById = {};
  for (const d of departments) {
    departmentsById[d.ID] = { id: d.ID, name: d.NAME, parentId: d.PARENT || null };
  }

  // 3. Projetos / Grupos (sonet_group)
  console.log('  • Projetos/Grupos…');
  let groups = [];
  try {
    groups = await callPaginated('sonet_group.get', { ORDER: { ID: 'ASC' } });
  } catch (e) {
    console.warn('  ⚠ sonet_group.get falhou:', e.message);
  }
  const groupsById = {};
  for (const g of groups) {
    groupsById[g.ID] = {
      id: g.ID,
      name: g.NAME,
      description: g.DESCRIPTION || '',
      ownerId: g.OWNER_ID,
      closed: g.CLOSED === 'Y',
      visible: g.VISIBLE === 'Y',
      opened: g.OPENED === 'Y',
      dateCreate: g.DATE_CREATE,
      dateUpdate: g.DATE_UPDATE,
    };
  }

  // 4. Tarefas — buscar todas em batches (tasks.task.list paginado)
  console.log('  • Tarefas…');
  const taskFields = [
    'ID', 'TITLE', 'DESCRIPTION', 'STATUS', 'PRIORITY',
    'RESPONSIBLE_ID', 'CREATED_BY', 'CREATED_DATE',
    'DEADLINE', 'START_DATE_PLAN', 'END_DATE_PLAN',
    'CLOSED_DATE', 'GROUP_ID', 'TAGS',
  ];
  let tasks = [];
  let taskStart = 0;
  while (true) {
    const res = await callBitrix('tasks.task.list', {
      select: taskFields,
      order: { ID: 'DESC' },
      start: taskStart,
    });
    const chunk = res.result?.tasks || [];
    tasks.push(...chunk);
    if (res.next !== undefined && res.next !== null) {
      taskStart = res.next;
    } else break;
    if (taskStart > 50000) break;
  }

  // Normalizar tarefas
  const STATUS_MAP = {
    '1': 'Nova',
    '2': 'Aguardando execução',
    '3': 'Em andamento',
    '4': 'Aguardando controle',
    '5': 'Concluída',
    '6': 'Adiada',
    '7': 'Recusada',
  };
  const PRIORITY_MAP = { '0': 'Baixa', '1': 'Média', '2': 'Alta' };

  const normalizedTasks = tasks.map(t => {
    const responsibleId = String(t.responsibleId || t.RESPONSIBLE_ID || '');
    const groupId = String(t.groupId || t.GROUP_ID || '');
    const status = String(t.status || t.STATUS || '');
    const deadline = t.deadline || t.DEADLINE || null;
    const closedDate = t.closedDate || t.CLOSED_DATE || null;
    const responsible = usersById[responsibleId];
    return {
      id: String(t.id || t.ID),
      title: t.title || t.TITLE || '(sem título)',
      status,
      statusLabel: STATUS_MAP[status] || status,
      priority: String(t.priority || t.PRIORITY || '1'),
      priorityLabel: PRIORITY_MAP[String(t.priority || t.PRIORITY || '1')] || 'Média',
      responsibleId,
      responsibleName: responsible?.name || '—',
      responsibleDepartments: responsible?.departmentIds || [],
      groupId,
      groupName: groupsById[groupId]?.name || (groupId ? `Grupo ${groupId}` : '—'),
      deadline,
      closedDate,
      createdDate: t.createdDate || t.CREATED_DATE || null,
      isClosed: ['5', '7'].includes(status),
    };
  });

  // Estatísticas por projeto
  const tasksByGroup = {};
  for (const t of normalizedTasks) {
    if (!tasksByGroup[t.groupId]) tasksByGroup[t.groupId] = [];
    tasksByGroup[t.groupId].push(t.id);
  }
  for (const gid of Object.keys(groupsById)) {
    const list = tasksByGroup[gid] || [];
    groupsById[gid].taskCount = list.length;
  }

  const out = {
    generatedAt: new Date().toISOString(),
    counts: {
      users: Object.keys(usersById).length,
      departments: Object.keys(departmentsById).length,
      groups: Object.keys(groupsById).length,
      tasks: normalizedTasks.length,
    },
    users: usersById,
    departments: departmentsById,
    groups: groupsById,
    tasks: normalizedTasks,
  };

  const outPath = path.join(__dirname, '..', 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`✅ Gerado ${outPath}`);
  console.log(`   ${out.counts.tasks} tarefas, ${out.counts.groups} projetos, ${out.counts.users} usuários, ${out.counts.departments} departamentos`);
}

main().catch(err => {
  console.error('❌ Falhou:', err);
  process.exit(1);
});
