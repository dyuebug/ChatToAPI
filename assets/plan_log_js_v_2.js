const formatDateTime = (timestamp) => {
    if (!timestamp) return '-';
    // Unix timestamp usually in seconds from go-api, or milliseconds. Let's assume seconds if it's 10 digits
    const date = new Date(timestamp > 9999999999 ? timestamp : timestamp * 1000);
    const pad = (n) => n < 10 ? '0' + n : n;
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

window.formatDateTime = formatDateTime;

window.toggleDetail = (index) => {
    const $detail = $(`#detail_${index}`);
    const $icon = $(`#icon_${index}`);
    if ($detail.is(':visible')) {
        $detail.hide();
        $icon.css('transform', 'rotate(0deg)');
    } else {
        $detail.show();
        $icon.css('transform', 'rotate(90deg)');
    }
};

let currentLogPage = 1;
const logPageSize = 10;

const loadLogs = (page = 1) => {
    currentLogPage = page;
    const $startTime = $('#startTime');
    const $endTime = $('#endTime');
    const $tokenInput = $('#tokenInput');
    const $requestIdInput = $('#requestIdInput');
    const $modelInput = $('#modelInput');

    let startTime = null;
    let endTime = null;

    if ($startTime.val()) {
        startTime = Math.floor(new Date($startTime.val() + ' 00:00:00').getTime() / 1000);
    }
    if ($endTime.val()) {
        endTime = Math.floor(new Date($endTime.val() + ' 23:59:59').getTime() / 1000);
    }

    const tokenName = $tokenInput.val() ? $tokenInput.val().trim() : '';
    const requestId = $requestIdInput.val() ? $requestIdInput.val().trim() : '';
    const modelName = currentFilterModel || '';

    let queryParams = `?pageSize=${logPageSize}&pageIndex=${page}`;
    if (tokenName) queryParams += `&tokenName=${encodeURIComponent(tokenName)}`;
    if (requestId) queryParams += `&requestId=${encodeURIComponent(requestId)}`;
    if (modelName) queryParams += `&modelName=${encodeURIComponent(modelName)}`;
    if (startTime) queryParams += `&startTime=${startTime}`;
    if (endTime) queryParams += `&endTime=${endTime}`;

    let loadIdx = null;
    if (typeof layui !== 'undefined' && layui.layer) {
        loadIdx = layui.layer.load(2, { shade: [0.1, '#fff'] });
    }

    // Load Summary Data
    fetchGet(`/API/Web/Log/GetSummary${queryParams}`)
        .then(res => {
            if (res.code === 200) {
                renderSummary(res.data);
            }
        });

    fetchGet(`/API/Web/Log/GetList${queryParams}`)
        .then(res => {
            if (loadIdx) layui.layer.close(loadIdx);
            if (res.code === 200) {
                renderLogs(res.data.dataList, res.data.total);
            } else {
                layui.layer.msg(res.message || '加载日志失败');
            }
        })
        .catch(err => {
            if (loadIdx) layui.layer.close(loadIdx);
            layui.layer.msg('请求失败，请稍后重试');
        });
};

let currentLogsData = [];
let currentFilterModel = '';

const initModelDropdown = async () => {
    await loadModels();
    
    const $customModelList = $('#model-dropdown-list');
    const $providerList = $('#provider-list');
    const $selectedModelName = $('.selected-model-name');
    
    $customModelList.empty();
    $providerList.find('.provider-item').remove();
    
    if (typeof MODEL_LIST !== 'undefined' && MODEL_LIST.length > 0) {
        // Add "All Models" option
        const providers = ['全部', ...new Set(MODEL_LIST.map(m => m.provider || 'Other'))];
        let activeProvider = '全部';
        
        providers.forEach(provider => {
            const isActive = provider === activeProvider;
            $providerList.append(`
                <div class="provider-item ${isActive ? 'active' : ''}" data-provider="${provider}">
                    <span>${provider}</span>
                    <svg class="check-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                </div>
            `);
        });
        
        const renderModelsForProvider = (provider) => {
            $customModelList.empty();
            let filteredModels = MODEL_LIST;
            if (provider !== '全部') {
                filteredModels = MODEL_LIST.filter(m => (m.provider || 'Other') === provider);
            }
            
            // Add "All" option at the top of model list
            $customModelList.append(`
                <div class="dropdown-item ${!currentFilterModel ? 'active' : ''}" data-value="" style="padding: 10px 12px; font-size: 14px; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; ${!currentFilterModel ? 'background: var(--chat-hover);' : ''}">
                    <div class="dropdown-item-content">
                        <span class="dropdown-item-title" style="color: ${!currentFilterModel ? 'var(--brand, #ff512b)' : 'var(--text-main)'}; font-weight: ${!currentFilterModel ? '500' : '400'};">全部模型</span>
                    </div>
                    ${!currentFilterModel ? '<svg class="check-icon" viewBox="0 0 24 24" width="14" height="14" fill="var(--brand, #ff512b)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
                </div>
            `);
            
            filteredModels.forEach(item => {
                const isSelected = currentFilterModel === item.modelName;
                
                if (isSelected) {
                    $selectedModelName.text(item.modelName).css('color', 'var(--text-main)');
                }
                
                $customModelList.append(`
                    <div class="dropdown-item ${isSelected ? 'active' : ''}" data-value="${item.modelName}" style="padding: 10px 12px; font-size: 14px; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; ${isSelected ? 'background: var(--chat-hover);' : ''}">
                        <div class="dropdown-item-content">
                            <span class="dropdown-item-title" style="color: ${isSelected ? 'var(--brand, #ff512b)' : 'var(--text-main)'}; font-weight: ${isSelected ? '500' : '400'};">${item.modelName}</span>
                        </div>
                        ${isSelected ? '<svg class="check-icon" viewBox="0 0 24 24" width="14" height="14" fill="var(--brand, #ff512b)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
                    </div>
                `);
            });
        };
        
        renderModelsForProvider(activeProvider);
        
        $providerList.off('click', '.provider-item').on('click', '.provider-item', function(e) {
            e.stopPropagation();
            const selectedProvider = $(this).data('provider');
            $providerList.find('.provider-item').removeClass('active');
            $(this).addClass('active');
            renderModelsForProvider(selectedProvider);
            $('#model-dropdown-menu .search-bar input').val('');
        });
    }
};

const bindDropdownEvents = () => {
    const $modelDropdown = $('#custom-model-dropdown');
    const $modelDropdownToggle = $('#model-dropdown-toggle');
    const $modelDropdownMenu = $('#model-dropdown-menu');
    
    $modelDropdownToggle.on('click', function(e) {
        e.stopPropagation();
        $modelDropdown.toggleClass('open');
        if ($modelDropdown.hasClass('open')) {
            $('body').addClass('no-scroll');
        } else {
            $('body').removeClass('no-scroll');
        }
    });
    
    $(document).on('click', function() {
        $modelDropdown.removeClass('open');
        $('body').removeClass('no-scroll');
    });
    
    $modelDropdownMenu.on('click', function(e) {
        e.stopPropagation();
    });
    
    $modelDropdownMenu.find('.search-bar input').on('click', function(e) {
        e.stopPropagation();
    }).on('input', function(e) {
        const keyword = $(this).val().toLowerCase();
        $('#model-dropdown-list .dropdown-item').each(function() {
            const modelName = $(this).data('value').toString().toLowerCase();
            const text = $(this).find('.dropdown-item-title').text().toLowerCase();
            if (modelName.includes(keyword) || text.includes(keyword)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });
    
    $('#model-dropdown-list').on('click', '.dropdown-item', function(e) {
        e.stopPropagation();
        const newModel = $(this).data('value');
        $modelDropdown.removeClass('open');
        $('body').removeClass('no-scroll');
        
        $('#model-dropdown-list .dropdown-item').removeClass('active').css('background', 'transparent');
        $('#model-dropdown-list .dropdown-item .dropdown-item-title').css('color', 'var(--text-main)').css('font-weight', '400');
        $('#model-dropdown-list .dropdown-item .check-icon').remove();
        
        $(this).addClass('active').css('background', 'var(--chat-hover)');
        $(this).find('.dropdown-item-title').css('color', 'var(--brand, #ff512b)').css('font-weight', '500');
        $(this).append('<svg class="check-icon" viewBox="0 0 24 24" width="14" height="14" fill="var(--brand, #ff512b)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>');
        
        currentFilterModel = newModel;
        const $selectedModelName = $('.selected-model-name');
        if (newModel) {
            $selectedModelName.text(newModel).css('color', 'var(--text-main)');
        } else {
            $selectedModelName.text('输入模型名称').css('color', '#999');
        }
    });
};

const renderLogs = (data, total) => {
    currentLogsData = data || [];
    const $tbody = $('#logsTableBody');
    if (!$tbody.length) return;

    layui.use('laytpl', () => {
        var laytpl = layui.laytpl;
        var getTpl = document.getElementById('logTableTpl').innerHTML;
        laytpl(getTpl).render(data || [], function (html) {
            $tbody.html(html);
        });
    });

    renderPagination(total);
};

const renderPagination = (total) => {
    if (total === 0) {
        $('#paginationControls').empty();
        return;
    }
    layui.use('laypage', function(){
        var laypage = layui.laypage;
        laypage.render({
            elem: 'paginationControls',
            count: total,
            limit: logPageSize,
            curr: currentLogPage,
            theme: '#FF5722',
            layout: ['count', 'prev', 'page', 'next'],
            jump: function(obj, first){
                const totalPages = Math.ceil(total / logPageSize) || 1;
                $('#paginationControls .layui-laypage-count').html(`共 ${total} 条记录 当前第 ${obj.curr}/${totalPages} 页`);
                if(!first){
                    loadLogs(obj.curr);
                }
            }
        });
    });
};

const renderSummary = (data) => {
    const list = data.list || [];
    let totalRequests = 0;
    let totalTokens = 0;
    let totalAmount = 0;

    const $modelsContainer = $('#summaryModelsContainer');
    $modelsContainer.empty();

    if (list.length === 0) {
        $modelsContainer.html('<div class="text-secondary" style="grid-column: 1 / -1; text-align: center; padding: 20px;">暂无模型数据</div>');
    } else {
        list.forEach(item => {
            totalRequests += item.requests;
            totalTokens += item.tokens;
            totalAmount += item.amount;

            $modelsContainer.append(`
                <div class="summary-item" style="background: #fff; padding: 10px 12px; border-radius: 4px; border: 1px solid #f0f0f0; min-width: 180px;">
                    <div style="font-weight: 600; color: #262626; margin-bottom: 6px; border-bottom: 1px solid #f5f5f5; padding-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px;">
                        ${item.modelName || '未知模型'}
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px; font-size: 12px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #8c8c8c;">请求:</span>
                            <span style="font-weight: 500; font-family: Consolas, monospace;">${item.requests} 次</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #8c8c8c;">Tokens:</span>
                            <span style="font-weight: 500; font-family: Consolas, monospace;">${Number(item.tokens).toLocaleString()}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #8c8c8c;">费用:</span>
                            <span style="font-weight: 500; font-family: Consolas, monospace;">$${Number(item.amount).toLocaleString('en-US', { maximumFractionDigits: 6 })}</span>
                        </div>
                    </div>
                </div>
            `);
        });
    }

    $('#summaryTotalContainer').html(`
        <div style="flex: 1; background: #fff; padding: 8px 12px; border-radius: 4px; border: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; position: relative; overflow: hidden;">
            <div style="position: absolute; top: 0; left: 0; width: 3px; height: 100%; background: #4caf50;"></div>
            <span style="color: #8c8c8c; font-size: 12px; display: flex; align-items: center; gap: 4px;">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                总请求数
            </span>
            <span style="font-size: 16px; font-weight: 600; color: #262626; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">${Number(totalRequests).toLocaleString()}</span>
        </div>
        <div style="flex: 1; background: #fff; padding: 8px 12px; border-radius: 4px; border: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; position: relative; overflow: hidden;">
            <div style="position: absolute; top: 0; left: 0; width: 3px; height: 100%; background: #1890ff;"></div>
            <span style="color: #8c8c8c; font-size: 12px; display: flex; align-items: center; gap: 4px;">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                总Tokens
            </span>
            <span style="font-size: 16px; font-weight: 600; color: #262626; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">${Number(totalTokens).toLocaleString()}</span>
        </div>
        <div style="flex: 1; background: #fff; padding: 8px 12px; border-radius: 4px; border: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; position: relative; overflow: hidden;">
            <div style="position: absolute; top: 0; left: 0; width: 3px; height: 100%; background: #ff5722;"></div>
            <span style="color: #8c8c8c; font-size: 12px; display: flex; align-items: center; gap: 4px;">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                总费用
            </span>
            <span style="font-size: 16px; font-weight: 600; color: #ff5722; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">$${Number(totalAmount).toLocaleString('en-US', { maximumFractionDigits: 6 })}</span>
        </div>
    `);
};

let myChartInstance = null;

const initChart = () => {
    const $chartDom = $('#logsChart');
    if (!$chartDom.length) return;

    myChartInstance = echarts.init($chartDom[0]);
    $(window).on('resize', () => myChartInstance.resize());
};

const updateChart = (chartData) => {
    if (!myChartInstance) return;

    const option = {
        tooltip: { trigger: 'axis' },
        legend: { data: ['请求数', '总数', 'tokens'], bottom: 0 },
        grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: chartData.map(item => item.time)
        },
        yAxis: { type: 'value' },
        series: [
            {
                name: '请求数',
                type: 'line',
                smooth: true,
                itemStyle: { color: '#ff5722' },
                data: chartData.map(item => item.requests)
            },
            {
                name: '总数',
                type: 'line',
                smooth: true,
                itemStyle: { color: '#4caf50' },
                data: chartData.map(item => item.amount)
            },
            {
                name: 'tokens',
                type: 'line',
                smooth: true,
                itemStyle: { color: '#9c27b0' },
                data: chartData.map(item => item.tokens)
            }
        ]
    };

    myChartInstance.setOption(option);
};

const loadTodayChartStats = () => {
    fetchGet('/API/Web/Log/GetChartStats')
        .then(res => {
            if (res.code === 200) {
                updateChart(res.data || []);
            }
        });
};

$(async () => {
    initChart();
    loadTodayChartStats();

    if ($('#logsTableBody').length === 0) return; // Not on a page with logs

    await initModelDropdown();
    bindDropdownEvents();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    $('#startTime').val(todayStr);
    $('#endTime').val(todayStr);

    layui.use('laydate', () => {
        const laydate = layui.laydate;
        if ($('#dateRange').length) {
            laydate.render({ 
                elem: '#dateRange', 
                range: ['#startTime', '#endTime'],
                type: 'date'
            });
        }
    });

    let timeout = null;
    $('#tokenInput, #requestIdInput').on('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            // Optional: Auto search
            // loadLogs(1);
        }, 300);
    });
    
    // Bind Search Button
    $('#btnSearch').on('click', () => {
        loadLogs(1);
    });

    // Summary Toggle
    $('#summaryHeader').on('click', function() {
        const $body = $('#summaryBody');
        const $icon = $('#summaryToggleIcon');
        const $text = $('#summaryToggleText');
        const $toggleBtn = $(this).find('.summary-toggle');
        
        if ($body.is(':visible')) {
            $body.slideUp(200);
            $icon.css('transform', 'rotate(0deg)');
            $text.text('展开详情');
            $toggleBtn.css('background', '#fff').css('color', 'var(--text-secondary)');
        } else {
            $body.slideDown(200);
            $icon.css('transform', 'rotate(180deg)');
            $text.text('收起详情');
            $toggleBtn.css('background', '#f5f5f5').css('color', 'var(--text-main)');
        }
    });

    // Hover effect for toggle button
    $('.summary-toggle').hover(
        function() {
            if (!$('#summaryBody').is(':visible')) {
                $(this).css('background', '#fafafa').css('color', 'var(--brand, #ff512b)');
            }
        },
        function() {
            if (!$('#summaryBody').is(':visible')) {
                $(this).css('background', '#fff').css('color', 'var(--text-secondary)');
            }
        }
    );

    // Bind copy functionality
    $(document).on('click', '.copy-text', function(e) {
        e.stopPropagation();
        const textToCopy = $(this).data('copy');
        if (!textToCopy) return;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            const $toast = $('#toast');
            $toast.text('已复制: ' + textToCopy);
            $toast.addClass('show');
            setTimeout(() => $toast.removeClass('show'), 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            layui.layer.msg('复制失败');
        });
    });

    // Bind row detail button click to show drawer
    $(document).on('click', '.btn-detail', function(e) {
        e.stopPropagation();
        const index = $(this).closest('.log-row').data('index');
        const item = currentLogsData[index];
        if (!item) return;

        // Populate drawer
        $('#logDrawerModelName').text(item.modelName || '-');
        $('#logDrawerProvider').text(item.provider || '-');
        
        let providerClass = "";
        if (item.provider === "OpenAI") providerClass = "openai";
        else if (item.provider === "Anthropic") providerClass = "claude";
        else if (item.provider === "Google") providerClass = "gemini";
        else if (item.provider === "xAI") providerClass = "grok";
        else providerClass = item.provider || "default";

        $('#logDrawerLogo').html(`
            <span class="model-icon model-provider-icon--${providerClass}" style="width:40px; height:40px;">
                <span class="model-icon-surface" style="font-size:24px;">
                    ${item.icon}
                </span>
            </span>
        `);

        if (item.modelType === 'fixed') {
            $('#logDrawerTokens').hide();
            $('#logDrawerFixed').show();
            $('#logDrawerPoint').text(item.amount || 0);

            $('#logDrawerPricesToken').hide();
            $('#logDrawerPricesFixed').show();
            $('#logDrawerFixedPrice').text(item.number || 0);
        } else {
            $('#logDrawerFixed').hide();
            $('#logDrawerTokens').show();
            $('#logDrawerInputTokens').text(Number(item.promptTokens || 0).toLocaleString());
            $('#logDrawerOutputTokens').text(Number(item.completionTokens || 0).toLocaleString());
            
            const cacheOutTokens = item.cacheOutTokens || 0;
            const cacheInTokens = item.cacheInputTokens || 0;
            const showCacheOutTokens = cacheOutTokens > 0;
            const showCacheInTokens = cacheInTokens > 0;

            $('#logDrawerCacheInputTokens').text(Number(cacheInTokens).toLocaleString());
            $('#logDrawerCacheOutTokens').text(Number(cacheOutTokens).toLocaleString());

            if (showCacheInTokens) {
                $('#logDrawerCacheInputRow').show();
                if (!showCacheOutTokens) {
                    $('#logDrawerCacheInputRow').addClass('full-width');
                } else {
                    $('#logDrawerCacheInputRow').removeClass('full-width');
                }
            } else {
                $('#logDrawerCacheInputRow').hide();
                $('#logDrawerCacheInputRow').removeClass('full-width');
            }

            if (showCacheOutTokens) {
                $('#logDrawerCacheOutRow').show();
                if (!showCacheInTokens) {
                    $('#logDrawerCacheOutRow').addClass('full-width');
                } else {
                    $('#logDrawerCacheOutRow').removeClass('full-width');
                }
            } else {
                $('#logDrawerCacheOutRow').hide();
                $('#logDrawerCacheOutRow').removeClass('full-width');
            }

            $('#logDrawerPricesFixed').hide();
            $('#logDrawerPricesToken').show();
            $('#logDrawerInputPrice').text(item.inputPrice || 0);
            $('#logDrawerOutputPrice').text(item.outPrice || 0);

            const cacheOutPrice = item.cacheOutPrice !== undefined && item.cacheOutPrice !== null ? parseFloat(item.cacheOutPrice) : 0;
            const cacheInPrice = item.cacheInputPrice !== undefined && item.cacheInputPrice !== null ? parseFloat(item.cacheInputPrice) : 0;
            const showCacheOutPrice = cacheOutPrice > 0;
            const showCacheInPrice = cacheInPrice > 0;

            $('#logDrawerReadPrice').text(cacheInPrice);
            $('#logDrawerWritePrice').text(cacheOutPrice);

            if (showCacheInPrice) {
                $('#logDrawerReadContainer').show();
                if (!showCacheOutPrice) {
                    $('#logDrawerReadContainer').addClass('full-width');
                } else {
                    $('#logDrawerReadContainer').removeClass('full-width');
                }
            } else {
                $('#logDrawerReadContainer').hide();
                $('#logDrawerReadContainer').removeClass('full-width');
            }

            if (showCacheOutPrice) {
                $('#logDrawerWriteContainer').show();
                if (!showCacheInPrice) {
                    $('#logDrawerWriteContainer').addClass('full-width');
                } else {
                    $('#logDrawerWriteContainer').removeClass('full-width');
                }
            } else {
                $('#logDrawerWriteContainer').hide();
                $('#logDrawerWriteContainer').removeClass('full-width');
            }
        }

        $('#logDrawerChargeMode').text(item.modelType === 'fixed' ? '按次计费' : '按量计费');
        $('#logDrawerBillingType').text(item.modelType === 'fixed' ? '按次计费' : '按量计费');
        $('#logDrawerCreatedAt').text(formatDateTime(item.createdAt));
        $('#logDrawerTokenName').text(item.tokenName || '-');
        $('#logDrawerRequestId').text(item.requestId || '-');

        // Copy button event
        $('#logDrawerCopy').off('click').on('click', function() {
            navigator.clipboard.writeText(item.modelName || '').then(() => {
                const $toast = $('#toast');
                $toast.text('已复制: ' + (item.modelName || ''));
                $toast.addClass('show');
                setTimeout(() => $toast.removeClass('show'), 2000);
            });
        });
        
        // Render Group Ratios
        layui.use('laytpl', () => {
            const laytpl = layui.laytpl;
            const tpl = document.getElementById('drawerGroupTpl').innerHTML;
            laytpl(tpl).render(item, function(html){
                $('#logDrawerGroupsContainer').html(html);
            });
        });

        $('#logDrawerIsStream').html(item.isStream ? '<span style="color:var(--primary-color);">是</span>' : '<span style="color:var(--text-secondary);">否</span>');
        $('#logDrawerRequestPath').text(item.requestPath || '-');
        let amount = Number(item.amount || 0);
        $('#logDrawerAmount').text(`$ ${amount.toLocaleString('en-US', { maximumFractionDigits: 6 })}`);
        let useTimeDisplay = item.useTime || 0;
        if (Number(item.useTime) < 1) {
            useTimeDisplay = '&lt; 1';
        }
        $('#logDrawerUseTime').html(`<span style="color:var(--success-color);">${useTimeDisplay}s</span>`);

        $('#logDrawerLayer').addClass('open').attr('aria-hidden', 'false');
        $('body').addClass('drawer-open');
    });

    $('#logDrawerClose, #logDrawerBackdrop').on('click', function() {
        $('#logDrawerLayer').removeClass('open').attr('aria-hidden', 'true');
        $('body').removeClass('drawer-open');
    });

    // Bind Reset Button
    $('#btnReset').on('click', () => {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        $('#startTime').val(todayStr);
        $('#endTime').val(todayStr);
        $('#tokenInput').val('');
        $('#requestIdInput').val('');
        
        currentFilterModel = '';
        $('.selected-model-name').text('输入模型名称').css('color', '#999');
        $('#model-dropdown-list .dropdown-item').removeClass('active').css('background', 'transparent');
        $('#model-dropdown-list .dropdown-item .dropdown-item-title').css('color', 'var(--text-main)').css('font-weight', '400');
        $('#model-dropdown-list .dropdown-item .check-icon').remove();
        
        // Find the "All Models" option and set it as active
        const $allOption = $('#model-dropdown-list .dropdown-item[data-value=""]');
        if ($allOption.length) {
            $allOption.addClass('active').css('background', 'var(--chat-hover)');
            $allOption.find('.dropdown-item-title').css('color', 'var(--brand, #ff512b)').css('font-weight', '500');
            $allOption.append('<svg class="check-icon" viewBox="0 0 24 24" width="14" height="14" fill="var(--brand, #ff512b)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>');
        }
        
        loadLogs(1);
    });

    loadLogs(1);
});
