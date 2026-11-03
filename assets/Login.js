const showQRCodeDialog = (counterUrl, callBack) => {
    $("#qrcode").html("");
    new QRCode(document.getElementById("qrcode"), {
        text: counterUrl,
        width: 230,
        height: 230,
        correctLevel: 3
    });
}

const checkLoginStatus = (scanId, callBack) => {
    fetchGet(`/API/Web/User/CheckLoginStatus?ScanId=${scanId}`).then(responseJson => {
        if (responseJson.code != 200) {
            layer.msg(responseJson.msg);
            if (callBack) callBack(null);
            return;
        }
        if (callBack) {
            callBack(responseJson.data);
        }
    }).catch(() => {
        if (callBack) callBack(null);
    });
}

let timeoutId = null;
let currentScanId = null;

const doQRCodeLogin = () => {
    fetchPost("/API/Web/WeChat/QRCodeLogin", {}, {}).then(responseJson => {
        if (responseJson.code != 200) {
            layer.msg(responseJson.msg);
            return;
        }
        
        const scanId = responseJson.data.scanId;
        currentScanId = scanId;
        
        const pollStatus = () => {
            if (currentScanId !== scanId) return;
            timeoutId = setTimeout(() => {
                if (currentScanId !== scanId) return;
                checkLoginStatus(scanId, (result) => {
                    if (currentScanId !== scanId) return;
                    if (result) {
                        reloadPage();
                    } else {
                        pollStatus();
                    }
                });
            }, 1000);
        };
        pollStatus();
        
        showQRCodeDialog(responseJson.data.qrCodeUrl);
    });
}

const swithLoginMethod = (index) => {
    if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
    }
    currentScanId = null;
    let msg = "";
    if (index == 0) {
        doQRCodeLogin();
        msg = "关注公众号 微信扫码";
    } else if (index == 1) {
        msg = "关注公众号 获取动态码";
    } else if (index == 2) {
        msg = "邮箱一键注册登录";
    }
    $("#spanMsg").html(msg);
}

const doLogin = () => {
    var code = $("#txtCode").val();
    if (!code) {
        layer.msg("动态码不能为空");
        return;
    }
    fetchPost(`/API/Web/User/DynamicCodeLogin`, {},
    {
        Code: code
    }).then(responseJson => {
        if (responseJson.code != 200) {
            layer.msg(responseJson.msg);
            return;
        }
        reloadPage();
    });
}

let countdownTimer = null;
let countdown = 60;

const sendEmailCode = () => {
    const email = $("#txtEmail").val();
    if (!email) {
        layer.msg("请输入邮箱");
        return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        layer.msg("邮箱格式不正确");
        return;
    }

    if (countdownTimer) return;

    const loadingIndex = layer.load(2);
    fetchPost(`/API/Web/User/SendEmailLoginCode?email=${email}`).then(responseJson => {
        layer.close(loadingIndex);
        if (responseJson.code != 200) {
            layer.msg(responseJson.msg);
            return;
        }
        layer.msg("验证码发送成功");
        
        countdown = 60;
        $("#btnSendCode").text(`${countdown}s后重发`);
        $("#btnSendCode").css("cursor", "not-allowed");
        
        countdownTimer = setInterval(() => {
            countdown--;
            if (countdown <= 0) {
                clearInterval(countdownTimer);
                countdownTimer = null;
                $("#btnSendCode").text("获取验证码");
                $("#btnSendCode").css("cursor", "pointer");
            } else {
                $("#btnSendCode").text(`${countdown}s后重发`);
            }
        }, 1000);
    }).catch(() => {
        layer.close(loadingIndex);
    });
}

const doEmailLogin = () => {
    const email = $("#txtEmail").val();
    const code = $("#txtEmailCode").val();
    
    if (!email) {
        layer.msg("请输入邮箱");
        return;
    }
    if (!code) {
        layer.msg("请输入验证码");
        return;
    }

    const loadingIndex = layer.load(2);
    fetchPost(`/API/Web/User/EmailLogin?email=${email}&code=${code}`).then(responseJson => {
        layer.close(loadingIndex);
        if (responseJson.code != 200) {
            layer.msg(responseJson.msg);
            return;
        }
        layer.msg("登录成功");
        setTimeout(() => {
            reloadPage();
        }, 500);
    }).catch(() => {
        layer.close(loadingIndex);
    });
}

$(document).on("click", "#divLogin", function () {
    doLogin();
});

$(document).on("click", "#btnSendCode", function () {
    sendEmailCode();
});

$(document).on("click", "#btnEmailLogin", function () {
    doEmailLogin();
});

layui.use(function () {
    swithLoginMethod(0);
    layui.element.on("tab(LoginMethod)", function (data) {
        let index = data.index;
        swithLoginMethod(index);
    });
});