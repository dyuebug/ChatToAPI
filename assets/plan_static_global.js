const isLocalhost = () => {
    const hostname = window.location.hostname;
    return hostname === 'localhost';
}

const getFullUrl = (url) => {
    if (url.startsWith("http")) {
        return url;
    }
    return isLocalhost() ? `http://localhost:2026${url}` : url;
}

const fetchGet = (url) => {
    url = getFullUrl(url);
    return fetch(url)
        .then(response => response.json());
}

const fetchPost = (url, data, headers) => {
    url = getFullUrl(url);
    const defaultHeaders = {
        "Content-Type": "application/json",
    };

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
    const query = window.location.search.substring(1);
    const vars = query.split('&');
    for (let i = 0; i < vars.length; i++) {
        const pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) === name) {
            return decodeURIComponent(pair[1]);
        }
    }
    return null;
}

// 格式化金额 (分转元)
const formatFenToYuan = (fen) => {
    if (fen === null || fen === undefined) return '0';
    return parseFloat((parseFloat(fen) / 100).toFixed(2)).toString();
}

const formatMoney = (fen) => {
    if (fen === null || fen === undefined || isNaN(fen)) return '0';
    return parseFloat((parseFloat(fen) / 100).toFixed(2)).toString();
}

const formatDate = (dateStr, format = 'yyyy-MM-dd HH:mm:ss') => {
    if (!dateStr) return '-';
    if (typeof layui !== 'undefined' && layui.util && layui.util.toDateString) {
        return layui.util.toDateString(dateStr, format);
    }
    // fallback
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    
    const pad = n => n < 10 ? '0' + n : n;
    const yyyy = date.getFullYear();
    const MM = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const HH = pad(date.getHours());
    const mm = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    
    if (format === 'yyyy-MM-dd HH:mm:ss') {
        return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
    }
    if (format === 'yyyy-MM-dd') {
        return `${yyyy}-${MM}-${dd}`;
    }
    return dateStr;
}