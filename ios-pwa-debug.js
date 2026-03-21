// iOS PWA 调试工具 - 静默模式，仅控制台输出
(function() {
    'use strict';
    
    const logs = [];
    
    function log(msg, type = 'info') {
        const entry = `[${new Date().toLocaleTimeString()}] [${type}] ${msg}`;
        logs.push(entry);
        console.log(entry);
    }
    
    // 检测运行环境
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    
    log(`环境检测: iOS=${isIOS}, Standalone=${isStandalone}, Safari=${isSafari}`, 'info');
    
    // 检测 Service Worker 支持
    if ('serviceWorker' in navigator) {
        log('Service Worker 支持: 是', 'success');
        
        navigator.serviceWorker.ready.then(registration => {
            log('SW 已激活，scope: ' + registration.scope, 'success');
        }).catch(err => {
            log('SW ready 失败: ' + err.message, 'error');
        });
        
        if (navigator.serviceWorker.controller) {
            log('当前页面被 SW 控制', 'success');
        } else {
            log('当前页面未被 SW 控制', 'warning');
        }
    } else {
        log('Service Worker 支持: 否', 'error');
    }
    
    // 检测缓存
    if ('caches' in window) {
        caches.keys().then(names => {
            log('缓存列表: ' + (names.length ? names.join(', ') : '无'), names.length ? 'success' : 'warning');
        });
    }
    
    // 网络状态
    log(`网络状态: ${navigator.onLine ? '在线' : '离线'}`, navigator.onLine ? 'success' : 'warning');
    
    // 如果是 PWA 模式
    if (isStandalone) {
        log('PWA 模式运行', 'success');
    } else if (isIOS) {
        log('Safari 浏览器模式', 'info');
    }
    
    window.iosPwaLogs = logs;
})();
