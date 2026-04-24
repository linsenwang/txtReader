#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const net = require('net');

const args = process.argv.slice(2);
let targetDir = process.cwd();

// 解析参数：第一个非选项参数作为目录
if (args.length > 0 && !args[0].startsWith('-')) {
    targetDir = path.resolve(args[0]);
}

if (!fs.existsSync(targetDir)) {
    console.error(`❌ 错误: 目录不存在: ${targetDir}`);
    process.exit(1);
}

if (!fs.statSync(targetDir).isDirectory()) {
    console.error(`❌ 错误: 不是目录: ${targetDir}`);
    process.exit(1);
}

// 检查端口是否已被占用（先尝试连接，再尝试绑定）
function isPortInUse(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(500);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, '127.0.0.1');
    });
}

// 查找可用端口
async function findAvailablePort(startPort = 3000) {
    const inUse = await isPortInUse(startPort);
    if (inUse) {
        return findAvailablePort(startPort + 1);
    }
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(startPort, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                findAvailablePort(startPort + 1).then(resolve).catch(reject);
            } else {
                reject(err);
            }
        });
    });
}

// 等待服务启动
function waitForServer(port, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const check = () => {
            const socket = new net.Socket();
            socket.setTimeout(500);
            socket.once('connect', () => {
                socket.destroy();
                resolve();
            });
            socket.once('error', () => {
                socket.destroy();
                if (Date.now() - startTime > timeout) {
                    reject(new Error('等待服务启动超时'));
                } else {
                    setTimeout(check, 300);
                }
            });
            socket.connect(port, '127.0.0.1');
        };
        check();
    });
}

async function main() {
    const port = await findAvailablePort();
    const hashesFile = path.join(targetDir, '.txtreader_progress.json');

    console.log('📖 txtReader 临时阅读器');
    console.log(`📁 目录: ${targetDir}`);
    console.log(`🌐 端口: ${port}`);
    console.log('启动中...\n');

    const env = {
        ...process.env,
        PRO_DIR: targetDir,
        PORT: String(port),
        HOST: '127.0.0.1',
        HASHES_FILE: hashesFile
    };

    const serverProcess = spawn('node', [path.join(__dirname, 'server.js')], {
        env,
        stdio: 'inherit',
        cwd: __dirname
    });

    try {
        await waitForServer(port);
        const url = `http://127.0.0.1:${port}`;
        console.log(`\n✅ 服务已启动: ${url}`);
        console.log('按 Ctrl+C 停止服务\n');

        const platform = process.platform;
        let openCmd;
        if (platform === 'darwin') {
            openCmd = 'open';
        } else if (platform === 'win32') {
            openCmd = 'start';
        } else {
            openCmd = 'xdg-open';
        }

        spawn(openCmd, [url], { detached: true, stdio: 'ignore' }).unref();
    } catch (err) {
        console.error('⚠️ 服务启动检查失败，请手动打开浏览器');
    }

    process.on('SIGINT', () => {
        console.log('\n🛑 正在停止服务...');
        serverProcess.kill('SIGINT');
    });

    serverProcess.on('close', (code) => {
        process.exit(code);
    });
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
