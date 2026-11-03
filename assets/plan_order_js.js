let ordersList = [];
let pageIndex = 1;
let pageSize = 10;
let totalCount = 0;

const loadOrders = () => {
    const keywords = $('#searchKeywords').val()?.trim() || '';
    const startTime = $('#startDate').val()?.trim() || '';
    const endTime = $('#endDate').val()?.trim() || '';

    let url = `/API/Web/Order/GetList?pageSize=${pageSize}&pageIndex=${pageIndex}`;
    if (keywords) url += `&keyword=${encodeURIComponent(keywords)}`;
    if (startTime) url += `&startTime=${encodeURIComponent(startTime + ' 00:00:00')}`;
    if (endTime) url += `&endTime=${encodeURIComponent(endTime + ' 23:59:59')}`;

    const loadingIndex = layui.layer.load(2);
    fetchGet(url)
        .then(res => {
            layui.layer.close(loadingIndex);
            if (res.code === 200) {
                ordersList = res.data?.dataList || [];
                totalCount = res.data?.total || 0;
                renderTable();
                renderPagination();
            } else {
                layui.layer.msg(res.msg || '加载失败');
            }
        })
        .catch(() => {
            layui.layer.close(loadingIndex);
            layui.layer.msg('网络错误');
        });
};

const renderTable = () => {
    const $tbody = $('#ordersTableBody');
    const $emptyState = $('#emptyState');
    const $pagination = $('#pagination');

    if (!$tbody.length) return;

    if (ordersList.length === 0) {
        $tbody.empty();
        $emptyState.removeClass('hidden');
        $pagination.addClass('hidden');
        return;
    }

    $emptyState.addClass('hidden');
    $pagination.removeClass('hidden');

    layui.laytpl($('#orderTableTpl').html()).render(ordersList, html => {
        $tbody.html(html);
    });
};

const renderPagination = () => {
    if (totalCount === 0) {
        $('#paginationControls').empty();
        return;
    }

    layui.use('laypage', function(){
        var laypage = layui.laypage;
        laypage.render({
            elem: 'paginationControls',
            count: totalCount,
            limit: pageSize,
            curr: pageIndex,
            theme: '#FF5722',
            layout: ['count', 'prev', 'page', 'next'],
            jump: function(obj, first){
                const totalPages = Math.ceil(totalCount / pageSize) || 1;
                $('#paginationControls .layui-laypage-count').html(`共 ${totalCount} 条记录 当前第 ${obj.curr}/${totalPages} 页`);
                if(!first){
                    pageIndex = obj.curr;
                    loadOrders();
                }
            }
        });
    });
};

const bindEvents = () => {
    layui.use('laydate', () => {
        const laydate = layui.laydate;
        if ($('#dateRange').length) {
            laydate.render({ 
                elem: '#dateRange', 
                range: ['#startDate', '#endDate'],
                type: 'date'
            });
        }
    });

    $('#btnSearch').on('click', () => { pageIndex = 1; loadOrders(); });
    $('#btnResetSearch').on('click', () => {
        $('#searchKeywords, #startDate, #endDate').val('');
        pageIndex = 1;
        loadOrders();
    });
};

$(() => {
    bindEvents();
    loadOrders();
});