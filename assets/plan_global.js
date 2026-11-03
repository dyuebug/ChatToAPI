const targetPlanHost = 'plan.chatopens.cn';

const MenuData = {
    mainNav: [
        { name: '首页', href: 'index.shtml' },
        { name: '在线对话', href: 'chat.shtml' },
        { name: '模型广场', href: 'model.shtml' },
        { name: '令牌管理', href: 'token.shtml' },
        { name: '账户充值', href: 'pricing.shtml' },
        { name: '配置教程', href: 'doc.shtml' }
    ],
    userMenu: [
        { name: '我的订单', href: 'order.shtml' },
        { name: '调用日志', href: 'log.shtml' },
        { name: '我的分站', href: 'agent.shtml' }
    ]
};

(function () {
    var isMobileVal = isMobile();
    var isWeChatVal = isWeChat();
    if (!isMobileVal || !isWeChatVal) return;
    const currentHost = window.location.hostname;
    const isPricingPage = window.location.pathname.toLowerCase().endsWith('/pricing.shtml');

    if (isPricingPage && currentHost !== targetPlanHost) {
        goToPage(`${window.location.protocol}//${targetPlanHost}/${window.location.pathname}?originDomain=${currentHost}`);
        return;
    };

    const originDomain = getQueryParam('originDomain') || currentHost;

    const updateHref = (item) => {
        if (item.name === '配置教程') return;

        if (item.name === '账户充值') {
            item.href = `${window.location.protocol}//${targetPlanHost}/Web/${item.href}?originDomain=${originDomain}`;
        } else {
            item.href = `${window.location.protocol}//${originDomain}/Web/${item.href}`;
        }
    };

    MenuData.mainNav.forEach(updateHref);
    MenuData.userMenu.forEach(updateHref);
})();

const renderMenus = () => {
    // Desktop Nav
    const desktopNavTpl = document.getElementById('desktopNavTpl');
    const desktopNavContainer = document.getElementById('desktopNavContainer');
    if (desktopNavTpl && desktopNavContainer && desktopNavContainer.innerHTML.trim() === '') {
        layui.laytpl(desktopNavTpl.innerHTML).render(MenuData.mainNav, function (html) {
            desktopNavContainer.innerHTML = html;
        });
    }

    // User Dropdown
    const userDropdownTpl = document.getElementById('userDropdownTpl');
    const userDropdownContainer = document.getElementById('userDropdownContainer');
    if (userDropdownTpl && userDropdownContainer && userDropdownContainer.innerHTML.trim() === '') {
        layui.laytpl(userDropdownTpl.innerHTML).render(MenuData.userMenu, function (html) {
            userDropdownContainer.innerHTML = html;
        });
    }

    // Mobile Nav
    const mobileNavTpl = document.getElementById('mobileNavTpl');
    const mobileNavContainer = document.getElementById('mobileNavContainer');
    if (mobileNavTpl && mobileNavContainer && mobileNavContainer.innerHTML.trim() === '') {
        layui.laytpl(mobileNavTpl.innerHTML).render(MenuData, function (html) {
            mobileNavContainer.innerHTML = html;
        });
    }
};

const headerScroll = () => {
    const $header = $('.header');
    if (!$header.length) return;

    const handleScroll = () => {
        $header.toggleClass('scrolled', $(window).scrollTop() > 20);
    };

    $(window).on('scroll', handleScroll);
    handleScroll();
};

const highlightNav = () => {
    const path = (window.location.pathname.split('/').pop() || 'index.shtml').toLowerCase();

    const setActive = ($links) => {
        $links.each(function () {
            let href = ($(this).attr('href') || '').toLowerCase();
            href = href.split('?')[0].split('/').pop() || 'index.shtml';
            $(this).toggleClass('active', href === path);
        });
    };

    setActive($('.nav-link'));
    setActive($('.mobile-nav-link'));
    setActive($('.user-dropdown-item'));
};

const initMobileNav = () => {
    const close = () => {
        $('#mobileNavBackdrop').removeClass('active').attr('aria-hidden', 'true');
        $('#navToggle').attr('aria-expanded', 'false');
        $('body').removeClass('no-scroll');
    };

    const open = () => {
        $('#mobileNavBackdrop').addClass('active').attr('aria-hidden', 'false');
        $('#navToggle').attr('aria-expanded', 'true');
        $('body').addClass('no-scroll');
    };

    $(document).off('click', '#navToggle').on('click', '#navToggle', function () {
        $('#mobileNavBackdrop').hasClass('active') ? close() : open();
    });

    $(document).off('click', '#mobileNavClose').on('click', '#mobileNavClose', close);

    $(document).off('click', '#mobileNavBackdrop').on('click', '#mobileNavBackdrop', function (e) {
        if (e.target === this) close();
    });

    $(document).off('click', '#mobileNavBackdrop a').on('click', '#mobileNavBackdrop a', close);

    $(document).off('keydown.mobilenav').on('keydown.mobilenav', function (e) {
        if (e.key === 'Escape') close();
    });

    // User Dropdown toggle for mobile
    $(document).off('click', '.user-dropdown-toggle').on('click', '.user-dropdown-toggle', function (e) {
        if (window.innerWidth <= 768) {
            e.preventDefault();
            e.stopPropagation();
            $(this).siblings('.user-dropdown-menu').toggleClass('show');
        }
    });

    $(document).off('click.userDropdown').on('click.userDropdown', function (e) {
        if (window.innerWidth <= 768) {
            if (!$(e.target).closest('.user-dropdown').length) {
                $('.user-dropdown-menu').removeClass('show');
            }
        }
    });
};

const getUserId = () => {
    if (window.location.hostname === 'localhost') {
        return '325ca3af961b4474bf8f0b2486b94761';
    }
    return getCookie('user_id');
};

const loadIncludesFallback = () => {
    if (!$('.header').length) {
        $.get('header.shtml', data => {
            $('body').prepend(data);
            renderMenus();
            headerScroll();
            highlightNav();
            initMobileNav();
            checkAuth();
        });
    }
    if (!$('.footer').length) {
        $.get('footer.shtml', data => {
            if ($('.mobile-nav-backdrop').length) {
                $('.mobile-nav-backdrop').before(data);
            } else {
                $('body').append(data);
            }
            renderMenus();
            highlightNav();
            initMobileNav();
            checkAuth();
        });
    }
};

const ASYNC_ROUTES = [
    { path: 'chat.shtml', meta: { requiresAuth: true } },
    { path: 'token.shtml', meta: { requiresAuth: true } },
    { path: 'pricing.shtml', meta: { requiresAuth: true } },
    { path: 'agent.shtml', meta: { requiresAuth: true } },
    { path: 'order.shtml', meta: { requiresAuth: true } },
    { path: 'log.shtml', meta: { requiresAuth: true } }
];

let USER_INFO = null;

const checkAuth = async () => {
    const isLogged = !!getUserId();
    const $authBtns = $('#authBtns');
    const $userMenu = $('#userMenu');

    const path = (window.location.pathname.split('/').pop() || '').toLowerCase();
    const isPublicPage = path === 'login.shtml' || path === 'index.shtml' || path === '';
    const route = ASYNC_ROUTES.find(r => r.path === path);

    if (!isPublicPage && (!isLogged || (route && route.meta.requiresAuth && !isLogged))) {
        showLoginModal();
        return;
    }

    if ($authBtns.length && $userMenu.length) {
        $authBtns.toggleClass('hidden', isLogged);
        $userMenu.toggleClass('hidden', !isLogged).css('display', isLogged ? 'flex' : 'none');
    }

    if (isLogged) {
        if (USER_INFO) {
            $('#userMenu .t-sm.font-bold').text(USER_INFO.nickName);
            window.currentUserInfo = USER_INFO;
            if (typeof onUserInfoLoaded === 'function') {
                onUserInfoLoaded(USER_INFO);
            }
            return;
        }
        try {
            const res = await fetchGet('/API/Web/User/GetUser');
            if (res && res.code === 200 && res.data) {
                USER_INFO = res.data;
                $('#userMenu .t-sm.font-bold').text(res.data.nickName);
                window.currentUserInfo = res.data;
                if (typeof onUserInfoLoaded === 'function') {
                    onUserInfoLoaded(res.data);
                }
            }
        } catch (e) {
            console.error('Failed to load user info', e);
        }
    }
};

const openModal = (modalId) => {
    $(`#${modalId}Modal`).addClass('active').attr('aria-hidden', 'false');
    $('body').addClass('no-scroll');
};

const closeModal = (modalId) => {
    if (modalId && typeof modalId === 'string') {
        $(`#${modalId}Modal`).removeClass('active').attr('aria-hidden', 'true');
    } else {
        $('.modal-backdrop').removeClass('active').attr('aria-hidden', 'true');
    }
    $('body').removeClass('no-scroll');
};

let MODEL_LIST = [];

const loadModels = async () => {
    if (MODEL_LIST && MODEL_LIST.length > 0) {
        return MODEL_LIST;
    }
    try {
        const res = await fetchGet('/API/Web/Model/GetList');
        if (res && res.code === 200 && res.data) {
            MODEL_LIST = res.data.map(m => {
                const providerName = m.providerName || m.providerId || '';
                return {
                    ...m,
                    modelName: m.name,
                    provider: providerName,
                    icon: m.icon || ''
                };
            });
            return MODEL_LIST;
        }
    } catch (e) {
        console.error("Failed to load models", e);
    }
    return MODEL_LIST;
};

window.showLoginModal = (msg = '') => {
    const showLoginDialog = (msg = '') => {
        layui.layer.open({
            type: 2,
            title: false,
            closeBtn: 1,
            area: ['460px', '560px'],
            shadeClose: true,
            skin: 'login-modal-skin',
            content: 'login.shtml?modal=1'
        });
    }

    if (isMobile() && isWeChat()) {
        if (msg) {
            layui.layer.msg(msg, { time: 1500 }, () => {
                window.location.href = '/API/Web/WeChat/AuthLogin';
            });
        } else {
            window.location.href = '/API/Web/WeChat/AuthLogin';
        }
    } else if (isMobile()) {
        if (msg) {
            layui.layer.msg(msg, { time: 1500 }, () => {
                window.location.href = 'login.shtml';
            });
        } else {
            window.location.href = 'login.shtml';
        }
    } else {
        if (msg) {
            layui.layer.msg(msg, { time: 1500 }, () => {
                showLoginDialog();
            });
        }
        else {
            showLoginDialog();
        }
    }
}

const handleAuthAction = (e) => {
    if (e) {
        const href = $(e.currentTarget).attr('href');
        if (href && href !== 'javascript:void(0);' && href !== '#') {
            return true;
        }
        e.preventDefault();
    }

    showLoginModal('请先登录');
    return false;
}

// 新增代码
window.Layout = { openModal, closeModal };

const loadConfigs = async () => {
    try {
        const res = await fetchPost('/API/Web/Config/GetConfigsByKeys', ['qq_group']);
        if (res && res.code === 200 && res.data) {
            const configs = res.data;
            if (configs['qq_group']) {
                $('.footer-block:contains("官方QQ讨论群")').text(`官方QQ讨论群: ${configs['qq_group']}`);
            }
        }
    } catch (e) {
        console.error("Failed to load configs", e);
    }
};

$(() => {
    loadConfigs().then(() => {
        renderMenus();
        loadIncludesFallback();
        headerScroll();
        highlightNav();
        initMobileNav();
        checkAuth();
    });

    $(document).on('click', '.close-modal', function () {
        closeModal();
    });

    // Handle click on dynamic tutorial link
    $(document).on('click', '#dynamicTutorialLink, #dynamicTutorialLink1, #dynamicTutorialLink2, #dynamicTutorialLink3, #mobileDynamicTutorialLink, #btnTutorial', async function (e) {
        e.preventDefault();
        const loadIdx = layui.layer.load(2, { shade: [0.3, '#fff'] });
        try {
            const res = await fetchPost('/API/Web/Config/GetConfigsByKeys', ['tutorial_link']);
            layui.layer.close(loadIdx);
            if (res && res.code === 200 && res.data && res.data['tutorial_link']) {
                window.open(res.data['tutorial_link'], '_blank');
            } else {
                layui.layer.msg('未获取到教程链接');
            }
        } catch (err) {
            layui.layer.close(loadIdx);
            layui.layer.msg('获取教程链接失败');
            console.error(err);
        }
    });

    // Intercept clicks on protected menus and try now button
    $(document).on('click', 'a[href="chat.shtml"], a[href="token.shtml"], a[href="pricing.shtml"], a[href="agent.shtml"]', function (e) {
        const userId = getUserId();
        // 已登录
        if (userId) {
            return true;
        }
        e.preventDefault();
        showLoginModal('请先登录');
        return false;
    });

    // Handle clicks on direct login links
    $(document).on('click', 'a[href="login.shtml"], #authBtns', function (e) {
        e.preventDefault();
        showLoginModal();
        return false;
    });
});
