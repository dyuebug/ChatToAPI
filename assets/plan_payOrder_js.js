const buyAmount = (amount) => {
    layui.use('layer', () => {
        var layer = layui.layer;
        var loadIndex = layer.msg('处理中...', { icon: 16, shade: 0.8, time: 0 });

        let userId = getQueryParam("UserId") || getCookie("user_id") || "";
        const host = getQueryParam("Host") || window.location.hostname;

        const headers = { "Version": "20251201", "UserId": userId, "SiteHost": host };

        fetchPost('/API/Web/Order/Create?amount=' + amount, null, headers).then(responseJson => {
            layer.close(loadIndex);
            if (responseJson.code != 200) {
                layer.msg(responseJson.msg || responseJson.error);
                return;
            }
            const data = responseJson.data;
            if (!data) return layer.msg("支付参数异常");

            if (data.type === "jsapi") {
                wechatPay(data.param);
                return;
            }
            if (data.type === "url") {
                goToPage(data.url);
                return;
            }
            if (data.type === "qrCode") {
                if (!data.qrCodes || data.qrCodes.length === 0) return layer.msg("支付二维码生成失败");
                showQRCodeDialog(data.qrCodes, data.orderNo);
                return;
            }
            layer.msg("支付参数异常");
        }).catch(err => {
            layer.close(loadIndex);
            layer.msg('发起支付失败');
        });
    });
};

const handlePaySuccess = (message = "支付成功！", callBack = null) => {
    try {
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
    } catch (e) {
        console.warn("confetti is not defined", e);
    }
    layer.msg(message, {
        icon: 1,
        time: 2000
    }, function () {
        if (callBack) {
            callBack();
        } else {
            var url = "model.shtml";
            if (isMobile() && isWeChat()) {
                const currentHost = window.location.hostname;
                const originDomain = getQueryParam('originDomain') || currentHost;
                url = `${window.location.protocol}//${originDomain}/Web/${url}`;
            }
            goToPage(url);
        }
    });
}

const showQRCodeDialog = (qrCodeList, orderNo) => {
    var layer = layui.layer;

    let tabTitles = '';
    let tabContents = '';

    qrCodeList.forEach((item, index) => {
        const isActive = index === 0 ? 'layui-this' : '';
        const isShow = index === 0 ? 'layui-show' : '';
        tabTitles += `<li class="${isActive}" style="width: 75px;${(index === 0 ? "margin:0 5px 0 -15px;" : "margin:0 -15px 0 5px;")}">${item.name}</li>`;
        tabContents += `<div class="layui-tab-item ${isShow}">
                            <div id="qrcode_${index}" style="margin:20px; display:flex; justify-content:center;"></div>
                        </div>`;
    });

    const contentHtml = `
        <style>
            .pay-modal-tab .layui-tab-title .layui-this { color: var(--primary) !important; }
            .pay-modal-tab .layui-tab-title .layui-this:after { border-bottom-color: var(--primary) !important; border-bottom-width: 3px !important; border-radius: 3px; }
            .pay-modal-tab .layui-tab-title li { font-weight: 500; font-size: 15px; transition: all 0.3s; }
        </style>
        <div class="layui-tab layui-tab-brief pay-modal-tab" lay-filter="payTab" style="margin: 15px 0 0 0;">
            <ul class="layui-tab-title" style="text-align:center; border-bottom: none;">
                ${tabTitles}
            </ul>
            <div class="layui-tab-content" style="padding: 0;margin: -5px 0;">
                ${tabContents}
            </div>
        </div>
    `;

    var timer;
    layer.open({
        type: 1,
        area: ["260px", "310px"],
        title: false,
        content: contentHtml,
        success: function (layero, index) {
            layero.css("border-radius", "15px");

            // Render QR Codes
            qrCodeList.forEach((_, idx) => {
                const container = document.getElementById(`qrcode_${idx}`);
                if (container) {
                    new QRCode(container, {
                        text: qrCodeList[idx].qrCode,
                        width: 220,
                        height: 220,
                        correctLevel: QRCode.CorrectLevel.H
                    });
                }
            });

            timer = setInterval(function () {
                fetchPost('/API/Web/Order/CheckStatus?orderNo=' + orderNo).then(checkRes => {
                    if (checkRes.code === 200 && checkRes.data && checkRes.data.status === 'Paid') {
                        clearInterval(timer);
                        layer.close(index);
                        handlePaySuccess('支付成功！');
                    }
                });
            }, 3000);
        },
        cancel: function (index, layero) {
            if (timer) clearInterval(timer);
            return true;
        }
    });
};

const wechatPay = (payParams) => {
    var layer = layui.layer;
    const payData = typeof payParams === 'string' ? JSON.parse(payParams) : payParams;

    if (typeof WeixinJSBridge === "undefined") {
        layer.msg("请在微信中打开此页面进行支付");
        return;
    }

    WeixinJSBridge.invoke(
        'getBrandWCPayRequest',
        {
            "appId": payData.appId,
            "timeStamp": payData.timeStamp,
            "nonceStr": payData.nonceStr,
            "package": payData.package,
            "signType": payData.signType,
            "paySign": payData.paySign
        },
        function (res) {
            if (res.err_msg == "get_brand_wcpay_request:ok") {
                handlePaySuccess('支付成功！');
            } else if (res.err_msg == "get_brand_wcpay_request:cancel") {
                layer.msg("支付已取消");
            } else {
                layer.msg("支付失败，请重试");
            }
        }
    );
};
