let laytpl;
let tplPackageItemHtml;

const imgList = [
    "img/package-1.jpg",
    "img/package-2.png",
    "img/package-3.png",
    "img/package-4.png",
    "img/package-5.png",
    "img/package-6.png",
    "img/package-10.png",
    "img/package-8.png",
    "img/package-9.png"
];

const loadPackageList = (callback) => {
    fetchGet("/API/Web/Package/GetPackageList").then(responseJson => {
        if (responseJson.code != 200) {
            layer.msg(responseJson.msg);
            return;
        }
        callback(responseJson.data);
    });
}

const loadPackageListHtml = () => {
    loadPackageList((packageList) => {
        const packageListHtmlArray = [];
        packageList.forEach((package, index) => {
            package.img = imgList[index];
            package.showBadge = ["480F7B92EC9A795042B0B918F02D1F39", "33303E1EAD59A1C12B31657F9E283BFB","E041C126B0EB20AD73B673294D30BE66"].includes(package.packageId);
            laytpl(tplPackageItemHtml).render(package, function (html) {
                packageListHtmlArray.push(html);
            });
        });
        $("#divPackageList").html(packageListHtmlArray.join(""));
    });
}

$(document).on("click", "[data-package-id]", function () {
    const packageId = $(this).attr("data-package-id");
    submitOrder(packageId);
});

const loadParam = () => {
    const data = [
        {
            KeyName: "SubscribeNotification"
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

layui.use(function () {
    laytpl = layui.laytpl;
    tplPackageItemHtml = $("#tplPackageItem").html();
    loadPackageListHtml();
    loadParam();
});