const renderCarList = () => {
    const renderCards = (containerClass, prefix, data) => {
        const container = $(`.ai-tools-container.${containerClass}`);
        if (container.length === 0) return;

        const getTpl = document.getElementById('tplCardList').innerHTML;
        layui.laytpl(getTpl).render({ list: data, prefix: prefix }, function (html) {
            container.html(html);
        });
    };

    const vipData = freeData = [
        {
            "actionSuffix": "Sorux",
            "title": "全模型-镜像站",
            "badge": "Hot",
            "subtitle": "全模型镜像站",
            "description": [
                "OpenAi官网原版ChatGPT模型",
                "集成Gemini/Claude/Grok等顶级Ai模型",
                "一站式满足所有Ai需求"
            ],
            "img": "img/platform-sorux.png",
            "alt": "全模型-镜像站"
        },
        {
            "actionSuffix": "FakeOAI",
            "title": "全模型-备用站",
            "badge": "Hot",
            "subtitle": "全模型-备用站",
            "description": [
                "全模型镜像站备用系统",
                "集成Gemini/Claude/Grok等顶级Ai模型",
                "一站式满足所有Ai需求"
            ],
            "img": "img/platform-fake-oai.png",
            "alt": "全模型-备用站"
        },
        {
            "actionSuffix": "XYChatGPT",
            "title": "ChatGPT-Chat站",
            "badge": "New",
            "subtitle": "ChatGPT-Chat站",
            "description": [
                "支持自主选号，直登GPT官网",
                "快速响应，满血回答，超多账号可选",
                "适合论文创作等学术研究工作"
            ],
            "img": "img/platform-xy-gpt.png",
            "alt": "ChatGPT-Chat站"
        },
        {
            "actionSuffix": "OneOpenAI",
            "title": "ChatGPT-Work站",
            "badge": "New",
            "subtitle": "ChatGPT-Work站",
            "description": [
                "支持Work工作区",
                "自动选择账号，无感切换对话",
                "适合代码的构建和调试"
            ],
            "img": "img/platform-oneopenai.png",
            "alt": "ChatGPT-Work站"
        },
        {
            "actionSuffix": "Gemini",
            "title": "Gemini-镜像站",
            "badge": "New",
            "subtitle": "Gemini官网镜像站",
            "description": [
                "谷歌公司Gemini官网镜像站",
                "集成Gemini-fast/thinking/pro等模型",
                "需要单独选车进行直达跳转"
            ],
            "img": "img/platform-gemini.png",
            "alt": "Gemini官网镜像站"
        },
        {
            "actionSuffix": "Grok",
            "title": "Grok-镜像站",
            "badge": "New",
            "subtitle": "Grok官网镜像站",
            "description": [
                "马斯克公司xAi官网的Grok镜像站集成Grok-3/Grok-4/Grok-4 Fast等模型适合小说写作/日常问题/学术创作"
            ],
            "img": "img/platform-grok.png",
            "alt": "Grok官网镜像站"
        },
        {
            "actionSuffix": "Midjourney",
            "title": "Midjourney-镜像站",
            "badge": "即将上线",
            "subtitle": "Midjourney-镜像站",
            "description": [
                "Ai绘画一键创作",
                "基于Mj官网轻松完成图生图、文生图",
                "轻松绘画，高效出图"
            ],
            "img": "img/platform-midjourney.png",
            "alt": "Midjourney-镜像站"
        },
        {
            "actionSuffix": "Plan",
            "title": "龙虾计划-API站点",
            "badge": "New",
            "subtitle": "龙虾计划-API站点",
            "description": [
                "API调用全网大模型",
                "支持Claude code，Codex等多平台",
                "需单独充值，按量付费"
            ],
            "img": "img/platform-plan.png",
            "alt": "龙虾计划-API站点"
        }
    ];

    renderCards("vip", "AutoVIP", vipData);
    renderCards("free", "AutoFree", freeData);
}

const initParamData = () => {
    const requestData = [
        {
            KeyName: "ListNotice"
        }
    ];

    const agentHost = location.host;
    if (agentHost.toLowerCase() == "chat.chatopens.vip".toLowerCase()) {
        $("#spanQQ").html("1141596826");
    } else {
        requestData.push({
            KeyName: "QQ"
        });
    }

    fetchPost("/API/Web/Param/GetParamList", requestData, {}).then(responseJson => {
        if (responseJson.code != 200) {
            layer.msg(responseJson.msg);
            return;
        }
        const paramList = responseJson.data;

        paramList.forEach((param) => {
            if (param.keyName == "ListNotice") {
                $(`#div${param.keyName}`).html(param.data);
            } else if (param.keyName == "QQ") {
                $(`#span${param.keyName}`).html(param.data);
            }
        });
    });
}

const actionHandler = (action) => {
    switch (action) {
        case "qrCodeLogin":
            openLoginDialog();
            break;
        case "cancel":
            layer.closeAll();
            break;
        case "JumpXYChatGPT":
        case "JumpGrok":
        case "JumpGemini":
        case "JumpSorux":
            if (!validateLogin()) {
                return;
            }
            validateUserExpTime((isVip) => {
                const prefix = isVip ? "AutoVIP" : "AutoFree";
                autoCarLogin(prefix + action.substring(4));
            });
            break;
        case "JumpPlan":
            const linkPlan = document.createElement('a');
            var parts = location.hostname.split('.');
            var subDomain = "www";
            if (parts.length == 3) {
                subDomain = parts[0];
            }
            linkPlan.href = `https://${subDomain}.openclawplan.com/`;
            linkPlan.target = "_blank";
            linkPlan.style.display = "none";
            document.body.appendChild(linkPlan);
            linkPlan.click();
            document.body.removeChild(linkPlan);
            break;
        case "AutoCar":
        case "AutoVIPCar":
        case "AutoFreeCar":

        case "AutoFreeSorux":
        case "AutoVIPSorux":

        case "AutoFreeFakeOAI":
        case "AutoVIPFakeOAI":

        case "AutoVIPXYChatGPT":
        case "AutoFreeXYChatGPT":

        case "AutoFreeOneOpenAI":
        case "AutoVIPOneOpenAI":

        case "AutoFreeGemini":
        case "AutoVIPGemini":

        case "AutoFreeGrok":
        case "AutoVIPGrok":
            if (!validateLogin()) {
                return;
            }
            autoCarLogin(action);
            break;
        case "AutoAPI":
            document.getElementById('linkAPI').click();
            break;
    }
}

const renderAiModelList = () => {
    const aiModels = [
        { platform: "GPT", name: "GPT-5.3", action: "JumpXYChatGPT" },
        { platform: "GPT", name: "GPT-5.5-Thinking", action: "JumpXYChatGPT" },
        { platform: "Grok", name: "Grok-4.2", action: "JumpGrok" },
        { platform: "Grok", name: "Grok-4.2 fast", action: "JumpGrok" },
        { platform: "Gemini", name: "Gemini-3.1-Pro", action: "JumpGemini" },
        { platform: "Gemini", name: "Gemini-3.1-Thinking", action: "JumpGemini" },
        { platform: "Gemini", name: "Gemini-3.1-flash", action: "JumpGemini" },
        { platform: "DeepSeek", name: "DeepSeek-V4-flash", action: "JumpSorux" },
        { platform: "DeepSeek", name: "DeepSeek-V4-Pro", action: "JumpSorux" },
        { platform: "Claude", name: "Claude-4.6-sonnet", action: "JumpSorux" },
        { platform: "Claude", name: "Claude-4.6-opus", action: "JumpSorux" },
        { platform: "Claude", name: "Claude-4.7-opus", action: "JumpSorux" }
    ];

    const scrollingContent = document.getElementById("scrolling-content");
    if (scrollingContent) {
        const getTpl = document.getElementById('tplAiModelList').innerHTML;
        layui.laytpl(getTpl).render(aiModels, function (html) {
            scrollingContent.innerHTML = html;
        });

        // 获取元素
        const container = document.getElementById('scrolling-container');

        if (container) {
            // 设置滚动速度
            let scrollSpeed = 1; // 每次滚动的像素数
            let scrollInterval;

            // 开始滚动
            const startScroll = () => {
                scrollInterval = setInterval(() => {
                    container.scrollLeft += scrollSpeed;
                    // 如果滚动到最右侧，回到最左侧
                    if (container.scrollLeft >= scrollingContent.scrollWidth - container.clientWidth) {
                        container.scrollLeft = 0;
                    }
                }, 20); // 每20毫秒滚动一次
            }

            // 停止滚动
            const stopScroll = () => {
                clearInterval(scrollInterval);
            }

            // 初始化滚动
            startScroll();

            // 鼠标悬停时停止滚动
            container.addEventListener('mouseenter', stopScroll);

            // 鼠标离开时继续滚动
            container.addEventListener('mouseleave', startScroll);
        }
    }
}

const checkBindEmail = () => {
    fetchGet("/API/Web/User/IsBindEmail").then(response => {
        if (response.code === 200 && !response.data) {
            showEmailDialog("Chatopens安全邮箱绑定");
        }
    });
}

const checkNoticeReminder = () => {
    const getNoticeReminder = () => {
        const lastDismissed = localStorage.getItem("NoticeReminder");
        if (!lastDismissed) {
            return true;
        }
        const today = new Date().toISOString().split("T")[0];
        return today !== lastDismissed;
    }

    if (getNoticeReminder()) {
        showNoticeDialog();
    };
}

$(document).on("click", "[data-action='Notice']", function () {
    showNoticeDialog();
});

$(document).on("click", ".list-scrolling-box [data-action],#divList [data-action],#divCarList [data-action],[data-action='AutoCar']", function (e) {
    e.stopPropagation();
    const action = $(this).attr("data-action");
    actionHandler(action);
});

layui.use(function () {
    initParamData();
    renderCarList();
    renderAiModelList();
    checkAndRedirectApi();

    var carousel = layui.carousel;
    // 渲染 - 图片轮播
    carousel.render({
        elem: '#ID-carousel-demo-image',
        interval: 3000
    });

    checkNoticeReminder();
    checkBindEmail();
});

