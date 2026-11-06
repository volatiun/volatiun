// Gera o card "Status do jogador" (SVG animado, estilo pixel/synthwave).
// No GitHub Actions usa GITHUB_TOKEN. Para testar localmente: node stats.mjs --mock saida.svg
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const mock = args.includes('--mock');
const out = args.filter(a => a !== '--mock')[0] || 'dist/stats.svg';
const login = process.env.GH_LOGIN || 'volatiun';

const QUERY = `query($login:String!){ user(login:$login){
  repositories(ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC, first:100){ totalCount
    nodes{ stargazerCount languages(first:10, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name color } } } } }
  contributionsCollection{ totalCommitContributions totalPullRequestContributions totalIssueContributions
    contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } } }
}}`;

async function load() {
  if (mock) {
    const days = [];
    for (let i = 0; i < 365; i++) days.push({ date: `d${i}`, contributionCount: i > 330 && i % 3 ? 2 : 0 });
    return {
      repositories: { totalCount: 1, nodes: [{ stargazerCount: 0, languages: { edges: [
        { size: 7000, node: { name: 'HTML', color: '#e34c26' } }, { size: 2500, node: { name: 'CSS', color: '#663399' } },
        { size: 1800, node: { name: 'JavaScript', color: '#f1e05a' } }] } }] },
      contributionsCollection: { totalCommitContributions: 12, totalPullRequestContributions: 0, totalIssueContributions: 0,
        contributionCalendar: { totalContributions: 12, weeks: [{ contributionDays: days }] } },
    };
  }
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-stats' },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  });
  const j = await r.json();
  if (!j.data?.user) throw new Error(JSON.stringify(j));
  return j.data.user;
}

const u = await load();
const cc = u.contributionsCollection;
const days = cc.contributionCalendar.weeks.flatMap(w => w.contributionDays);
let best = 0, run = 0;
for (const d of days) { run = d.contributionCount > 0 ? run + 1 : 0; best = Math.max(best, run); }
// sequência atual (hoje sem contribuição ainda não quebra a sequência)
let cur = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) cur++;
  else if (i === days.length - 1) continue;
  else break;
}
const stars = u.repositories.nodes.reduce((s, n) => s + n.stargazerCount, 0);
const langs = {};
for (const n of u.repositories.nodes) for (const e of n.languages.edges) {
  langs[e.node.name] ??= { size: 0, color: e.node.color || '#00e5ff' };
  langs[e.node.name].size += e.size;
}
const top = Object.entries(langs).sort((a, b) => b[1].size - a[1].size).slice(0, 5);
const totalLang = top.reduce((s, [, v]) => s + v.size, 0) || 1;

const total = cc.contributionCalendar.totalContributions;
const level = Math.floor(Math.sqrt(total)) + 1;
const xpFloor = (level - 1) ** 2, xpNext = level ** 2;
const xpPct = Math.max(0.04, (total - xpFloor) / (xpNext - xpFloor));

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const W = 820, H = 272;
const rows = [
  ['Contribuições (1 ano)', total], ['Commits', cc.totalCommitContributions], ['Pull requests', cc.totalPullRequestContributions],
  ['Sequência atual', `${cur} dia${cur === 1 ? '' : 's'}`], ['Maior sequência', `${best} dia${best === 1 ? '' : 's'}`],
  ['Repos públicos', u.repositories.totalCount], ['Estrelas', stars],
];

// barra de XP em blocos
const BLOCKS = 20, filled = Math.round(xpPct * BLOCKS);
let xp = '';
for (let i = 0; i < BLOCKS; i++) {
  xp += `<rect x="${30 + i * 14}" y="86" width="12" height="14" fill="${i < filled ? '#00e5ff' : '#3d1466'}"${i < filled ? ` class="blk" style="animation-delay:${(i * 0.05).toFixed(2)}s"` : ''}/>`;
}
const rowSvg = rows.map(([k, v], i) => `
  <text x="30" y="${132 + i * 17}" class="lbl">${esc(k)}</text>
  <text x="330" y="${132 + i * 17}" class="val" text-anchor="end">${esc(v)}</text>`).join('');

let ly = 70;
const langSvg = top.length ? top.map(([name, v], i) => {
  const pct = v.size / totalLang, bw = Math.max(6, Math.round(pct * 330));
  const y = ly + i * 34;
  return `
  <text x="440" y="${y}" class="lbl">${esc(name)}</text>
  <text x="790" y="${y}" class="val" text-anchor="end">${(pct * 100).toFixed(1)}%</text>
  <rect x="440" y="${y + 6}" width="350" height="10" fill="#2a0e4f"/>
  <rect x="440" y="${y + 6}" width="${bw}" height="10" fill="${v.color}" class="bar" style="animation-delay:${(0.3 + i * 0.15).toFixed(2)}s"/>`;
}).join('') : `<text x="440" y="90" class="lbl">Nenhuma linguagem ainda...</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">
<style>
  .t{font:bold 15px 'Courier New',Consolas,monospace;fill:#00e5ff}
  .lbl{font:bold 13px 'Courier New',Consolas,monospace;fill:#e9dcff}
  .val{font:bold 13px 'Courier New',Consolas,monospace;fill:#ffffff}
  .lvl{font:bold 22px 'Courier New',Consolas,monospace;fill:#ff6a8a}
  .ps{font:bold 11px 'Courier New',Consolas,monospace;fill:#ffd65a;animation:pisca 1.1s steps(1) infinite}
  .blk{animation:liga .35s steps(1) both}
  .bar{transform-box:fill-box;transform-origin:left;animation:cresce 1s steps(10) both}
  @keyframes pisca{50%{opacity:0}}
  @keyframes liga{from{fill:#3d1466}to{fill:#00e5ff}}
  @keyframes cresce{from{transform:scaleX(0)}to{transform:scaleX(1)}}
</style>
<rect width="${W}" height="${H}" fill="#12062b"/>
<rect x="4" y="4" width="${W - 8}" height="${H - 8}" fill="#18083a" stroke="#be288c" stroke-width="4"/>
<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#00e5ff" stroke-width="2" stroke-dasharray="6 4"/>
<text x="30" y="44" class="t">&gt; STATUS DO JOGADOR</text>
<text x="30" y="76" class="lvl">LVL ${level}</text>
<text x="130" y="76" class="lbl">XP ${total}/${xpNext}</text>
${xp}
${rowSvg}
<line x1="410" y1="30" x2="410" y2="${H - 30}" stroke="#7a1478" stroke-width="2" stroke-dasharray="4 4"/>
<text x="440" y="44" class="t">&gt; LINGUAGENS</text>
${langSvg}
<text x="790" y="${H - 22}" class="ps" text-anchor="end">PRESS START ▶</text>
</svg>`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, svg);
console.log('card gerado:', out, { total, level, cur, best, stars, langs: top.map(t => t[0]) });
