const cookieName = {
    userId: "user_id",
    gfsessionid: "gfsessionid",
    platform: "platform"
};

const getUserId = () => {
    return getCookie(cookieName.userId);
};

const svgIcons = {
    home: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>`,
    util: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>`,
    question: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>`,
    mike: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>`,
    rmb: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"></path>
                <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path>
                <path d="M12 17.5v-11"></path>
            </svg>`,
    list: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <circle cx="4" cy="6" r="1"></circle>
                <circle cx="4" cy="12" r="1"></circle>
                <circle cx="4" cy="18" r="1"></circle>
            </svg>`,
    username: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>`,
    notice: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>`,
    read: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>`,
    diamond: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
            </svg>`,
    loading: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite; margin-right: 8px;">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>`
};

let iframeDialog;
const closeIframeDialog = () => {
    if (iframeDialog) {
        if (iframeDialog.parentNode) {
            document.body.removeChild(iframeDialog);
        }
        iframeDialog = null;
    }
};

const showIframeDialog = (title, url, width, height) => {
    if (iframeDialog) closeIframeDialog();
    const isMobileVal = isMobile();
    width = isMobileVal ? (width ? Math.min(window.innerWidth - 30, width) : window.innerWidth - 30) : width || Math.min(window.innerWidth, 1400);
    height = isMobileVal ? (height ? Math.min(window.innerHeight - 30, height) : window.innerHeight - 30) : height || Math.min(window.innerHeight, 860);

    const dialog = document.createElement('div');
    dialog.className = 'custom-dialog';
    dialog.innerHTML = `
        <div class="custom-dialog-content" style="width: ${width}px; height: ${height}px;">
            ${title ? `<div class="custom-dialog-title" style="font-size: 18px;">${title}</div>` : ''}
            <iframe src="${url}" style="width: 100%; height: ${title ? 'calc(100% - 40px)' : '100%'}; border: none;"></iframe>
            <button class="custom-dialog-close">×</button>
        </div>
    `;
    document.body.appendChild(dialog);
    iframeDialog = dialog;

    dialog.querySelector('.custom-dialog-close').addEventListener('click', () => {
        closeIframeDialog();
    });

    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            closeIframeDialog();
        }
    });
};
window.closeIframeDialog = closeIframeDialog;
window.showIframeDialog = showIframeDialog;

const showEmailDialog = (title) => {
    const height = title === "Chatopens安全邮箱绑定" ? 400 : 430;
    showIframeDialog(title ?? "Chatopens安全邮箱绑定", "/Web/Mail.html", 360, height);
}
window.showEmailDialog = showEmailDialog;

let promptDialog;
const closePromptDialog = () => {
    if (promptDialog) {
        if (promptDialog.parentNode) {
            document.body.removeChild(promptDialog);
        }
        promptDialog = null;
    }
};

const showPromptDialog = (title, callback) => {
    if (promptDialog) closePromptDialog();
    const dialog = document.createElement('div');
    dialog.className = 'custom-dialog';
    dialog.innerHTML = `
        <div class="custom-dialog-content" style="width: 300px; padding: 20px;">
            <div class="custom-dialog-title">${title}</div>
            <input type="text" class="custom-dialog-input" style="width: 100%; padding: 8px; margin: 10px 0;">
            <div style="text-align: right;">
                <button class="custom-dialog-btn custom-dialog-cancel">取消</button>
                <button class="custom-dialog-btn custom-dialog-confirm">确定</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    promptDialog = dialog;

    const input = dialog.querySelector('.custom-dialog-input');
    const confirmBtn = dialog.querySelector('.custom-dialog-confirm');
    const cancelBtn = dialog.querySelector('.custom-dialog-cancel');

    confirmBtn.addEventListener('click', () => {
        callback(input.value);
        closePromptDialog();
    });
    cancelBtn.addEventListener('click', () => {
        closePromptDialog();
    });
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            closePromptDialog();
        }
    });
};
window.closePromptDialog = closePromptDialog;
window.showPromptDialog = showPromptDialog;

const showMessage = (msg, callback) => {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'custom-message';
    msgDiv.textContent = msg;
    document.body.appendChild(msgDiv);
    setTimeout(() => {
        if (msgDiv.parentNode) {
            document.body.removeChild(msgDiv);
        }
        if (callback) callback();
    }, 2000);
};

let loadingDialog;
let loadingZIndex = 2026;
const showLoading = (msg) => {
    if (loadingDialog) return;

    if (!document.getElementById('loading-spinner-style')) {
        const style = document.createElement('style');
        style.id = 'loading-spinner-style';
        style.innerHTML = `
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    loadingDialog = document.createElement('div');
    loadingDialog.className = 'custom-dialog';
    loadingDialog.style.background = 'rgba(0,0,0,0.6)';
    loadingDialog.style.zIndex = loadingZIndex++;

    loadingDialog.innerHTML = `<div class="custom-message" style="position:relative; transform:none; left:auto; top:auto; background: #fff; color: #000; display: flex; align-items: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">${svgIcons.loading}${msg || '处理中...'}</div>`;
    document.body.appendChild(loadingDialog);
}
const closeLoading = () => {
    if (loadingDialog) {
        if (loadingDialog.parentNode) loadingDialog.parentNode.removeChild(loadingDialog);
        loadingDialog = null;
    }
}

setInterval(() => {
    fetchGet("/API/Web/User/CheckUserStatus")
        .then(responseJson => {
            if (responseJson.code !== 200 && responseJson.data === false) {
                showMessage("亲！您的账号正在其他设备使用中，请重新登陆再尝试", () => {
                    window.location.href = "/API/Web/User/DoLogout";
                });
            }
        });
}, 300000);

const closeChatDialog = (menu) => {
    if (!menu) return;
    if (!isMobile()) {
        document.querySelectorAll('[data-radix-popper-content-wrapper]').forEach(el => el.style.display = 'none');
    }
};

const showSubscribeDialog = (menu) => {
    closeChatDialog(menu);
    const userId = getCookie(cookieName.userId);
    const isWeChatVal = isMobile() && isWeChat();
    if (isWeChatVal) {
        goToPage(`https://share.chatopens.cn/Web/Subscribe.html?UserId=${userId}&Host=${window.location.host}`);
    } else {
        showIframeDialog(null, `/Web/Subscribe.html?time=${getTime()}`);
    }
};

const showNoticeDialog = (menu) => {
    closeChatDialog(menu);
    showIframeDialog("通知通告", `/Web/Notice.html?time=${getTime()}`, 1200, 600);
}

const showOrderListDialog = (menu) => {
    closeChatDialog(menu);
    showIframeDialog("我的订单", `/Web/OrderList.html?time=${getTime()}`);
};

const goToVoice = () => {
    document.querySelector(`[data-testid="composer-speech-button"]`)?.click();
};

const getAutoVIPAction = () => {
    let action = '';
    const platform = getCookie(cookieName.platform);
    switch (platform) {
        case 'Sorux':
            action = 'AutoVIPSorux';
            break;
        case 'FakeOAI':
            action = 'AutoVIPFakeOAI';
            break;
        case 'XYChatGPT':
            action = 'AutoVIPXYChatGPT';
            break;
        case 'OneOpenAI':
            action = 'AutoVIPOneOpenAI';
            break;
        case 'Gemini':
            action = 'AutoVIPGemini';
            break;
        case 'Grok':
            action = 'AutoVIPGrok';
            break;
        default:
            action = 'AutoVIPSorux';
            break;
    }
    return action;
};

const initUserSetting = () => {
    const userId = getCookie(cookieName.userId);
    if (!userId) return "";

    const html = `
        <div class="menu-row" style="display: flex;">
            <a style="flex:1;" class="menu-item" onclick="goToPage('/Web/List.html');">
                ${svgIcons.home}
                回到首页
            </a>
            <a style="flex:1;" class="menu-item" onclick="autoCarLogin('${getAutoVIPAction()}');">
                ${svgIcons.util}
                一键换车
            </a>
        </div>
        <div class="menu-row" style="display: flex;">
            <a style="flex:1;" class="menu-item" href="javascript:void(0);" onclick="openDocLink();">
                ${svgIcons.question}
                常见问题
            </a>
            <a style="flex:1;" class="menu-item" onclick="goToVoice();">
                ${svgIcons.mike}
                语音聊天
            </a>
        </div>
        <a class="menu-item menu-subscribe" onclick="showSubscribeDialog(this);">
            <div>
                ${svgIcons.rmb}
            </div>
            <div style="flex: 1; display: flex; flex-direction: column; align-items: flex-start;">
                <div>次数不够？开通会员</div>
                <div>解锁高额使用次数及全模型</div>
            </div>
        </a>
    `;
    return html;
};

window.initUserSetting = initUserSetting;

const pageStyleHandler = () => {
    var viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
        viewport.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
    }

    setInterval(() => {
        $("[role='menuitem'] button[class='btn relative btn-secondary btn-small']").parents("[role='menuitem']").hide();
    }, 50);
};

const doCardActivate = (code) => {
    if (!code) {
        showMessage("激活码不能为空!");
        return;
    }
    fetchPost("/API/Web/Card/Activate", {}, { Code: code }).then(responseJson => {
        if (responseJson.code !== 200) {
            showMessage(responseJson.msg);
            return;
        }
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
        showMessage("激活成功!", () => {
            reloadPage();
        });
    });
};

const openCardDialog = () => {
    showPromptDialog("激活码激活", (value) => {
        doCardActivate(value);
    });
};

const openLoginDialog = () => {
    if (isMobile() && isWeChat()) {
        goToPage("/API/Web/WeChat/AuthLogin");
        return;
    }
    showIframeDialog(null, `/Web/Login.html`, 1080, 600);
};

$(document).on("click", "[data-action='CardActivate']", function () {
    const userId = getUserId();
    if (!userId) {
        openLoginDialog();
        return;
    }
    openCardDialog();
});

$(document).on("click", "[data-action='Subscribe']", function () {
    hideDropdown();
    if (!validateLogin()) return;
    showSubscribeDialog(this);
});


const loadUser = (callBack) => {
    const userId = getCookie(cookieName.userId);
    if (!userId) {
        callBack(null);
        return;
    }
    fetchGet("/API/Web/User/GetUser")
        .then(responseJson => {
            if (responseJson.code !== 200) {
                showMessage(responseJson.msg);
                return;
            }
            callBack(responseJson.data);
        });
};

const authLogin = (action) => {
    const authlogintoken = (userId, carId, callBack) => {
        const formData = new FormData();
        formData.append("resptype", "json");
        formData.append("carid", carId);
        formData.append("usertoken", userId.replaceAll("-", ""));
        const url = `/auth/logintoken`;
        fetch(url, {
            method: 'POST',
            body: formData
        }).then(() => {
            callBack();
        });
    }

    const authFakeToken = (userId, callBack) => {
        const userToken = userId.replaceAll("-", "");
        const formData = new FormData();
        formData.append("usertoken", userToken);
        const url = `/auth/fake-token`;
        fetch(url, {
            method: 'POST',
            body: formData
        }).then(res => res.json()).then((json) => {
            setCookie(`ui-access-token`, json.access_token);
            setCookie(`ui-usertoken`, userToken);
            callBack();
        });
    }

    let userId = getCookie(cookieName.userId);
    let targetPlatform = 'Sorux';

    if (action === 'AutoVIPSorux' || action === 'AutoFreeSorux') {
        targetPlatform = 'Sorux';
    } else if (action === 'AutoVIPFakeOAI' || action === 'AutoFreeFakeOAI') {
        targetPlatform = 'FakeOAI';
    } else if (action === 'AutoVIPXYChatGPT' || action === 'AutoFreeXYChatGPT') {
        targetPlatform = 'XYChatGPT';
    } else if (action === 'AutoVIPOneOpenAI' || action === 'AutoFreeOneOpenAI') {
        targetPlatform = 'OneOpenAI';
    } else if (action === 'AutoVIPGemini' || action === 'AutoFreeGemini') {
        targetPlatform = 'Gemini';
    } else if (action === 'AutoVIPGrok' || action === 'AutoFreeGrok') {
        targetPlatform = 'Grok';
    }
    setCookie(cookieName.platform, targetPlatform);
    if (action === 'AutoVIPFakeOAI' || action === 'AutoFreeFakeOAI') {
        setTimeout(() => {
            closeLoading();
            goToPage(`/client-api/login?code=${userId}&redirect=true`);
        }, 1000);
    } else if (action === 'AutoVIPXYChatGPT' || action === 'AutoFreeXYChatGPT') {
        fetchPost('/carpage', {
            "page": 1,
            "size": 100,
            "sort": "desc",
            "order": "sort"
        })
            .then(res => {
                if (res.code === 1000 && res.data && res.data.list && res.data.list.length > 0) {
                    const list = res.data.list.filter(item => item.status === 1);
                    const randomIndex = Math.floor(Math.random() * list.length);
                    const carId = list[randomIndex].carID;
                    authlogintoken(userId, carId, () => {
                        authFakeToken(userId, () => {
                            goToPage(`/`);
                        });
                    });
                } else {
                    closeLoading();
                    showMessage("暂无可用资源");
                }
            })
            .catch(err => {
                console.error(err);
                closeLoading();
                if (typeof showMessage === 'function') {
                    showMessage("网络请求失败");
                } else {
                    alert("网络请求失败");
                }
            });
    } else if (action === 'AutoVIPOneOpenAI' || action === 'AutoFreeOneOpenAI') {
        setTimeout(() => {
            closeLoading();
            goToPage(`/auth/oauth?usertoken=${userId}`);
        }, 1000);
    } else if (action === 'AutoVIPGemini' || action === 'AutoFreeGemini') {
        fetch('/API/Web/Account/GetGeminiAccountList', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "page": 1,
                "size": 5,
                "status": true
            })
        })
            .then(response => response.json())
            .then(res => {
                let accountId = '';
                if (res && res.code === 200 && res.data && res.data.list && Array.isArray(res.data.list) && res.data.list.length > 0) {
                    const validList = res.data.list.filter(item => item.status !== false);
                    if (validList.length > 0) {
                        const freeList = validList.filter(item => item.carType === 'Free');
                        const targetList = freeList.length > 0 ? freeList : validList;
                        const randomIndex = Math.floor(Math.random() * targetList.length);
                        if (targetList[randomIndex].accountId) {
                            accountId = targetList[randomIndex].accountId;
                        }
                    }
                }
                closeLoading();
                const url = `/logintoken?access_token=${userId}&account=${accountId || ''}`;
                goToPage(url);
            })
            .catch(err => {
                console.error("Fetch carpage error:", err);
                setTimeout(() => {
                    closeLoading();
                    goToPage(`/logintoken?access_token=${userId}`);
                }, 1000);
            });
    } else if (action === 'AutoVIPGrok' || action === 'AutoFreeGrok') {
        fetch('/sign-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ 'usertoken': userId, 'action': 'default' })
        })
            .then(response => {
                closeLoading();
                goToPage("/");
            });
    }
    else {
        setTimeout(() => {
            closeLoading();
            goToPage(`/codetoken/?logintoken=${userId}`);
        }, 1000);
    }
}

const submitAccountForm = (form, isShowLoading = true, callback = null) => {
    const action = form.getAttribute("action");
    const url = getFullUrl(action);
    const formData = new FormData(form);
    const body = new URLSearchParams(formData);

    if (isShowLoading) {
        showLoading('处理中...');
    }

    fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body
    })
        .then(response => {
            if (isShowLoading) closeLoading();
            if (response.ok) {
                if (callback) callback();
                goToPage("/app");
            } else {
                showMessage("请求失败: " + response.status);
            }
        })
        .catch(error => {
            if (isShowLoading) closeLoading();
            console.error("Error submitting form:", error);
            showMessage("网络错误");
        });
}

const validateUserExpTime = (callBack) => {
    loadUser((user) => {
        if (!user) {
            showMessage("用户异常，请重新登录.");
            return;
        }
        callBack(user.isExp);
    });
};

const autoCarLogin = (action) => {
    showLoading('切换中...');
    validateUserExpTime((result) => {
        if (!result && (["AutoVIPCar", "AutoVIPSorux", "AutoVIPFakeOAI", "AutoVIPXYChatGPT", "AutoVIPOneOpenAI", "AutoVIPGemini", "AutoVIPGrok"].includes(action))) {
            closeLoading();
            showSubscribeDialog(this);
            return;
        }
        authLogin(action);
    });
};

const formatDateString = (inputDateStr) => {
    let dateObj = new Date(inputDateStr);
    if (isNaN(dateObj)) return "Invalid Date";
    return `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`;
};

const hideDropdown = () => {
    document.querySelectorAll('.custom-dropdown').forEach(d => d.style.display = 'none');
};

const showUserCenterDropdown = (selector) => {
    if (!validateLogin()) return;

    const action = getAutoVIPAction();

    loadUser((user) => {
        if (!user) {
            showMessage("用户异常，请重新登录.");
            return;
        }

        const html = `
            <div class="dropdown-content">
                <div class="dropdown-row">
                    <div class="dropdown-col-4">
                        <img src="/Web/img/user-header.png" style="width: 80px; max-width: 80px; height: 80px;" />
                    </div>
                    <div class="dropdown-col-8">
                        <div class="dropdown-row">
                            <span data-nick-name="">${user.nickName}</span>
                        </div>
                        <div class="dropdown-row">
                            <span data-exp-time="">${user.isExp ? "正式会员" : "非会员"}</span>
                        </div>
                        ${user.isExp ? `<div class="dropdown-row">
                            <span data-exp-time="">会员到期：<span>${user.expTime}</span></span>
                        </div>` : ''}
                    </div>
                </div>
                ${user.isExp ? `
                    <div class="dropdown-row dropdown-subscribe" onclick="hideDropdown();showSubscribeDialog(this);">
                        <div class="dropdown-inline">
                            ${svgIcons.username}
                        </div>
                        <div class="dropdown-inline">
                            <div class="dropdown-row"><b>Plus会员</b></div>
                            <div class="dropdown-row dropdown-small" style="color: #999;">
                                ${formatDateString(user.expTime)}到期
                            </div>
                        </div>
                    </div>` : `
                    <div class="dropdown-row dropdown-subscribe" onclick="hideDropdown();showSubscribeDialog(this);">
                        <div class="dropdown-inline">
                            ${svgIcons.rmb}
                        </div>
                        <div class="dropdown-inline">
                            <div class="dropdown-row"><b>开通会员</b></div>
                            <div class="dropdown-row dropdown-small" style="color: #999;">
                                开通VIP享受高阶权益
                            </div>
                        </div>
                    </div>`}
                <div class="dropdown-row dropdown-actions">
                    <div class="dropdown-row">
                        <div class="dropdown-col-6">
                            <div class="dropdown-item" onclick="hideDropdown();autoCarLogin('${action}');">
                                ${svgIcons.util}
                                <span style="margin-left:5px;">刷新修复</span>
                            </div>
                        </div>
                        <div class="dropdown-col-6">
                            <div class="dropdown-item" onclick="hideDropdown();showNoticeDialog(this);">
                                ${svgIcons.notice}
                                <span style="margin-left:5px;">站内公告</span>
                            </div>
                        </div>
                    </div>
                    <div class="dropdown-row">
                        <div class="dropdown-col-6">
                            <a href="javascript:void(0);" onclick="hideDropdown();openDocLink();" class="dropdown-item">
                                ${svgIcons.read}
                                <span style="margin-left:5px;">使用说明</span>
                            </a>
                        </div>
                        <div class="dropdown-col-6">
                            <div class="dropdown-item" onclick="hideDropdown();goToVoice();">
                                ${svgIcons.mike}
                                <span style="margin-left:5px;">实时语音</span>
                            </div>
                        </div>
                    </div>
                    <div class="dropdown-row">
                        <div class="dropdown-col-6">
                            <div class="dropdown-item" onclick="hideDropdown();showSubscribeDialog(this);">
                                ${svgIcons.diamond}
                                <span style="margin-left:5px;">升级续费</span>
                            </div>
                        </div>
                        <div class="dropdown-col-6">
                            <div class="dropdown-item" onclick="hideDropdown();goToPage('/Web/List.html');">
                                ${svgIcons.home}
                                <span style="margin-left:5px;">回到首页</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const dropdown = document.createElement('div');
        dropdown.className = 'custom-dropdown';
        dropdown.innerHTML = html;
        const trigger = document.querySelector(`#${selector}`);
        trigger.appendChild(dropdown);

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        });

        document.addEventListener('click', () => {
            dropdown.style.display = 'none';
        });
    });
};

const rightActionChatGPTAreaFun = () => {
    const length = $("#divRightAction").length;
    if (length >= 1) {
        return;
    }
    const html = `<div class="right-action" id="divRightAction">
                    <div class="right-action-text">+</div>
                </div>`;
    $("body").append(html);
    showUserCenterDropdown("divRightAction");
}

const validateLogin = () => {
    const userId = getUserId();
    const isLogin = userId != null && userId !== "";
    if (isLogin) return true;
    openLoginDialog();
    return false;
};

function checkAndRedirectApi() {
    if ($("#linkAPI").length === 0) {
        return;
    }
    var parts = location.hostname.split('.');
    var subDomain = "www";
    if (parts.length == 3) {
        subDomain = parts[0];
    }
    const apiUrl = `https://${subDomain}.openclawplan.com/`;
    $("#linkAPI").attr("href", apiUrl);
}

if (!crypto.randomUUID) {
    crypto.randomUUID = function () {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    };
}

const pathname = window.location.pathname.toLowerCase();

pageStyleHandler();

if (pathname == "/" || pathname.startsWith("/c/") || pathname.startsWith("/imagine") || pathname.startsWith("/project") || pathname.startsWith("/app") || pathname.startsWith("/new") || pathname.startsWith("/chat/")) {
    setInterval(rightActionChatGPTAreaFun, 1000);
}

checkAndRedirectApi();

/**
 * 打开使用说明文档
 */
const openDocLink = () => {
    const openUrl = (url) => {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    showLoading();
    fetchPost("/API/Web/Param/GetParamList", [{ KeyName: "DocLink" }]).then(responseJson => {
        if (responseJson.code === 200 && responseJson.data && responseJson.data.length > 0) {
            const url = responseJson.data[0].data || responseJson.data[0].Data;
            if (url) {
                openUrl(url);
                return;
            }
        }
    }).finally(() => {
        closeLoading();
    });
};
window.openDocLink = openDocLink;
