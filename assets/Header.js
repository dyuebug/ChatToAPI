let laytpl, laydropdown;
let listUser;

const renderUser = (user) => {
    if (!user) {
        $("[data-anonymous]").removeClass("layui-hide");
        return;
    }
    $("[data-user]").removeClass("layui-hide");
    $("[data-nick-name]").html(user.nickName);
    $("[data-nick-name-area] span").html(user.nickName);
    let emailTitle;
    if (user.email) {
        $("[data-email] span").html(user.email);
        emailTitle = "换绑邮箱";
        $("[data-action='changeEmail']").html(emailTitle);
    } else {
        $("[data-email] span").html("未绑定");
        emailTitle = "Chatopens安全邮箱绑定";
        $("[data-action='changeEmail']").html(emailTitle);
    }
    $("[data-action='changeEmail']").attr("onclick", "$('.layui-dropdown').hide();showEmailDialog('" + emailTitle + "');");
    $("[data-exp-time] span").html(user.expTime);
}

const initUser = () => {
    loadUser((user) => {
        listUser = user;
        renderUser(user);
    });
}

const actionHeaderHandler = (action) => {
    switch (action) {
        case "qrCodeLogin":
            openLoginDialog();
            break;
        case "cancel":
            layer.closeAll();
            break;
        case "AutoCar":
        case "AutoVIPCar":
        case "AutoFreeCar":
            if (!validateLogin()) {
                return;
            }
            autoCarLogin(action);
            break;
        case "Agent":
            if (!validateLogin()) {
                return;
            }
            goToPage("/Web/Agent.html");
            break;
    }
}

$(document).on("click", ".list-header [data-action]", function (e) {
    e.stopPropagation();
    const action = $(this).attr("data-action");
    actionHeaderHandler(action);
});

const weChatInit = () => {
    fetchPost("/API/Web/WeChat/Init");
}

layui.use(function () {
    laytpl = layui.laytpl;
    laydropdown = layui.dropdown;
    laydropdown.render({
        elem: "#btnTopUser",
        content: `<div class="layui-row">
                        <span class="layui-btn layui-btn-primary layui-btn-radius width" data-nick-name-area>会员昵称：<span></span></span>
                    </div>
                    <div class="layui-row">
                        <span class="layui-btn layui-btn-primary layui-btn-radius width" data-exp-time>会员到期：<span></span></span>
                    </div>
                    <div class="layui-row">
                        <span class="layui-btn layui-btn-primary layui-btn-radius width" data-email>电子邮箱：<span></span></span>
                    </div>
                    <div class="layui-row">
                        <button type="button" class="layui-btn layui-btn-primary layui-btn-radius" onclick="$('.layui-dropdown').hide();showOrderListDialog(this);">订单记录</button>
                        <button type="button" class="layui-btn layui-btn-primary layui-btn-radius" data-action="changeEmail"></button>
                        <button type="button" class="layui-btn layui-bg-orange layui-btn-radius" onclick="goToPage('/API/Web/User/DoLogout');">退出登录</button>
                    </div>`,
        className: "list-dropdown-tabs",
        ready: function () {
            renderUser(listUser);
        }
    });
    initUser();
    weChatInit();
});