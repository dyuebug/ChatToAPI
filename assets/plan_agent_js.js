let orderPage = 1;
let withdrawPage = 1;
let userPage = 1;
const pageSize = 10;
let currentTab = 'orders';
let baseDomain = "openclawplan.com";

const bindEvents = () => {
    // Tab switching
    $('.tab-item').on('click', function () {
        const tabId = $(this).data('tab');
        currentTab = tabId;

        // Update nav styles
        $('.tab-item').removeClass('active');
        $(this).addClass('active');

        // Update content visibility
        $('.tab-content').addClass('hidden').removeClass('active');
        $('#tab-' + tabId).removeClass('hidden').addClass('active');

        loadCurrentTab();
    });
};

window.onUserInfoLoaded = (userInfo) => {
    if (!userInfo.host) {
        $('#unopenedBanner').removeClass('hidden');
        $('#agentContent').addClass('hidden');
        return;
    } else {
        $('#unopenedBanner').addClass('hidden');
        $('#agentContent').removeClass('hidden');
    }

    $('#substationLink').val(userInfo.host ? `https://${userInfo.host}/` : '');
    const prefix = userInfo.host ? userInfo.host.replace(`.${baseDomain}`, "") : '';
    $('#substationPrefix').val(prefix);
    $('#baseDomainText').text(baseDomain);

    $('#totalIncome').text(formatMoney(userInfo.totalIncome));
    $('#remainingAmount').html(`${formatMoney(userInfo.remainingAmount)} <span class="stat-unit">元</span>`);
    $('#withdrawingAmount').html(`${formatMoney(userInfo.withdrawingAmount)} <span class="stat-unit">元</span>`);

    $('#totalOrders').text(userInfo.totalOrders || 0);
    $('#todayUsers').text(userInfo.todayUsers || 0);
    $('#totalUsers').text(userInfo.totalUsers || 0);
};

const loadCurrentTab = () => {
    if (currentTab === 'orders') loadOrders();
    else if (currentTab === 'withdraws') loadWithdraws();
    else if (currentTab === 'users') loadUsers();
};

const updatePagination = (page, total) => {
    if (total === 0) {
        $('#paginationControls').empty();
        return;
    }
    layui.use('laypage', function(){
        var laypage = layui.laypage;
        laypage.render({
            elem: 'paginationControls',
            count: total,
            limit: pageSize,
            curr: page,
            theme: '#FF5722',
            layout: ['count', 'prev', 'page', 'next'],
            jump: function(obj, first){
                const totalPages = Math.ceil(total / pageSize) || 1;
                $('#paginationControls .layui-laypage-count').html(`共 ${total} 条记录 当前第 ${obj.curr}/${totalPages} 页`);
                if(!first){
                    if (currentTab === 'orders') {
                        orderPage = obj.curr;
                        loadOrders();
                    } else if (currentTab === 'withdraws') {
                        withdrawPage = obj.curr;
                        loadWithdraws();
                    } else if (currentTab === 'users') {
                        userPage = obj.curr;
                        loadUsers();
                    }
                }
            }
        });
    });
};

const loadOrders = async () => {
    try {
        const res = await fetchGet(`/API/Web/Order/GetAgentOrderList?pageSize=${pageSize}&pageIndex=${orderPage}`);
        if (res && res.code === 200) {
            renderOrders(res.data.dataList);
            updatePagination(orderPage, res.data.total);
        }
    } catch (e) {
        console.error(e);
    }
};

const loadWithdraws = async () => {
    try {
        const res = await fetchGet(`/API/Web/Trade/GetTradeList?pageSize=${pageSize}&pageIndex=${withdrawPage}`);
        if (res && res.code === 200) {
            renderWithdraws(res.data.dataList);
            updatePagination(withdrawPage, res.data.total);
        }
    } catch (e) {
        console.error(e);
    }
};

const loadUsers = async () => {
    try {
        const res = await fetchGet(`/API/Web/User/GetAgentUserList?pageSize=${pageSize}&pageIndex=${userPage}`);
        if (res && res.code === 200) {
            renderUsers(res.data.dataList);
            updatePagination(userPage, res.data.total);
        }
    } catch (e) {
        console.error(e);
    }
};

const loadData = () => {
    if (window.currentUserInfo) {
        window.onUserInfoLoaded(window.currentUserInfo);
    }
    loadCurrentTab();
};

const renderOrders = (data) => {
    const $tbody = $('#ordersTableBody');
    if (!$tbody.length) return;

    layui.use('laytpl', function () {
        var laytpl = layui.laytpl;
        var getTpl = document.getElementById('ordersTableTpl').innerHTML;
        laytpl(getTpl).render(data || [], function (html) {
            $tbody.html(html);
        });
    });
};

const renderWithdraws = (data) => {
    const $tbody = $('#withdrawsTableBody');
    if (!$tbody.length) return;

    layui.use('laytpl', function () {
        var laytpl = layui.laytpl;
        var getTpl = document.getElementById('withdrawsTableTpl').innerHTML;
        laytpl(getTpl).render(data || [], function (html) {
            $tbody.html(html);
        });
    });
};

const renderUsers = (data) => {
    const $tbody = $('#usersTableBody');
    if (!$tbody.length) return;

    layui.use('laytpl', function () {
        var laytpl = layui.laytpl;
        var getTpl = document.getElementById('usersTableTpl').innerHTML;
        laytpl(getTpl).render(data || [], function (html) {
            $tbody.html(html);
        });
    });
};

const saveLink = async () => {
    const prefix = $('#substationPrefix').val().trim();
    if (!prefix) {
        if (typeof layer !== 'undefined') {
            layer.msg('域名前缀不能为空');
        } else {
            alert('域名前缀不能为空');
        }
        return;
    }
    
    const regex = /^[A-Za-z0-9_-]+$/;
    if (!regex.test(prefix)) {
        if (typeof layer !== 'undefined') {
            layer.msg("域名前缀格式不正确，由字母、数字和下划线组成");
        } else {
            alert("域名前缀格式不正确，由字母、数字和下划线组成");
        }
        return;
    }
    if (prefix.length > 12) {
        if (typeof layer !== 'undefined') {
            layer.msg("域名前缀不能超过12个字符！");
        } else {
            alert("域名前缀不能超过12个字符！");
        }
        return;
    }
    
    try {
        const host = `${prefix}.${baseDomain}`;
        const res = await fetchPost('/API/Web/Domain/SaveDomain', { host: host });
        if (res && res.code === 200) {
            $('#substationLink').val(`https://${host}/`);
            if (typeof layer !== 'undefined') {
                layer.msg('保存成功');
            }
            Layout.closeModal('editLink');
        } else {
            if (typeof layer !== 'undefined') {
                layer.msg(res?.msg || '保存失败');
            }
        }
    } catch (e) {
        console.error(e);
        if (typeof layer !== 'undefined') layer.msg('系统异常');
    }
};

const submitWithdraw = async () => {
    const amount = $('#withdrawAmount').val().trim();
    const channel = $('#withdrawChannel').val().trim();
    const account = $('#withdrawAccount').val().trim();
    const remark = $('#withdrawRemark').val().trim();
    
    if (!amount) {
        if (typeof layer !== 'undefined') layer.msg('请输入提现金额');
        return;
    }
    if (!account) {
        if (typeof layer !== 'undefined') layer.msg('请输入提现账号');
        return;
    }
    
    try {
        const res = await fetchPost('/API/Web/Trade/AddTrade', {
            amount: parseInt(amount, 10),
            method: channel,
            account: account,
            remark: remark
        });
        if (res && res.code === 200) {
            if (typeof layer !== 'undefined') {
                layer.msg('提现申请已提交');
            }
            Layout.closeModal('withdraw');
            $('#withdrawAmount').val('');
            $('#withdrawAccount').val('');
            $('#withdrawRemark').val('');
            
            // Reload info
            if (typeof checkAuth === 'function') {
                checkAuth();
            } else {
                location.reload();
            }
        } else {
            if (typeof layer !== 'undefined') {
                layer.msg(res?.msg || '申请失败');
            }
        }
    } catch (e) {
        console.error(e);
        if (typeof layer !== 'undefined') layer.msg('系统异常');
    }
};

const copyLink = () => {
    const link = $('#substationLink').val();
    if (navigator.clipboard) {
        navigator.clipboard.writeText(link).then(() => {
            if (typeof layer !== 'undefined') layer.msg('已复制到剪贴板');
            else alert('已复制到剪贴板');
        }).catch(err => {
            console.error('复制失败', err);
        });
    } else {
        const input = document.getElementById('substationLink');
        input.select();
        document.execCommand('copy');
        if (typeof layer !== 'undefined') layer.msg('已复制到剪贴板');
        else alert('已复制到剪贴板');
    }
};

window.Substation = {
    saveLink,
    submitWithdraw,
    copyLink
};

$(() => {
    bindEvents();
    loadData();
});