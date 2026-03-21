// 阅读进度同步管理器 - 简化版
(function() {
    'use strict';
    
    class ProgressSync {
        constructor() {
            this.init();
        }

        async init() {
            this.setupNetworkListeners();
        }

        setupNetworkListeners() {
            window.addEventListener('online', () => {
                console.log('[ProgressSync] 网络已连接，开始同步...');
                this.syncAll();
            });
        }

        // 保存进度
        async saveProgress(fileName, progress, serverUrl = '') {
            // 保存到 localStorage
            localStorage.setItem(`progress_${fileName}`, JSON.stringify({
                progress,
                timestamp: Date.now()
            }));

            // 如果在线，立即同步到服务器
            if (navigator.onLine) {
                await this.syncToServer(fileName, progress, serverUrl);
            }
        }

        // 同步到服务器
        async syncToServer(fileName, progress, serverUrl = '') {
            const baseUrl = serverUrl || window.location.origin;
            const apiUrl = `${baseUrl}/log-middle-p-index`;
            
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileName, middlePIndex: progress })
                });
                
                if (response.ok) {
                    console.log('[ProgressSync] 同步成功:', fileName, progress);
                    return true;
                }
            } catch (err) {
                console.log('[ProgressSync] 同步失败:', err.message);
            }
            return false;
        }

        // 获取进度（优先本地）
        getProgress(fileName) {
            try {
                const saved = localStorage.getItem(`progress_${fileName}`);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    return parsed.progress;
                }
            } catch (e) {}
            return null;
        }

        // 获取最优进度（比较本地和服务器）
        async getBestProgress(fileName, serverUrl = '') {
            const localProgress = this.getProgress(fileName);
            
            if (!navigator.onLine) return localProgress;
            
            // 获取服务器进度
            const baseUrl = serverUrl || window.location.origin;
            const url = `${baseUrl}/get-progress?name=${encodeURIComponent(fileName)}`;
            
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data.progress !== null) {
                        // 服务器进度更大，更新本地
                        if (data.progress > (localProgress || 0)) {
                            localStorage.setItem(`progress_${fileName}`, JSON.stringify({
                                progress: data.progress,
                                timestamp: Date.now()
                            }));
                            return data.progress;
                        }
                    }
                }
            } catch (err) {}
            
            return localProgress;
        }

        // 同步所有未同步的（简化版）
        async syncAll() {
            // 简化版不批量同步
        }
    }

    window.progressSync = new ProgressSync();
})();
