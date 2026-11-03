const showQRCodeDialog = (qrCodeList, callBack) => {
    const winLayer = layer;
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
        <div class="layui-tab layui-tab-brief" lay-filter="payTab" style="margin: 15px 0 0 0;">
            <ul class="layui-tab-title" style="text-align:center;">
                ${tabTitles}
            </ul>
            <div class="layui-tab-content" style="padding: 0;margin: -5px 0;">
                ${tabContents}
            </div>
        </div>
    `;

    winLayer.open({
        type: 1,
        area: ["260px", "310px"],
        title: false,
        content: contentHtml,
        success: function (layero, index) {
            layero.css("border-radius", "15px");
            const doc = document;
            const renderQRCode = (idx) => {
                const container = doc.getElementById(`qrcode_${idx}`);
                new QRCode(container, {
                    text: qrCodeList[idx].qrCode,
                    width: 220,
                    height: 220,
                    correctLevel: 3
                });
            };

            // 渲染所有
            qrCodeList.forEach((_, idx) => {
                renderQRCode(idx);
            });
        },
        cancel: function (index, layero) {
            if (callBack) {
                callBack();
            }
            return true;
        }
    });
}

const handlePaySuccess = (message = "充值成功!", callBack = null) => {
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
    layer.msg(message, {
        time: 1000
    }, function () {
        if (callBack) {
            callBack();
        } else {
            reloadPage();
        }
    });
}

const checkOrderStatus = (orderNo, callBack) => {
    fetchPost("/API/Web/Order/CheckStatus", {}, {
        OrderNo: orderNo
    }).then(responseJson => {
        if (responseJson.code != 200) {
            layer.msg(responseJson.msg);
            return;
        }
        if (callBack) {
            callBack(responseJson.data);
        }
    });
}

const wechatPay = (payParams) => {
    // 解析支付参数，responseJson.data.content应该是JSON格式的支付参数
    const payData = typeof payParams === 'string' ? JSON.parse(payParams) : payParams;

    // 检查是否在微信环境中
    if (typeof WeixinJSBridge === "undefined") {
        layer.msg("请在微信中打开此页面进行支付");
        return;
    }

    // 调用微信支付
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
                // 支付成功
                handlePaySuccess("支付成功!", () => {
                    const host = getQueryParam("Host") || "www.chatopens.com";
                    goToPage(`https://${host}/Web/List.html`);
                });
            } else if (res.err_msg == "get_brand_wcpay_request:cancel") {
                layer.msg("支付已取消");
            } else if (res.err_msg == "get_brand_wcpay_request:fail") {
                layer.msg("支付失败，请重试");
            } else {
                layer.msg("支付失败，请重试");
            }
        }
    );
}

const submitOrder = (packageId) => {
    let userId = getQueryParam("UserId");
    if (!userId) {
        userId = getCookie(cookieName.userId);
    }
    const host = getQueryParam("Host");

    const loadIndex =  layer.msg('处理中...', {
        icon: 16,
        shade: 0.8,
        time: 0
    });
    fetchPost("/API/Web/Order/Create", {}, {
        Version: "20251201",
        UserId: userId,
        PackageId: packageId,
        SiteHost: host
    }).then(responseJson => {
        layer.close(loadIndex);
        if (responseJson.code != 200) {
            layer.msg(responseJson.msg || responseJson.error);
            return;
        }
        const data = responseJson.data;
        if (!data) {
            layer.msg("支付参数异常");
            return;
        }
        if (data.type === "jsapi") {
            wechatPay(data.param);
            return;
        }
        if (data.type === "url") {
            goToPage(data.url);
            return;
        }
        if (data.type === "qrCode") {
            if (!data.qrCodes || data.qrCodes.length === 0) {
                layer.msg("支付二维码生成失败");
                return;
            }
            let timeoutId = setInterval(function () {
                checkOrderStatus(data.orderNo, (result) => {
                    if (!result) {
                        return;
                    }
                    clearTimeout(timeoutId);
                    handlePaySuccess();
                });
            }, 500);
            showQRCodeDialog(data.qrCodes, function () {
                clearTimeout(timeoutId);
            });
            return;
        }
        layer.msg("支付参数异常");
    }).catch(() => {
        layer.close(loadIndex);
    });
}
