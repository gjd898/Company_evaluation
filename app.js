const posts = [
  {
    id: '01963dd1-1ded-70e4-bdbd-988986cf2377',
    parent_id: null,
    root_id: null,
    from_id: 14,
    content: `#### 新店商（山东）信息科技有限公司

迪亚创业园北楼西单元6楼
主要业务：互联网
1.强制加班每天9点以后，经常11点   2.离职后给80%工资  3.如果不加班或者工时达不到就辞退  4.公司内部矛盾严重，扯皮经常发生，老板不懂互联网产品，完全传销模式，还每天喊口号跳舞给人洗脑。5.工作晋升完全依据个人喜好去评判员工（得会拍马屁）  6.产品不挣钱，完全靠每月的招商会（类似传销）。全公司的员工都不给合同。7..去面试过，一点技术不问，就聊你的想法，聊聊家常什么的，说成立三个月就搬到这里了，很有前途，其实对我来说就是吹牛，面试不聊专业方面的东西，你细想 8.离职之后薪资到手特别少，按照30天来计算薪资，全勤根本就拿不到，条件非常苛刻，7天试岗期，第六天被劝退一毛钱薪资也拿不到   9.公司特别坑 三个月试用期 等你快要转正就立马辞退你 而且薪资不按实际出勤天数算  想方设法的克扣薪资 面试的时候说1-3个月试用期可以申请提前转正 实际你真的申请了领导就会不批  10.每周一早上全部员工要喊口号，技术部也要参与 口号是以初恋般的热情和宗教般的信仰.......跟搞传销一样`,
    status: 1,
    is_anonymous: 1,
    is_disable: 0,
    uv: 0,
    pv: 909,
    is_hide: 0,
    last_comment_at: '2024-07-21 17:02:06',
    updated_at: '2026-02-04 11:11:43'
  },
  {
    id: '01963dd1-1e62-718b-a188-4f133344d3eb',
    parent_id: '01963dd1-1ded-70e4-bdbd-988986cf2377',
    root_id: '01963dd1-1ded-70e4-bdbd-988986cf2377',
    from_id: 137,
    content: '哈哈哈哈 就这个公司 长年boss招聘 公司规模还不大 我就知道有问题',
    is_anonymous: 1,
    updated_at: '2025-11-09 22:53:55'
  },
  {
    id: '01963dd1-1ea6-719f-8152-070a7e166005',
    parent_id: '01963dd1-1ded-70e4-bdbd-988986cf2377',
    root_id: '01963dd1-1ded-70e4-bdbd-988986cf2377',
    from_id: 185,
    content: '1.会拍马屁或者能喝酒就能站稳脚跟\n2.经常把我们不提倡加班挂在嘴边，然后问你晚上有事没，加个班吧？ 或者喝点酒去？\n3.每天打卡四次，全勤基本就别考虑了\n4.基本工资抠出20%作为绩效，再抠出3%当作各种公司补贴，美名其曰公司福利好',
    is_anonymous: 1,
    updated_at: '2025-11-24 22:21:31'
  },
  {
    id: '01963dd1-1eea-71fe-8b1a-f0110f4c1282',
    parent_id: '01963dd1-1ded-70e4-bdbd-988986cf2377',
    root_id: '01963dd1-1ded-70e4-bdbd-988986cf2377',
    from_id: 185,
    content: '哈哈，我记得这公司有个色坯头子，女生就别去了',
    is_anonymous: 1,
    updated_at: '2025-11-11 06:05:05'
  },
  {
    id: '01963dd1-1f2f-7003-874a-d7e690c7617b',
    parent_id: '01963dd1-1ded-70e4-bdbd-988986cf2377',
    root_id: '01963dd1-1ded-70e4-bdbd-988986cf2377',
    from_id: 5998,
    content: '<script>alert(‘xss’)</script>',
    is_anonymous: 1,
    updated_at: '2025-04-21 16:25:40'
  }
];

const state = {
  query: '',
  sort: 'hot',
  anonymousOnly: false
};

const rootPosts = posts.filter((p) => !p.parent_id);
const commentsByRoot = posts
  .filter((p) => p.parent_id)
  .reduce((acc, item) => {
    const list = acc.get(item.root_id) || [];
    list.push(item);
    acc.set(item.root_id, list);
    return acc;
  }, new Map());

function getCompanyName(rawContent) {
  const line = rawContent.split('\n').find((text) => text.trim().startsWith('#### '));
  return line ? line.replace('#### ', '').trim() : '未知公司';
}

function riskLevel(post, comments) {
  const badKeywords = ['加班', '克扣', '辞退', '传销', '不给合同', '洗脑', '色坯'];
  const text = [post.content, ...comments.map((c) => c.content)].join(' ');
  const score = badKeywords.reduce((sum, key) => sum + (text.includes(key) ? 1 : 0), 0) + comments.length;
  if (score >= 8) return ['高风险', 'risk-high'];
  if (score >= 4) return ['中风险', 'risk-mid'];
  return ['低风险', 'risk-low'];
}

function safePreview(text, limit = 180) {
  const normalized = text.replace(/^####.*$/m, '').replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function filteredRows() {
  let rows = rootPosts.map((root) => {
    const comments = commentsByRoot.get(root.id) || [];
    return {
      ...root,
      companyName: getCompanyName(root.content),
      comments,
      heat: Number(root.pv || 0) + Number(root.uv || 0)
    };
  });

  const q = state.query.trim().toLowerCase();
  if (q) {
    rows = rows.filter((row) => {
      const corpus = `${row.companyName} ${row.content} ${row.comments.map((c) => c.content).join(' ')}`.toLowerCase();
      return corpus.includes(q);
    });
  }

  if (state.anonymousOnly) {
    rows = rows.filter((row) => row.is_anonymous === 1);
  }

  rows.sort((a, b) => {
    if (state.sort === 'recent') {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    }
    if (state.sort === 'comment') {
      return b.comments.length - a.comments.length;
    }
    return b.heat - a.heat;
  });

  return rows;
}

function renderStats(rows) {
  const totalComments = rows.reduce((sum, row) => sum + row.comments.length, 0);
  const totalHeat = rows.reduce((sum, row) => sum + row.heat, 0);
  const stats = document.getElementById('global-stats');
  stats.innerHTML = '';
  [
    `收录公司 ${rows.length}`,
    `评论总数 ${totalComments}`,
    `平台热度 ${totalHeat}`,
    `更新时间 ${new Date().toLocaleString()}`
  ].forEach((item) => {
    const span = document.createElement('span');
    span.className = 'stat-pill';
    span.textContent = item;
    stats.appendChild(span);
  });
}

function render() {
  const container = document.getElementById('list');
  const rows = filteredRows();
  renderStats(rows);
  container.innerHTML = '';

  if (!rows.length) {
    container.innerHTML = '<article class="panel empty">未找到匹配结果，换个关键词试试。</article>';
    return;
  }

  rows.forEach((row) => {
    const tpl = document.getElementById('company-template').content.cloneNode(true);
    tpl.querySelector('.company-name').textContent = row.companyName;
    tpl.querySelector('.meta').textContent = `评论 ${row.comments.length} 条 · 热度 ${row.heat} · 最近更新 ${row.updated_at || '未知'}`;

    const [riskText, riskClass] = riskLevel(row, row.comments);
    const badge = tpl.querySelector('.badge.risk');
    badge.textContent = riskText;
    badge.classList.add(riskClass);

    tpl.querySelector('.summary').textContent = safePreview(row.content);
    tpl.querySelector('.raw-content').textContent = row.content;

    const commentList = tpl.querySelector('.comment-list');
    if (!row.comments.length) {
      const li = document.createElement('li');
      li.className = 'comment';
      li.textContent = '暂无评论';
      commentList.appendChild(li);
    } else {
      row.comments.forEach((comment, index) => {
        const li = document.createElement('li');
        li.className = 'comment';
        li.textContent = `#${index + 1} ${comment.content}`;
        commentList.appendChild(li);
      });
    }

    container.appendChild(tpl);
  });
}

function bind() {
  document.getElementById('search-input').addEventListener('input', (event) => {
    state.query = event.target.value;
    render();
  });

  document.getElementById('sort-select').addEventListener('change', (event) => {
    state.sort = event.target.value;
    render();
  });

  document.getElementById('only-anonymous').addEventListener('change', (event) => {
    state.anonymousOnly = event.target.checked;
    render();
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    state.query = '';
    state.sort = 'hot';
    state.anonymousOnly = false;
    document.getElementById('search-input').value = '';
    document.getElementById('sort-select').value = 'hot';
    document.getElementById('only-anonymous').checked = false;
    render();
  });
}

bind();
render();
