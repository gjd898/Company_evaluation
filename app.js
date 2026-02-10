const state = {
  query: '',
  sort: 'hot',
  anonymousOnly: false,
  rows: [],
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1
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

function normalizeRows() {
  return (state.rows || []).map((root) => ({
    ...root,
    companyName: getCompanyName(root.content),
    comments: root.comments || [],
    heat: Number(root.pv || 0) + Number(root.uv || 0)
  }));
}

function updatePagerUi() {
  document.getElementById('page-indicator').textContent = `第 ${state.page} / ${state.totalPages} 页（共 ${state.total} 条）`;
  document.getElementById('prev-page').disabled = state.page <= 1;
  document.getElementById('next-page').disabled = state.page >= state.totalPages;
}

function renderStats(rows) {
  const totalComments = rows.reduce((sum, row) => sum + row.comments.length, 0);
  const totalHeat = rows.reduce((sum, row) => sum + row.heat, 0);
  const stats = document.getElementById('global-stats');
  stats.innerHTML = '';

  [
    `当前页公司 ${rows.length}`,
    `当前页评论 ${totalComments}`,
    `当前页热度 ${totalHeat}`,
    `总公司 ${state.total}`
  ].forEach((item) => {
    const span = document.createElement('span');
    span.className = 'stat-pill';
    span.textContent = item;
    stats.appendChild(span);
  });
}

function getReplyTarget(comment, idToNode, rootPost) {
  if (!comment.parent_id || comment.parent_id === rootPost.id) {
    return `#主帖`;
  }
  const target = idToNode.get(comment.parent_id);
  if (!target) return `#${comment.parent_id}`;
  return `用户${target.from_id}`;
}

function renderCommentTree(container, comments, rootPost) {
  const idToNode = new Map(comments.map((item) => [item.id, item]));
  const childrenMap = new Map();

  comments.forEach((item) => {
    const parentKey = item.parent_id === rootPost.id ? rootPost.id : item.parent_id;
    const list = childrenMap.get(parentKey) || [];
    list.push(item);
    childrenMap.set(parentKey, list);
  });

  const renderChildren = (parentId, depth) => {
    const children = childrenMap.get(parentId) || [];
    children.forEach((comment) => {
      const li = document.createElement('li');
      li.className = 'comment';
      li.style.marginLeft = `${Math.min(depth, 6) * 18}px`;

      const header = document.createElement('div');
      header.className = 'comment-head';
      header.textContent = `用户${comment.from_id} · 回复 ${getReplyTarget(comment, idToNode, rootPost)} · ${comment.created_at || '未知时间'}`;

      const body = document.createElement('div');
      body.className = 'comment-body';
      body.textContent = comment.content || '';

      li.appendChild(header);
      li.appendChild(body);
      container.appendChild(li);

      renderChildren(comment.id, depth + 1);
    });
  };

  renderChildren(rootPost.id, 0);
}

function render() {
  const container = document.getElementById('list');
  const rows = normalizeRows();
  renderStats(rows);
  updatePagerUi();
  container.innerHTML = '';

  if (!rows.length) {
    container.innerHTML = '<article class="panel empty">暂无数据或未命中筛选条件。</article>';
    return;
  }

  rows.forEach((row) => {
    const tpl = document.getElementById('company-template').content.cloneNode(true);
    tpl.querySelector('.company-name').textContent = row.companyName;
    tpl.querySelector('.meta').textContent = `发布者 用户${row.from_id} · 发布于 ${row.created_at || '未知时间'} · 评论 ${row.comments.length} 条 · 热度 ${row.heat}`;

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
      renderCommentTree(commentList, row.comments, row);
    }

    container.appendChild(tpl);
  });
}

function setLoading(text = '正在加载数据...') {
  const container = document.getElementById('list');
  container.innerHTML = `<article class="panel empty">${text}</article>`;
}

async function loadPosts() {
  setLoading();
  updatePagerUi();

  const params = new URLSearchParams({
    page: String(state.page),
    page_size: String(state.pageSize),
    sort: state.sort,
    anonymous_only: state.anonymousOnly ? '1' : '0',
    q: state.query
  });

  try {
    const res = await fetch(`/api/posts?${params.toString()}`, {
      headers: { Accept: 'application/json' }
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      throw new Error(payload.message || '接口返回异常');
    }

    state.rows = payload.data || [];
    state.total = Number(payload.pagination?.total || 0);
    state.totalPages = Number(payload.pagination?.total_pages || 1);
    state.page = Number(payload.pagination?.page || 1);

    render();
  } catch (error) {
    setLoading(`加载失败：${error.message}`);
  }
}

function bind() {
  document.getElementById('search-input').addEventListener('input', (event) => {
    state.query = event.target.value;
    state.page = 1;
    loadPosts();
  });

  document.getElementById('sort-select').addEventListener('change', (event) => {
    state.sort = event.target.value;
    state.page = 1;
    loadPosts();
  });

  document.getElementById('only-anonymous').addEventListener('change', (event) => {
    state.anonymousOnly = event.target.checked;
    state.page = 1;
    loadPosts();
  });

  document.getElementById('page-size-select').addEventListener('change', (event) => {
    state.pageSize = Number(event.target.value);
    state.page = 1;
    loadPosts();
  });

  document.getElementById('prev-page').addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      loadPosts();
    }
  });

  document.getElementById('next-page').addEventListener('click', () => {
    if (state.page < state.totalPages) {
      state.page += 1;
      loadPosts();
    }
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    state.query = '';
    state.sort = 'hot';
    state.anonymousOnly = false;
    state.pageSize = 10;
    state.page = 1;

    document.getElementById('search-input').value = '';
    document.getElementById('sort-select').value = 'hot';
    document.getElementById('only-anonymous').checked = false;
    document.getElementById('page-size-select').value = '10';

    loadPosts();
  });
}

bind();
loadPosts();
