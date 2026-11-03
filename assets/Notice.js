const loadParam = () => {
    const data = [
        {
            KeyName: "RightTopNotification"
        }
    ];
    fetchPost("/API/Web/Param/GetParamList", data, {}).then(responseJson => {
        if (responseJson.code != 200) {
            layer.msg(responseJson.msg);
            return;
        }
        const paramList = responseJson.data;
        paramList.forEach((param) => {
            $(`#div${param.keyName}`).html(param.data);
        });
    });
}

const setNoticeReminder = () => {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem("NoticeReminder", today);
}
$(document).on("click", "#btnToday", function () {
    setNoticeReminder();
    window.parent.closeIframeDialog();
});

$(document).on("click", "#btnClose", function () {
    window.parent.closeIframeDialog();
});

$(function () {
    loadParam();
});