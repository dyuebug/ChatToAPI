/**
 * Login Logic
 */
let loginTimeoutId = null;
let wechatScanId = null;
let qrCodeData = null;
let currentPollingScanId = null;

const bindEvents = () => {
    const $btnLogin = $("#code-login .btn-primary");
    if ($btnLogin.length) {
        $btnLogin.on('click', () => doLogin());
    }
};

const showQRCodeDialog = (url, containerId = "qrcode", size = 200) => {
    const $qrcodeContainer = $(`#${containerId}`);
    if (!$qrcodeContainer.length) return;
    $qrcodeContainer.empty();
    new QRCode($qrcodeContainer[0], {
        text: url,
        width: size,
        height: size,
        correctLevel: 3
    });
};

const checkLoginStatus = (scanId, callBack) => {
    fetchGet(`/API/Web/User/CheckLoginStatus?ScanId=${scanId}`)
        .then(responseJson => {
            if (responseJson.code === 200 && callBack) {
                callBack(responseJson.data);
            } else if (callBack) {
                callBack(null);
            }
        })
        .catch(err => {
            console.error(err);
            if (callBack) callBack(null);
        });
};

const startWechatQRCodePolling = (scanId) => {
    currentPollingScanId = scanId;
    const pollStatus = () => {
        if (currentPollingScanId !== scanId) return;
        loginTimeoutId = setTimeout(() => {
            if (currentPollingScanId !== scanId) return;
            checkLoginStatus(scanId, (result) => {
                if (currentPollingScanId !== scanId) return;
                if (result) {
                    layui.layer.msg("登录成功", { time: 1500 }, () => {
                        goToPage('model.shtml');
                    });
                } else {
                    pollStatus();
                }
            });
        }, 1000);
    };
    pollStatus();
};

const loadQRCodeOnce = (callback) => {
    if (qrCodeData) {
        if (callback) callback();
        return;
    }

    fetchGet('/API/Web/WeChat/QRCodeLogin')
        .then(responseJson => {
            if (responseJson.code !== 200) {
                layui.layer.msg(responseJson.msg);
                return;
            }

            qrCodeData = responseJson.data;
            wechatScanId = responseJson.data.scanId;

            showQRCodeDialog(qrCodeData.qrCodeUrl, "qrcode", 200);

            if (callback) callback();
        })
        .catch(console.error);
};

const switchTab = (type) => {
    if (loginTimeoutId) {
        clearTimeout(loginTimeoutId);
        loginTimeoutId = null;
    }
    currentPollingScanId = null;

    $('.login-tab').removeClass('active');
    $('.login-form').removeClass('active');

    if (type === 'qrcode') {
        $('.login-tab:first-child').addClass('active');
        $('#qrcode-login').addClass('active');

        loadQRCodeOnce(() => {
            startWechatQRCodePolling(wechatScanId);
        });
    } else {
        $('.login-tab:last-child').addClass('active');
        $('#code-login').addClass('active');

        loadQRCodeOnce();
    }
};

const doLogin = () => {
    const code = $("#code-login .form-input").val()?.trim() || '';
    if (!code) {
        layui.layer.msg("请输入动态码");
        return;
    }

    const $btn = $("#code-login .btn-primary");
    const originalText = $btn.text();
    $btn.text("验证中...").prop('disabled', true);

    fetchPost('/API/Web/User/DynamicCodeLogin', null, { 'Code': code })
        .then(responseJson => {
            $btn.text(originalText).prop('disabled', false);

            if (responseJson.code !== 200) {
                layui.layer.msg(responseJson.msg);
                return;
            }
            layui.layer.msg("登录成功", { time: 1500 }, () => {
                goToPage('model.shtml');
            });
        })
        .catch(err => {
            $btn.text(originalText).prop('disabled', false);
            console.error(err);
            layui.layer.msg("网络错误");
        });
};

$(() => {
    if (window.location.search.includes('modal=1')) {
        $('body').addClass('is-modal');
    } else {
        $('body').removeClass('hide-layout');
    }
    if (isMobile() && isWeChat()) {
        window.location.href = '/API/Web/WeChat/AuthLogin';
        return;
    }

    bindEvents();
    switchTab('qrcode');
});