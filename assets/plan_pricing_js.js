let amountOptions = [];
let currentSelectedOptionId = "";
let currentCustomAmount = "";

const buildAmountOptionId = (amount) => `amount_${Number(amount || 0)}`;

const formatPricingMoney = (value) => {
    const amount = Number(value || 0);
    if (Number.isNaN(amount)) {
        return "0";
    }

    return `${Math.round(amount)}`;
};

const getSortedAmountOptions = () => {
    return [...amountOptions];
};

const getSelectedAmountOption = () => {
    return amountOptions.find(item => item.id === currentSelectedOptionId) || null;
};

const isCustomAmountSelected = () => currentSelectedOptionId === "custom";

const getFinalAmount = () => {
    if (isCustomAmountSelected()) {
        return Number(currentCustomAmount || 0);
    }

    return Number(getSelectedAmountOption()?.amount || 0);
};

const getSummaryAccount = () => {
    if (window.currentUserInfo?.nickName) {
        return window.currentUserInfo.nickName;
    }

    const userId = getUserId();
    return userId ? `用户${String(userId).slice(0, 10)}` : "-";
};

const updateSummary = (selectedOption) => {
    const summaryAccount = document.getElementById("summaryAccount");
    const summaryAmount = document.getElementById("summaryAmount");
    const totalAmount = document.getElementById("totalAmount");
    const submitBtn = document.getElementById("submitPricingBtn");

    if (!summaryAccount || !summaryAmount || !totalAmount || !submitBtn) {
        return;
    }

    summaryAccount.textContent = getSummaryAccount();

    if (isCustomAmountSelected()) {
        const parsedAmount = Number(currentCustomAmount || 0);
        summaryAmount.textContent = `$${formatPricingMoney(parsedAmount)}`;
        totalAmount.textContent = `￥${formatPricingMoney(parsedAmount)}`;
        submitBtn.disabled = parsedAmount <= 0;
        return;
    }

    if (!selectedOption) {
        summaryAmount.textContent = "$0";
        totalAmount.textContent = "￥0";
        submitBtn.disabled = true;
        return;
    }

    summaryAmount.textContent = `$${formatPricingMoney(selectedOption.amount)}`;
    totalAmount.textContent = `￥${formatPricingMoney(selectedOption.amount)}`;
    submitBtn.disabled = false;
};

const syncActiveState = () => {
    $(".amount").removeClass("active");
    $(`.amount[data-option-id="${currentSelectedOptionId}"]`).addClass("active");
    $("#customInput").toggleClass("show", isCustomAmountSelected());
};

const renderAmountOptions = () => {
    layui.use(["laytpl"], () => {
        const laytpl = layui.laytpl;
        const sortedAmountOptions = getSortedAmountOptions();
        const template = document.getElementById("pricingCardTpl").innerHTML;

        laytpl(template).render({ amountOptions: sortedAmountOptions }, html => {
            document.getElementById("pricingGrid").innerHTML = html;

            if (!sortedAmountOptions.some(item => item.id === currentSelectedOptionId)) {
                const recommendOption = sortedAmountOptions.find(item => item.isRecommend);
                currentSelectedOptionId = recommendOption?.id || sortedAmountOptions[0]?.id || "";
            }

            syncActiveState();
            updateSummary(getSelectedAmountOption());
        });
    });
};

window.onUserInfoLoaded = () => {
    updateSummary(getSelectedAmountOption());
};

$(async () => {
    try {
        await loadPricingAmountsAsync();
    } catch (error) {
        layui.use(["layer"], () => {
            layui.layer.msg(error?.message || "充值页面初始化失败");
        });
    }
});

const loadPricingAmountsAsync = async () => {
    const res = await fetchGet("/API/Web/Package/GetAllPackageList");
    if (res.code !== 200) {
        throw new Error(res.msg || "获取套餐列表失败");
    }

    const amountList = parsePricingAmountListValue(res.data);
    if (amountList.length === 0) {
        throw new Error("套餐列表为空");
    }

    amountOptions = amountList;
    renderAmountOptions();
};

const parsePricingAmountListValue = (list) => {
    if (!list || !Array.isArray(list)) {
        return [];
    }

    return list
        .map(mapPricingAmountItem)
        .filter(item => item !== null);
};

const mapPricingAmountItem = (item) => {
    const amount = Number(item?.amount || 0);
    if (amount <= 0) {
        return null;
    }

    return {
        id: buildAmountOptionId(amount),
        amount,
        isRecommend: item?.isRecommend === true
    };
};

const doCardActivate = (code) => {
    layui.use('layer', function() {
        var layer = layui.layer;
        if (!code) {
            layer.msg("激活码不能为空!");
            return;
        }
        fetchPost("/API/Web/Card/Activate", {}, { Code: code }).then(responseJson => {
            if (responseJson.code !== 200) {
                layer.msg(responseJson.msg);
                return;
            }
            if (typeof confetti !== 'undefined') {
                confetti({
                    particleCount: 100,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                });
                confetti({
                    particleCount: 100,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                });
            }
            layer.msg("激活成功!", { time: 2000 }, () => {
                location.reload();
            });
        });
    });
};

const openCardDialog = () => {
    $('#activationModal').remove();
    const html = $('#activationModalTpl').html();
    $('body').append(html);

    // Focus input
    setTimeout(() => {
        $('#activationCodeInput').focus();
    }, 100);

    // Close events
    $('#activationModal .btn-close-modal').on('click', () => {
        closeCardDialog();
    });

    // Confirm event
    $('#confirmActivateBtn').on('click', () => {
        const code = $('#activationCodeInput').val()?.trim();
        if (!code) {
            layui.layer.msg("激活码不能为空!");
            return;
        }
        closeCardDialog();
        doCardActivate(code);
    });

    // Enter key support
    $('#activationCodeInput').on('keypress', function(e) {
        if (e.which == 13) {
            $('#confirmActivateBtn').click();
        }
    });
};

const closeCardDialog = () => {
    $('#activationModal').removeClass('active').fadeOut(300, function () { $(this).remove(); });
};

$(document).on("click", "[data-action='CardActivate']", function () {
    layui.use('layer', function() {
        var layer = layui.layer;
        const userId = getUserId();
        if (!userId) {
            showLoginModal('请先登录');
            return;
        }
        openCardDialog();
    });
});

const openSupportDialog = () => {
    $('#supportModal').remove();
    const html = $('#supportModalTpl').html();
    $('body').append(html);

    // 动态读取 footer 中的 QQ 群号
    const footerQqText = $('.footer-block:contains("QQ")').text();
    const qqMatch = footerQqText.match(/\d+/);
    if (qqMatch) {
        $('#qqGroupNumber').text(qqMatch[0]);
    }

    // Close events
    $('#supportModal .btn-close-modal').on('click', () => {
        closeSupportDialog();
    });

    // Copy event
    $('#copyQqBtn').on('click', () => {
        const qqNumber = $('#qqGroupNumber').text();
        navigator.clipboard.writeText(qqNumber).then(() => {
            layui.use('layer', function() {
                layui.layer.msg("群号已复制");
            });
        }).catch(err => {
            layui.use('layer', function() {
                layui.layer.msg("复制失败，请手动复制");
            });
        });
    });
};

const closeSupportDialog = () => {
    $('#supportModal').removeClass('active').fadeOut(300, function () { $(this).remove(); });
};

$(document).on("click", "#showSupportModalBtn", function () {
    openSupportDialog();
});

$(document).on('click', '.scroll-to-rules', function(e) {
    e.preventDefault();
    const rulesSection = document.getElementById('rules-section');
    if (rulesSection) {
        rulesSection.scrollIntoView({behavior: 'smooth'});
    }
});

$(document).on('click', '.amount', function() {
    const optionId = $(this).data('option-id');
    if (!optionId) {
        return;
    }

    currentSelectedOptionId = optionId;

    if (!isCustomAmountSelected()) {
        currentCustomAmount = "";
        $("#customAmount").val("");
    }

    syncActiveState();
    if (isCustomAmountSelected()) {
        return;
    }

    updateSummary(getSelectedAmountOption());
});

$(document).on('click', '#submitPricingBtn', function() {
    const finalAmount = getFinalAmount();
    if (finalAmount <= 0) {
        layui.use('layer', function() {
            layui.layer.msg('请先选择充值金额');
        });
        return;
    }

    if (isCustomAmountSelected() && finalAmount < 30) {
        layui.use('layer', function() {
            layui.layer.msg('自定义充值金额不能小于30');
        });
        return;
    }

    submitPricingAmount(finalAmount);
});



$(document).on("input", "#customAmount", function() {
    // 处理 type="number" 输入非法字符（如 e、-、.等）导致 val() 为空的问题
    if (this.validity && this.validity.badInput) {
        $(this).val('');
        currentCustomAmount = "";
        if (isCustomAmountSelected()) {
            updateSummary(null);
        }
        return;
    }

    let rawValue = ($(this).val() || "").trim();
    let validValue = rawValue.replace(/\D/g, ''); // 仅保留数字

    if (validValue !== '') {
        let numValue = parseInt(validValue, 10);
        if (numValue > 10000) {
            validValue = '10000'; // 限制最大值为 10000
        } else {
            validValue = numValue.toString(); // 去除前导零
        }
    }

    if (rawValue !== validValue) {
        $(this).val(validValue);
    }

    currentCustomAmount = validValue;

    if (!isCustomAmountSelected()) {
        return;
    }

    updateSummary(null);
});

const submitPricingAmount = (finalAmount) => {
    if (typeof buyAmount === 'function') {
        buyAmount(finalAmount);
    } else {
        layui.use('layer', function() {
            layui.layer.msg(`已获取最终金额：￥${formatPricingMoney(finalAmount)}，后端服务暂未处理`);
        });
    }
};
