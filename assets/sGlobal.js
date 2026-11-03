const containsHttpOrHttps = () => {
    const protocol  = window.location.protocol;
    return ["http:","https:"].includes(protocol);
}

const getFullUrl = (url) => {
    if (url.startsWith("http")) {
        return url;
    }
    return containsHttpOrHttps() ? url : `http://localhost:8306${url}`;
}

const getToken = () => {
    let token = localStorage.getItem("token");
    if (token) {
        // 去除可能存在的前后双引号
        if (token.startsWith('"') && token.endsWith('"')) {
            token = token.substring(1, token.length - 1);
        }
    }
    return token;
}

const fetchGet = (url) => {
    url = getFullUrl(url);
    const token = getToken();
    const headers = token ? { "Authorization": "Bearer " + token } : {};
    return fetch(url, { headers })
            .then(response => response.json());
}

const fetchPost = (url, data, headers) => {
    url = getFullUrl(url);
    const defaultHeaders = {
        "Content-Type": "application/json",
    };
    
    const token = getToken();
    if (token) {
        defaultHeaders["Authorization"] = "Bearer " + token;
    }

    headers = { ...defaultHeaders, ...headers };

    const fetchConfig =
    {
        method: "POST",
        headers: headers,
    };

    if (data !== null) {
        fetchConfig.body = JSON.stringify(data);
    }

    return fetch(url, fetchConfig)
        .then(response => response.json());
}

const goToPage = (url) => {
    const win = window == window.top ? window : window.top;
    win.location.href = url;
}

const reloadPage = () => {
    const win = window == window.top ? window : window.top;
    win.location.reload()
}

const getCookie = (name) => {
    let match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    if (match) return decodeURIComponent(match[2]);
    return null;
}

const setCookie = (name, value) => {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/`;
}

const removeCookie = (name) => {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

const getTime = () => {
    return new Date().getTime();
}

const isMobile = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent);
}

const isWeChat = () => {
    var userAgent = navigator.userAgent.toLowerCase();
    return userAgent.match(/MicroMessenger/i) == "micromessenger";
}

const getQueryParam = (name) => {
    const query = window.location.search.substring(1); // ȥ����ͷ�� '?'
    const vars = query.split('&');
    for (let i = 0; i < vars.length; i++) {
        const pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) === name) {
            return decodeURIComponent(pair[1]);
        }
    }
    return null; 
}