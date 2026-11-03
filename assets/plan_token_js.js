// ==========================================
// 1. 状态管理 (State)
// ==========================================
const state = {
    list: [],
    pageIndex: 1,
    pageSize: 10,
    totalCount: 0,
    groups: [],
    rateMap: {},
    modelGroups: {},
    allModels: [],
    selectedGroup: ''
};

// ==========================================
// 2. 工具函数 (Utils)
// ==========================================
const utils = {
    getModelClass: (provider) => {
        if (!provider) return "";
        const map = {
            "OpenAI": "codex",
            "Anthropic": "claude",
            "Google": "gemini",
            "xAI": "grok"
        };
        return map[provider] || "";
    },
    copyText: (text) => {
        navigator.clipboard.writeText(text).then(() => layui.layer.msg("已复制到剪贴板"));
    },
    formatDate: (timestamp) => {
        return timestamp ? layui.util.toDateString(timestamp * 1000, 'yyyy-MM-dd HH:mm:ss') : '-';
    }
};

// ==========================================
// 3. API 请求封装
// ==========================================
const api = {
    fetchModels: () => fetchGet('/API/Web/Model/GetList'),
    fetchGroups: () => fetchGet('/API/Web/Group/GetList'),
    fetchTokens: (params) => {
        const qs = new URLSearchParams(params).toString();
        return fetchGet(`/API/Web/Token/GetList?${qs}`);
    },
    saveToken: (payload) => fetchPost('/API/Web/Token/Save', payload),
    deleteToken: (id) => fetchPost(`/API/Web/Token/Remove?tokenId=${id}`)
};

// ==========================================
// 4. 数据加载与处理
// ==========================================
const loadDependencies = async () => {
    try {
        const [groupRes, modelRes] = await Promise.all([api.fetchGroups(), api.fetchModels()]);

        // 处理模型数据
        if (modelRes.code === 200 && modelRes.data) {
            state.allModels = Array.isArray(modelRes.data) ? modelRes.data : (modelRes.data.dataList || []);
        }

        // 处理分组数据
        if (groupRes.code === 200 && groupRes.data) {
            state.groups = groupRes.data;
            state.groups.forEach(g => {
                state.rateMap[g.groupId] = g.ratio + 'x';
                try {
                    g.parsedModels = g.models ? JSON.parse(g.models) : [];
                    state.modelGroups[g.groupId] = g.parsedModels;
                } catch (e) {
                    g.parsedModels = [];
                    state.modelGroups[g.groupId] = [];
                }
            });
        }
    } catch (e) {
        console.error('Failed to load dependencies', e);
    }
};

const loadData = () => {
    const keyword = $('#searchKeyword').val()?.trim() || '';
    const startTime = $('#startDate').val()?.trim() || '';
    const endTime = $('#endDate').val()?.trim() || '';

    const params = { pageSize: state.pageSize, pageIndex: state.pageIndex };
    if (keyword) params.keyword = keyword;
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    const loadingIndex = layui.layer.load(2);
    api.fetchTokens(params).then(res => {
        layui.layer.close(loadingIndex);
        if (res.code === 200) {
            state.list = res.data?.dataList || [];
            state.totalCount = res.data?.total || 0;
            renderGroupCards();
            renderTable();
            renderPagination();
        } else {
            layui.layer.msg(res.msg || '加载失败');
        }
    }).catch(() => {
        layui.layer.close(loadingIndex);
        layui.layer.msg('网络错误');
    });
};

// 为模板预处理数据，保持前端模板纯粹
const processListData = () => {
    return state.list.map(key => {
        let groupId = key.groupId;
        let groupObj = state.groups.find(g => g.groupId == groupId);

        // 如果匹配不到，回退到默认分组或第一个分组
        if (!groupObj) {
            groupObj = state.groups.find(g => g.name === '默认分组') || state.groups[0];
            groupId = groupObj ? groupObj.groupId : '';
        }

        const groupName = groupObj ? groupObj.name : '默认分组';
        const groupRate = state.rateMap[groupId] || '自动';

        const models = state.modelGroups[groupId] || [];
        let modelDetails = [];

        if (models.length === 0) {
            modelDetails = state.allModels.map(m => {
                return { name: m.modelName, cssClass: utils.getModelClass(m.provider) };
            });
        } else {
            modelDetails = models.map(m => {
                const found = state.allModels.find(am => am.modelName === m);
                return { name: m, cssClass: found ? utils.getModelClass(found.provider) : '' };
            });
        }

        let maskedKey = key.key;
        if (maskedKey && maskedKey.length > 8) {
            maskedKey = maskedKey.substring(0, 4) + '*************' + maskedKey.substring(maskedKey.length - 4);
        } else {
            maskedKey = '*************';
        }

        return {
            ...key,
            maskedKey,
            groupName,
            groupRate,
            modelDetails,
            formattedTime: utils.formatDate(key.createdTime)
        };
    });
};

// ==========================================
// 5. 视图渲染
// ==========================================
const GroupManager = {
    render() {
        if (!state.groups.length) return;
        layui.laytpl($('#groupCardTpl').html()).render(state.groups, html => {
            $('#groupCardsContainer').html(html);
        });
    },
    
    showModelsDrawer(groupId) {
            const group = state.groups.find(g => g.groupId == groupId);
            if (!group) return;

            // Extract provider info from description if possible, or use default
            let provider = 'AI / 模型';
            if (group.name.toLowerCase().includes('codex')) provider = 'OpenAI / 代码智能';
            else if (group.name.toLowerCase().includes('claude')) provider = 'Anthropic / 深度推理';
            else if (group.name.toLowerCase().includes('gemini')) provider = 'Google / 多模态';
            else if (group.name.toLowerCase().includes('grok')) provider = 'xAI / 实时洞察';

            const data = {
                theme: group.shortName || 'CX',
                name: group.name,
                provider: provider,
                description: group.description || '暂无介绍',
                tag: group.ratio ? group.ratio + 'x' : '自动',
                models: group.parsedModels || []
            };

        layui.laytpl($('#modelsDrawerTpl').html()).render(data, html => {
            $('#modelsDrawer').remove();
            $('body').append(html).css('overflow', 'hidden');
            
            requestAnimationFrame(() => {
                $('#modelsDrawer').addClass('active');
            });
        });
    },

    closeModelsDrawer() {
        $('#modelsDrawer').removeClass('active');
        $('body').css('overflow', '');
        setTimeout(() => $('#modelsDrawer').remove(), 300);
    }
};

const renderGroupCards = () => GroupManager.render();
window.openGroupDrawer = (groupId, el) => {
    $('.group-card').removeClass('active');
    if(el) $(el).addClass('active');
    GroupManager.showModelsDrawer(groupId);
};

const renderTable = () => {
    const $tbody = $('#keyTableBody');
    const $emptyState = $('#emptyState');
    const $pagination = $('#pagination');

    if (!$tbody.length) return;

    if (state.list.length === 0) {
        $tbody.empty();
        $emptyState.removeClass('hidden');
        $pagination.addClass('hidden');
        return;
    }

    $emptyState.addClass('hidden');
    $pagination.removeClass('hidden');

    const viewData = { list: processListData() };

    layui.laytpl($('#keyRowTpl').html()).render(viewData, html => {
        $tbody.html(html);
        // 检查模型列表是否需要显示"展开"按钮
        setTimeout(() => {
            $tbody.find('.models-content').each(function () {
                if (this.scrollHeight > this.clientHeight + 4) {
                    $(this).siblings('.toggle-models-btn').text('查看全部').show();
                }
            });
        }, 50);
    });
};

const renderPagination = () => {
    if (state.totalCount === 0) {
        $('#paginationControls').empty();
        return;
    }
    layui.use('laypage', function () {
        layui.laypage.render({
            elem: 'paginationControls',
            count: state.totalCount,
            limit: state.pageSize,
            curr: state.pageIndex,
            theme: '#FF5722',
            layout: ['count', 'prev', 'page', 'next'],
            jump: function (obj, first) {
                const totalPages = Math.ceil(state.totalCount / state.pageSize) || 1;
                $('#paginationControls .layui-laypage-count').html(`共 ${state.totalCount} 条记录 当前第 ${obj.curr}/${totalPages} 页`);
                if (!first) {
                    state.pageIndex = obj.curr;
                    loadData();
                }
            }
        });
    });
};

// ==========================================
// 6. 模态框管理器
// ==========================================
const ModalManager = {
    openForm: (data = {}) => {
        $('#keyModal').remove();

        // 预处理 groupId 兼容
        let selectedGroupId = data.groupId;
        let groupObj = state.groups.find(g => g.groupId == selectedGroupId);
        if (!groupObj) {
            groupObj = state.groups.find(g => g.name === '默认分组') || state.groups[0];
            selectedGroupId = groupObj ? groupObj.groupId : '';
        }
        data.groupId = selectedGroupId;

        const tplData = { ...data, groups: state.groups };
        layui.laytpl($('#modalTpl').html()).render(tplData, html => {
            $('body').append(html).css('overflow', 'hidden');

            // Ensure first step is visible and reset state
            $('#keyFormGroup').removeClass('hidden');
            $('#keyDisplayGroup').addClass('hidden');

            ModalManager.bindFormEvents(data);
        });
    },
    closeForm: () => {
        $(document).off('click.modalDropdown');
        $('body').css('overflow', '');
        $('#keyModal').removeClass('active').fadeOut(300, function () { $(this).remove(); });
    },
    renderFormModels: () => {
        const models = state.modelGroups[state.selectedGroup] || [];
        if (models.length === 0) {
            if (state.allModels.length > 0) {
                const cloudHtml = state.allModels.map(m => {
                    const cssClass = utils.getModelClass(m.provider);
                    return `<span class="model-chip ${cssClass}">${m.modelName}</span>`;
                }).join('');
                $('#modelCloud').html(cloudHtml);
                $('#modelCount').text(`全部可用 (共 ${state.allModels.length} 个模型)`);
            } else {
                $('#modelCloud').html('<span class="text-secondary" style="font-size:13px;display:inline-block;margin-top:10px;">未限制，全部模型可用</span>');
                $('#modelCount').text(`全部可用`);
            }
        } else {
            const cloudHtml = models.map(model => {
                const found = state.allModels.find(m => m.modelName === model);
                const cssClass = found ? utils.getModelClass(found.provider) : '';
                return `<span class="model-chip ${cssClass}">${model}</span>`;
            }).join('');
            $('#modelCloud').html(cloudHtml);
            $('#modelCount').text(`共 ${models.length} 个模型`);
        }
    },
    bindFormEvents: (data) => {
        const $wrap = $('#groupSelect');
        const $trigger = $('#selectTrigger');
        const $search = $('#groupSearch');
        const $groups = $('.group');
        const $text = $('#selectedText');

        let selectedGroupId = data?.groupId;
        let initialGroupObj = state.groups.find(g => g.groupId == selectedGroupId);
        if (!initialGroupObj) {
            initialGroupObj = state.groups.find(g => g.name === '默认分组') || state.groups[0];
            selectedGroupId = initialGroupObj ? initialGroupObj.groupId : '';
        }
        state.selectedGroup = selectedGroupId;

        const toggleDropdown = (force) => {
            const open = force ?? !$wrap.hasClass('open');
            $wrap.toggleClass('open', open);
            $trigger.attr('aria-expanded', open);
            if (open) setTimeout(() => $search.focus(), 30);
        };

        const selectGroup = (el) => {
            $groups.removeClass('selected');
            const $el = $(el);
            $el.addClass('selected');
            state.selectedGroup = $el.data('id');

            $('#currentName').text($el.data('name'));
            $('#currentDesc').text($el.data('desc'));

            const groupObj = state.groups.find(g => g.groupId == state.selectedGroup);
            if (groupObj && groupObj.tag) {
                $('#currentRate').html(groupObj.tag).show();
            } else {
                $('#currentRate').hide().text('');
            }

            $text.text(`${$el.data('name')} · ${groupObj?.tag || '自动'}`);

            ModalManager.renderFormModels();
            toggleDropdown(false);
            $search.val('');
            $groups.css('display', 'flex');
        };

        $trigger.on('click', () => toggleDropdown());
        $groups.on('click', function () { selectGroup(this); });
        $groups.on('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectGroup(this);
            }
        });

        $search.on('input', function () {
            const q = $(this).val().trim().toLowerCase();
            let visible = 0;
            $groups.each(function () {
                const show = $(this).text().toLowerCase().includes(q);
                $(this).css('display', show ? 'flex' : 'none');
                if (show) visible++;
            });
            $('#empty').css('display', visible ? 'none' : 'block');
        });

        $(document).on('click.modalDropdown', function (e) {
            if (!$(e.target).closest('#groupSelect').length) toggleDropdown(false);
        });

        const initialEl = $groups.filter(`[data-id="${state.selectedGroup}"]`).get(0) || $groups.get(0);
        if (initialEl) selectGroup(initialEl);
    },
    saveKey: (id) => {
        const name = $('#keyNameInput').val()?.trim();
        if (!name) return layui.layer.msg('请输入密钥名称');

        // If it's the second step (Done button)
        if ($('#keyFormGroup').hasClass('hidden')) {
            ModalManager.closeForm();
            return;
        }

        const payload = { name, groupId: state.selectedGroup };
        if (id) payload.id = id;

        const $btn = $('#saveKeyBtn');
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('处理中...');

        const loadingIndex = layui.layer.load(2);
        api.saveToken(payload).then(res => {
            layui.layer.close(loadingIndex);
            if (res.code === 200) {
                if (id) {
                    layui.layer.msg('更新成功');
                    const key = state.list.find(k => k.id == id);
                    if (key) {
                        key.name = name;
                        key.groupId = state.selectedGroup;
                    }
                    renderTable();
                    ModalManager.closeForm();
                } else {
                    layui.layer.msg('创建成功');
                    state.pageIndex = 1;
                    loadData();
                    
                    // Show result step
                    $('#keyFormGroup').addClass('hidden');
                    $('#keyDisplayGroup').removeClass('hidden');
                    $('#newKeyNameDisplay').val(name);
                    $('#newKeyDisplay').val('sk-' + (res.data?.key || res.data));
                    $('#modal-title').text('创建成功');
                    $btn.text('完成');
                }
            } else {
                layui.layer.msg(res.msg || '保存失败');
            }
        }).catch(() => {
            layui.layer.close(loadingIndex);
            layui.layer.msg('网络错误');
        }).finally(() => {
            if (!$('#keyFormGroup').hasClass('hidden') || id) {
                $btn.prop('disabled', false).text(originalText);
            } else {
                $btn.prop('disabled', false); // Keep "完成" text
            }
        });
    }
};

const DeleteManager = {
    open: (id) => {
        $('#deleteModal').remove();
        layui.laytpl($('#deleteModalTpl').html()).render({ id }, html => {
            $('body').append(html);
        });
    },
    close: () => {
        $('#deleteModal').removeClass('active').fadeOut(300, function () { $(this).remove(); });
    },
    confirm: (id) => {
        const loadingIndex = layui.layer.load(2);
        api.deleteToken(id).then(res => {
            layui.layer.close(loadingIndex);
            if (res.code === 200) {
                state.list = state.list.filter(k => k.id != id);
                state.totalCount = Math.max(0, state.totalCount - 1);
                renderTable();
                renderPagination();
                DeleteManager.close();
                layui.layer.msg('删除成功');
            } else {
                layui.layer.msg(res.msg || '删除失败');
            }
        }).catch(() => {
            layui.layer.close(loadingIndex);
            layui.layer.msg('网络错误');
        });
    }
};

// ==========================================
// 7. 页面事件与特效初始化
// ==========================================
const bindPageEvents = () => {
    layui.use('laydate', () => {
        if ($('#dateRange').length) {
            layui.laydate.render({ elem: '#dateRange', range: ['#startDate', '#endDate'], type: 'date' });
        }
    });

    $('#btnSearch').on('click', () => { state.pageIndex = 1; loadData(); });
    $('#btnResetSearch').on('click', () => {
        $('#searchKeyword, #startDate, #endDate').val('');
        state.pageIndex = 1;
        loadData();
    });

    const $body = $('body');
    const $tableBody = $('#keyTableBody');

    $tableBody.on('click', '.btn-copy-text', (e) => utils.copyText($(e.currentTarget).data('text')));
    $tableBody.on('click', '.btn-toggle-visibility', function () {
        const $this = $(this);
        const $span = $this.siblings('.key-value');
        const isMasked = $span.data('is-masked') !== false; // 默认是 true
        
        if (isMasked) {
            $span.text($span.data('full'));
            $span.data('is-masked', false);
            $this.find('.eye-open').removeClass('hidden');
            $this.find('.eye-off').addClass('hidden');
        } else {
            $span.text($span.data('masked'));
            $span.data('is-masked', true);
            $this.find('.eye-open').addClass('hidden');
            $this.find('.eye-off').removeClass('hidden');
        }
    });
    $tableBody.on('click', '.btn-edit', (e) => {
        const id = $(e.currentTarget).data('id');
        const key = state.list.find(k => k.id == id);
        if (key) ModalManager.openForm({ title: '编辑密钥', id: key.id, name: key.name, groupId: key.groupId });
    });
    $tableBody.on('click', '.btn-delete', (e) => DeleteManager.open($(e.currentTarget).data('id')));

    $tableBody.on('click', '.toggle-models-btn', function () {
        const $content = $(this).siblings('.models-content');
        const html = $content.html();
        layui.layer.open({
            type: 1,
            title: '可用模型列表',
            area: ['600px', '400px'],
            content: `<div style="padding: 20px;"><div class="model-cloud" style="max-height: none;">${html}</div></div>`,
            shadeClose: true
        });
    });

    $('#btnCreateKey').on('click', () => ModalManager.openForm({ title: '创建 API 密钥' }));
    $body.on('click', '.btn-close-modal', () => ModalManager.closeForm());
    $body.on('click', '#keyModal', (e) => { if (e.target === e.currentTarget) ModalManager.closeForm(); });
    $body.on('click', '#saveKeyBtn', (e) => ModalManager.saveKey($(e.currentTarget).data('id')));
    // 复制新生成的令牌（输入框旁边）
    $('body').on('click', '#btnCopyInput', function (e) {
        var text = $('#newKeyDisplay').val();
        utils.copyText(text);
    });

    $body.on('click', '.btn-close-delete-modal', () => DeleteManager.close());
    $body.on('click', '#deleteModal', (e) => { if (e.target === e.currentTarget) DeleteManager.close(); });
    $body.on('click', '#confirmDeleteBtn', (e) => DeleteManager.confirm($(e.currentTarget).data('id')));

    $body.on('click', '.btn-close-drawer', () => GroupManager.closeModelsDrawer());
    $body.on('click', '#modelsDrawer', (e) => { if (e.target === e.currentTarget) GroupManager.closeModelsDrawer(); });

    $body.on('click', '.model-chip', function (e) {
        e.stopPropagation();
        utils.copyText($(this).text().trim());
    });
};

const initEffects = () => {
    const paths = ['/v1/chat/completions', '/v1/messages', '/v1/responses'];
    let currentPathIdx = 0;
    setInterval(() => {
        const pathEl = document.getElementById('carouselPath');
        if (pathEl) {
            pathEl.style.opacity = 0;
            setTimeout(() => {
                currentPathIdx = (currentPathIdx + 1) % paths.length;
                pathEl.innerText = paths[currentPathIdx];
                pathEl.style.opacity = 1;
            }, 300);
        }
    }, 3000);

    const copyDomainBtn = document.querySelector('.copy-domain-btn');
    if (copyDomainBtn) {
        copyDomainBtn.addEventListener('click', () => {
            const domain = document.getElementById('baseDomain').innerText;
            utils.copyText(domain);
        });
    }
};

// ==========================================
// 8. 暴露对外接口
// ==========================================
const init = async () => {
    bindPageEvents();
    initEffects();
    await loadDependencies();
    loadData();
};

// 入口点
$(() => {
    init();
});