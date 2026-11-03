$(document).ready(function () {
    initBalanceCard();

    function initBalanceCard() {
        if ($('#balanceOverviewBand').length > 0) {
            loadBalanceCard();
            return;
        }

        waitForBalanceOverviewBand(loadBalanceCard);
    }

    function loadBalanceCard() {
        fetchGet('/API/Web/User/GetBalance')
            .then(res => {
                if (res.code !== 200 || !res.data) {
                    return;
                }

                var data = res.data;
                $('#balanceQuota').text(`$${formatQuotaValue(getBalanceValue(data, 'quota'))}`);
                $('#balanceUsedQuota').text(`$${formatQuotaValue(getBalanceValue(data, 'usedQuota'))}`);
                $('#balanceRequestNum').text(formatRequestCount(getBalanceValue(data, 'requestNum')));
            })
            .catch(error => {
                console.error('Failed to load balance card', error);
            });
    }

    function formatQuotaValue(value) {
        var number = Number(value || 0);
        if (Number.isNaN(number)) {
            return '0';
        }

        return number.toLocaleString('en-US', {
            maximumFractionDigits: 6
        });
    }

    function formatRequestCount(value) {
        var number = Number(value || 0);
        if (Number.isNaN(number)) {
            return '0';
        }

        return number.toLocaleString('en-US');
    }

    function getBalanceValue(data, camelCaseName) {
        if (!data || typeof data !== 'object') {
            return 0;
        }

        var camelCaseValue = data[camelCaseName];
        if (camelCaseValue !== undefined && camelCaseValue !== null) {
            return camelCaseValue;
        }

        var pascalCaseName = camelCaseName.charAt(0).toUpperCase() + camelCaseName.slice(1);
        var pascalCaseValue = data[pascalCaseName];
        if (pascalCaseValue !== undefined && pascalCaseValue !== null) {
            return pascalCaseValue;
        }

        return 0;
    }

    function waitForBalanceOverviewBand(callback) {
        var retryCount = 0;
        var maxRetryCount = 10;
        var retryTimer = window.setInterval(function () {
            if ($('#balanceOverviewBand').length > 0) {
                window.clearInterval(retryTimer);
                callback();
                return;
            }

            retryCount++;
            if (retryCount >= maxRetryCount) {
                window.clearInterval(retryTimer);
            }
        }, 300);
    }
});
