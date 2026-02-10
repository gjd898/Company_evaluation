const state = {
  query: '',
  sort: 'hot',
  anonymousOnly: false,
  rows: []
};

function getCompanyName(rawContent) {
  const line = String(rawContent || '').split('\n').find((text) => text.trim().startsWith('#### '));
  return line ? line.replace('#### ', '').trim() : '未知公司';
}

function riskLevel(post, comments) {
  const badKeywords = ['加班', '克扣', '辞退', '传销', '不给合同', '洗脑', '骚扰', '试岗'];
  const text = [post.content, ...comments.map((c) => c.content)].join(' ');
  const score = badKeywords.reduce((sum, key) => sum + (text.includes(key) ? 1 : 0), 0) + comments.length;
  if (score >= 8) return ['高风险', 'risk-high'];
  if (score >= 4) return ['中风险', 'risk-mid'];
  return ['低风险', 'risk-low'];
}

function safePreview(text, limit = 180) {
  const normalized = String(text || '').replace(/^####.*$/m, '').replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function normalizedRows() {
  return (state.rows || []).map((root) => ({
    ...root,
    companyName: getCompanyName(root.content),
    comments: root.comments || [],
    heat: Number(root.pv || 0) + Number(root.uv || 0)
  }));
}

function filteredRows() {
  let rows = normalizedRows();
  const q = state.query.trim().toLowerCase();

  if (q) {
    rows = rows.filter((row) => {
      const corpus = `${row.companyName} ${row.content} ${row.comments.map((c) => c.content).join(' ')}`.toLowerCase();
      return corpus.includes(q);
    });
  }

  if (state.anonymousOnly) {
    rows = rows.filter((row) => Number(row.is_anonymous) === 1);
  }

  rows.sort((a, b) => {
    if (state.sort === 'recent') {
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
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
    container.innerHTML = '<article class="panel empty">暂无数据或未命中筛选条件。</article>';
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
    tpl.querySelector('.raw-content').textContent = row.content || '';

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

function setLoading(loading, text = '正在加载数据...') {
  const container = document.getElementById('list');
  if (loading) {
    container.innerHTML = `<article class="panel empty">${text}</article>`;
  }
}

async function loadPosts() {
  setLoading(true);
  try {
    const res = await fetch('/api/posts', { headers: { Accept: 'application/json' } });
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      throw new Error(payload.message || '接口返回异常');
    }
    state.rows = payload.data || [];
    render();
  } catch (error) {
    setLoading(true, `加载失败：${error.message}`);
  }
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
loadPosts();
