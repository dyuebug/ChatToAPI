const filterState = {
    provider: "all",
    billing: "all",
    group: "all",
    keyword: "",
    sort: "name"
};

const providerKeyMap = {
    xAI: "xai",
    OpenAI: "openai",
    Anthropic: "anthropic",
    Google: "google"
};

const billingTextMap = {
    all: "全部收费",
    fixed: "按次收费",
    token: "按量收费"
};

let enhancedModels = [];
let dbGroups = [];

const loadDbGroups = async () => {
    try {
        const res = await fetchGet("/API/Web/Group/GetList");
        if (res && res.code === 200 && res.data) {
            dbGroups = res.data;
        }
    } catch (e) {
        console.error("获取收费组失败", e);
    }
};

const getProviderKey = (provider) => {
    return providerKeyMap[provider] || "default";
};

const getMatchedGroup = (model) => {
    const modelName = model.modelName || "";
    
    // 优先匹配指定了该模型的组
    let matched = dbGroups.find(g => {
        if (!g.models) return false;
        try {
            const models = JSON.parse(g.models);
            return models.includes(modelName);
        } catch(e) {
            return false;
        }
    });

    if (matched) return matched;

    // 如果没有明确匹配的，寻找“全部模型”（可用模型为空的组）
    matched = dbGroups.find(g => !g.models || g.models === "[]" || g.models === "");
    
    if (matched) return matched;

    // 默认回退
    return {
        name: "其它",
        description: "通用模型能力",
        ratio: 1,
        inputRatio: 1,
        outRatio: 1,
        cacheInputRatio: 1,
        cacheOutRatio: 1
    };
};

const getMatchedGroups = (model) => {
    const modelName = model.modelName || "";
    let matched = [];
    
    // 匹配明确指定了该模型的组
    const specificGroups = dbGroups.filter(g => {
        if (!g.models) return false;
        try {
            const models = JSON.parse(g.models);
            return models.includes(modelName);
        } catch(e) {
            return false;
        }
    });
    matched.push(...specificGroups);

    // 寻找“全部模型”（可用模型为空的组）
    const allModelsGroups = dbGroups.filter(g => !g.models || g.models === "[]" || g.models === "");
    matched.push(...allModelsGroups);

    if (matched.length === 0) {
        matched.push({
            name: "其它",
            tag: "默认",
            description: "通用模型能力",
            ratio: 1,
            inputRatio: 1,
            outRatio: 1,
            cacheInputRatio: 1,
            cacheOutRatio: 1
        });
    }
    
    return matched;
};

const formatValue = (value, suffix = "") => {
    if (value === null || value === undefined || value === "") {
        return "-";
    }

    const number = Number(value);
    if (Number.isNaN(number)) {
        return "-";
    }

    // 这里如果之前也是取整的，我们可以顺便去掉取整，或者保持原样
    // 根据需求，这里也保留小数比较好
    return `${Number(number.toFixed(6))} ${suffix}`;
};

const getActualValue = (value, multiplier) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const parsedValue = Number(value);
    if (Number.isNaN(parsedValue) || !multiplier) {
        return parsedValue;
    }

    // 保留小数，不使用 Math.round 取整，最多保留 6 位小数以防止浮点数精度问题
    const result = parsedValue * multiplier;
    return Number(result.toFixed(6));
};

const getPriceGroup = (model) => {
    const modelName = model.modelName || "";
    
    // 优先匹配指定了该模型且名称不为“默认分组”的组
    let matched = dbGroups.find(g => {
        if (g.name === "默认分组") return false;
        if (!g.models) return false;
        try {
            const models = JSON.parse(g.models);
            return models.includes(modelName);
        } catch(e) {
            return false;
        }
    });

    if (matched) return matched;

    // 如果没有明确匹配的，寻找“全部模型”且名称不为“默认分组”的组
    matched = dbGroups.find(g => g.name !== "默认分组" && (!g.models || g.models === "[]" || g.models === ""));
    
    if (matched) return matched;

    // 默认回退
    return {
        ratio: 1,
        inputRatio: 1,
        outRatio: 1,
        cacheInputRatio: 1,
        cacheOutRatio: 1
    };
};

const buildEnhancedModels = () => {
    enhancedModels = MODEL_LIST.map(model => {
        const group = getMatchedGroup(model);
        const priceGroup = getPriceGroup(model);
        const groupName = group.name;
        const providerKey = getProviderKey(model.provider);
        const billingType = model.type === "fixed" ? "fixed" : "token";

        return {
            ...model,
            providerKey,
            groupName,
            group,
            billingType,
            billingText: billingType === "fixed" ? "按次收费" : "按量收费",
            summaryDesc: group.description || "通用模型能力",
            searchText: `${model.modelName || ""} ${model.provider || ""} ${billingTextMap[billingType]} ${groupName}`.toLowerCase(),
            actualInputPrice: getActualValue(model.inputPrice, group.ratio || group.inputRatio || 1),
            actualOutPrice: getActualValue(model.outPrice, group.ratio || group.outRatio || 1),
            actualCacheInputPrice: getActualValue(model.cacheInputPrice, group.ratio || group.cacheInputRatio || 1),
            actualCacheOutPrice: getActualValue(model.cacheOutPrice, group.ratio || group.cacheOutRatio || 1),
            actualNumber: getActualValue(model.number, group.ratio || group.inputRatio || 1),
            displayInputPrice: getActualValue(model.inputPrice, priceGroup.ratio || priceGroup.inputRatio || 1),
            displayOutPrice: getActualValue(model.outPrice, priceGroup.ratio || priceGroup.outRatio || 1),
            displayCacheInputPrice: getActualValue(model.cacheInputPrice, priceGroup.ratio || priceGroup.cacheInputRatio || 1),
            displayCacheOutPrice: getActualValue(model.cacheOutPrice, priceGroup.ratio || priceGroup.cacheOutRatio || 1),
            displayNumber: getActualValue(model.number, priceGroup.ratio || priceGroup.inputRatio || 1)
        };
    });
};

const getSortedModels = (models) => {
    const list = [...models];
    list.sort((a, b) => {
        if (filterState.sort === "input-asc") {
            const aValue = a.billingType === "fixed" ? Number(a.displayNumber || 0) : Number(a.displayInputPrice || 0);
            const bValue = b.billingType === "fixed" ? Number(b.displayNumber || 0) : Number(b.displayInputPrice || 0);
            return aValue - bValue;
        }

        if (filterState.sort === "output-asc") {
            const aValue = a.billingType === "fixed" ? Number(a.displayNumber || 0) : Number(a.displayOutPrice || 0);
            const bValue = b.billingType === "fixed" ? Number(b.displayNumber || 0) : Number(b.displayOutPrice || 0);
            return aValue - bValue;
        }

        return (a.modelName || "").localeCompare(b.modelName || "");
    });

    return list;
};

const getFilteredModels = () => {
    const keyword = filterState.keyword.trim().toLowerCase();

    return enhancedModels.filter(model => {
        const matchKeyword = !keyword || model.searchText.includes(keyword);
        const matchProvider = filterState.provider === "all" || model.provider === filterState.provider;
        const matchBilling = filterState.billing === "all" || model.billingType === filterState.billing;
        const matchGroup = filterState.group === "all" || model.groupName === filterState.group;
        return matchKeyword && matchProvider && matchBilling && matchGroup;
    });
};

const getFilterSummary = () => {
    const summaryItems = [];

    if (filterState.provider !== "all") {
        summaryItems.push(filterState.provider);
    }

    if (filterState.billing !== "all") {
        summaryItems.push(billingTextMap[filterState.billing]);
    }

    if (filterState.group !== "all") {
        summaryItems.push(`${filterState.group}`);
    }

    return summaryItems.length ? summaryItems.join(" / ") : "全部模型";
};

const renderFilterGroup = (containerId, filterType, items) => {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    layui.use(["laytpl"], () => {
        const laytpl = layui.laytpl;
        const template = document.getElementById("filterOptionTpl").innerHTML;
        laytpl(template).render({ filterType, items }, html => {
            container.innerHTML = html;
        });
    });
};

const renderFilters = () => {
    const keyword = filterState.keyword.trim().toLowerCase();

    // 预先计算除了当前维度外的过滤结果，用于动态统计数量
    const baseFilter = (model, skipProvider = false, skipBilling = false, skipGroup = false) => {
        const matchKeyword = !keyword || model.searchText.includes(keyword);
        const matchProvider = skipProvider || filterState.provider === "all" || model.provider === filterState.provider;
        const matchBilling = skipBilling || filterState.billing === "all" || model.billingType === filterState.billing;
        const matchGroup = skipGroup || filterState.group === "all" || model.groupName === filterState.group;
        return matchKeyword && matchProvider && matchBilling && matchGroup;
    };

    const modelsForProvider = enhancedModels.filter(m => baseFilter(m, true, false, false));
    const modelsForBilling = enhancedModels.filter(m => baseFilter(m, false, true, false));
    const modelsForGroup = enhancedModels.filter(m => baseFilter(m, false, false, true));

    const providerOptions = [
        { value: "all", label: "全部供应商", count: modelsForProvider.length, active: filterState.provider === "all" },
        ...[...new Set(enhancedModels.map(item => item.provider).filter(Boolean))].map(provider => ({
            value: provider,
            label: provider,
            count: modelsForProvider.filter(item => item.provider === provider).length,
            active: filterState.provider === provider
        }))
    ];

    const billingOptions = [
        { value: "all", label: "全部收费", count: modelsForBilling.length, active: filterState.billing === "all" },
        { value: "fixed", label: "按次收费", count: modelsForBilling.filter(item => item.billingType === "fixed").length, active: filterState.billing === "fixed" },
        { value: "token", label: "按量收费", count: modelsForBilling.filter(item => item.billingType === "token").length, active: filterState.billing === "token" }
    ];

    const groupOptions = [
        { value: "all", label: "全部收费组", count: modelsForGroup.length, active: filterState.group === "all" },
        ...[...new Set(enhancedModels.map(item => item.groupName))].map(group => {
            const groupInfo = dbGroups.find(g => g.name === group);
            const ratio = groupInfo ? (groupInfo.ratio || groupInfo.inputRatio || 1) : 1;
            return {
                value: group,
                label: group,
                count: `x${ratio}`,
                active: filterState.group === group
            };
        })
    ];

    renderFilterGroup("providerFilterList", "provider", providerOptions);
    renderFilterGroup("billingFilterList", "billing", billingOptions);
    renderFilterGroup("groupFilterList", "group", groupOptions);
};

const renderTable = (models) => {
    const tableBody = document.getElementById("modelTableBody");
    if (!tableBody) {
        return;
    }

    layui.use(["laytpl"], () => {
        const laytpl = layui.laytpl;
        const template = document.getElementById("modelTableTpl").innerHTML;
        laytpl(template).render(models, html => {
            tableBody.innerHTML = html;
        });
    });
};

const renderGrid = (models) => {
    const grid = document.getElementById("modelGrid");
    if (!grid) {
        return;
    }

    layui.use(["laytpl"], () => {
        const laytpl = layui.laytpl;
        const template = document.getElementById("modelCardTpl").innerHTML;
        laytpl(template).render(models, html => {
            grid.innerHTML = html;
        });
    });
};

const renderResultState = (models) => {
    $("#resultCount").text(models.length);
    $("#activeFilter").text(getFilterSummary());
    $("#emptyState").toggleClass("show", models.length === 0);
};

const refreshView = () => {
    const filteredModels = getSortedModels(getFilteredModels());
    renderGrid(filteredModels);
    renderResultState(filteredModels);
};

const resetFilters = () => {
    filterState.provider = "all";
    filterState.billing = "all";
    filterState.group = "all";
    filterState.keyword = "";
    filterState.sort = "name";

    $("#modelSearch").val("");
    $("#sortSelect").val("name");

    renderFilters();
    refreshView();
};

const showToast = (message = "模型名称已复制") => {
    const toast = document.getElementById("toast");
    if (!toast) {
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(window.__modelToastTimer);
    window.__modelToastTimer = window.setTimeout(() => {
        toast.classList.remove("show");
    }, 1600);
};

const openDrawer = (modelName) => {
    const model = enhancedModels.find(item => item.modelName === modelName);
    if (!model) {
        return;
    }

    const drawerLogo = document.getElementById("drawerLogo");
    drawerLogo.className = `drawer-logo model-provider-icon--${model.providerKey}`;
    drawerLogo.innerHTML = model.icon || "";

    $("#drawerName").text(model.modelName || "");
    $("#drawerProvider").text(model.provider || "");
    $("#drawerBillingType").text(model.billingType === "fixed" ? "按次计费" : "按量计费");
    
    if (model.description) {
        $("#drawerDesc").text(model.description).show();
    } else {
        $("#drawerDesc").hide();
    }
    
    if (model.billingType === "fixed") {
        $("#drawerPricesFixed").show();
        $("#drawerPricesToken").hide();
        $("#drawerFixedPrice").text(model.number !== undefined && model.number !== null ? model.number : 0);
    } else {
        $("#drawerPricesFixed").hide();
        $("#drawerPricesToken").show();
        $("#drawerInput").text(model.inputPrice !== undefined && model.inputPrice !== null ? model.inputPrice : 0);
        $("#drawerOutput").text(model.outPrice !== undefined && model.outPrice !== null ? model.outPrice : 0);
        
        const cacheOut = model.cacheOutPrice !== undefined && model.cacheOutPrice !== null ? parseFloat(model.cacheOutPrice) : 0;
        const cacheIn = model.cacheInputPrice !== undefined && model.cacheInputPrice !== null ? parseFloat(model.cacheInputPrice) : 0;
        const showCacheOut = cacheOut > 0;
        const showCacheIn = cacheIn > 0;
        
        $("#drawerRead").text(cacheIn);
        $("#drawerWrite").text(cacheOut);
        
        if (showCacheIn) {
            $("#drawerReadContainer").show();
            if (!showCacheOut) {
                $("#drawerReadContainer").addClass("full-width");
            } else {
                $("#drawerReadContainer").removeClass("full-width");
            }
        } else {
            $("#drawerReadContainer").hide();
            $("#drawerReadContainer").removeClass("full-width");
        }
        
        if (showCacheOut) {
            $("#drawerWriteContainer").show();
            if (!showCacheIn) {
                $("#drawerWriteContainer").addClass("full-width");
            } else {
                $("#drawerWriteContainer").removeClass("full-width");
            }
        } else {
            $("#drawerWriteContainer").hide();
            $("#drawerWriteContainer").removeClass("full-width");
        }
    }
    
    // 渲染匹配的所有收费组
    const groups = getMatchedGroups(model);
    layui.use(["laytpl"], () => {
        const laytpl = layui.laytpl;
        const template = document.getElementById("drawerGroupTpl").innerHTML;
        laytpl(template).render({ groups, model }, html => {
            document.getElementById("drawerGroupsContainer").innerHTML = html;
        });
    });

    $("#metaName").text(model.modelName || "");
    $("#metaProvider").text(model.provider || "");
    $("#metaBilling").text(model.billingType === "fixed" ? "按次收费" : "按量收费");
    $("#drawerCopy").attr("data-copy", model.modelName || "");

    $("#drawerLayer").addClass("open").attr("aria-hidden", "false");
    $("body").addClass("drawer-open");
};

const closeDrawer = () => {
    $("#drawerLayer").removeClass("open").attr("aria-hidden", "true");
    $("body").removeClass("drawer-open");
};

const initEvents = () => {
    $("#modelSearch").on("input", function() {
        filterState.keyword = $(this).val() || "";
        refreshView();
    });

    $("#sortSelect").on("change", function() {
        filterState.sort = $(this).val() || "name";
        refreshView();
    });

    $("#resetBtn, #emptyReset").on("click", function() {
        resetFilters();
    });

    $(document).on("click", ".group", function() {
        const filterType = $(this).attr("data-filter-type");
        const filterValue = $(this).attr("data-filter-value");
        if (!filterType) {
            return;
        }

        filterState[filterType] = filterValue !== undefined && filterValue !== null ? filterValue : "all";
        renderFilters();
        refreshView();
    });

    $(document).on("click", "[data-action='copy']", async function(event) {
        event.preventDefault();
        event.stopPropagation();

        const modelName = $(this).data("model") || $(this).attr("data-copy");
        if (!modelName) {
            return;
        }

        try {
            await navigator.clipboard.writeText(modelName);
            showToast();
        } catch (error) {
            console.error("复制模型名称失败", error);
        }
    });

    $(document).on("click", ".model-card", function() {
        openDrawer($(this).data("model"));
    });

    $(document).on("click", "[data-action='details']", function(event) {
        event.preventDefault();
        event.stopPropagation();
        openDrawer($(this).data("model"));
    });

    $("#drawerCopy").on("click", async function() {
        const modelName = $(this).attr("data-copy");
        if (!modelName) {
            return;
        }

        try {
            await navigator.clipboard.writeText(modelName);
            showToast();
        } catch (error) {
            console.error("复制模型名称失败", error);
        }
    });

    $("#drawerClose, #drawerBackdrop").on("click", function() {
        closeDrawer();
    });

    $(document).on("keydown", function(event) {
        if (event.key === "Escape" && $("#drawerLayer").hasClass("open")) {
            closeDrawer();
        }
    });
};

$(async () => {
    await loadDbGroups();
    await loadModels();
    buildEnhancedModels();
    renderFilters();
    refreshView();
    initEvents();
});
