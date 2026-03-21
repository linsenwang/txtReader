const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const app = express();
app.use(express.static(__dirname));

// 动态导入 EPUB 模块（ESM 模块）
let EPub;
async function loadEpubModule() {
    if (!EPub) {
        const epubModule = await import('epub');
        EPub = epubModule.EPub;
    }
    return EPub;
}

// 配置选项
const PROGRESS_ONLY = process.env.PROGRESS_ONLY === 'true';
const REMOTE_SERVER_URL = process.env.REMOTE_SERVER_URL || '';
const baseDirectory = process.env.PRO_DIR ? path.resolve(process.env.PRO_DIR) : '';

// 列出 pro 目录下的所有文件，按修改时间排序
app.get('/list-files', (req, res) => {
    if (PROGRESS_ONLY) {
        return res.status(503).json({ error: '此服务器仅提供阅读进度服务，不提供内容服务' });
    }

    const requestedDir = req.query.dir || '';
    console.log('发送的文件列表：', requestedDir);
    const directoryPath = path.join(baseDirectory, requestedDir);

    if (!directoryPath.startsWith(baseDirectory)) {
        return res.status(403).send('访问被拒绝');
    }

    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            console.error('无法扫描目录：', err);
            return res.status(500).send('无法扫描目录：' + err);
        }

        const fileList = files
            .filter(file => !file.startsWith('.'))
            .map(file => {
                const filePath = path.join(directoryPath, file);
                const stats = fs.statSync(filePath);
                return { name: file, mtime: stats.mtime };
            })
            .sort((a, b) => b.mtime - a.mtime);

        res.json(fileList);
    });
});

// 读取文件内容
app.get('/file-content', (req, res) => {
    if (PROGRESS_ONLY) {
        return res.status(503).send('此服务器仅提供阅读进度服务，不提供内容服务');
    }

    const fileName = req.query.name;
    if (!fileName) {
        return res.status(400).send('未提供文件名');
    }

    const filePath = path.join(baseDirectory, fileName);
    if (!filePath.startsWith(baseDirectory)) {
        return res.status(403).send('访问被拒绝');
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('读取文件失败：', err);
            return res.status(500).send('读取文件失败');
        }
        res.send(data);
    });
});

// EPUB 信息接口
app.get('/epub-info', async (req, res) => {
    if (PROGRESS_ONLY) {
        return res.status(503).json({ error: '此服务器仅提供阅读进度服务，不提供内容服务' });
    }

    const fileName = req.query.name;
    if (!fileName) {
        return res.status(400).json({ error: '未提供文件名' });
    }

    const filePath = path.join(baseDirectory, fileName);
    if (!filePath.startsWith(baseDirectory)) {
        return res.status(403).json({ error: '访问被拒绝' });
    }

    try {
        const EPubClass = await loadEpubModule();
        const epub = new EPubClass(filePath);
        
        await new Promise((resolve, reject) => {
            epub.on('end', resolve);
            epub.on('error', reject);
            epub.parse();
        });

        // 统计段落数量（简化处理）
        let totalParagraphs = 0;
        const chapters = [];
        
        epub.flow.forEach((chapter, index) => {
            chapters.push({
                id: chapter.id,
                title: chapter.title || `章节 ${index + 1}`,
                index: index
            });
        });

        // 估算总段落数
        totalParagraphs = chapters.length * 100; // 粗略估算

        res.json({
            title: epub.metadata.title,
            author: epub.metadata.creator,
            totalParagraphs: totalParagraphs,
            chapters: chapters
        });
    } catch (err) {
        console.error('EPUB 解析失败:', err);
        res.status(500).json({ error: 'EPUB 解析失败' });
    }
});

// EPUB 分段内容接口
app.get('/epub-content', async (req, res) => {
    if (PROGRESS_ONLY) {
        return res.status(503).json({ error: '此服务器仅提供阅读进度服务，不提供内容服务' });
    }

    const fileName = req.query.name;
    const startParagraph = parseInt(req.query.start) || 0;
    
    if (!fileName) {
        return res.status(400).json({ error: '未提供文件名' });
    }

    const filePath = path.join(baseDirectory, fileName);
    if (!filePath.startsWith(baseDirectory)) {
        return res.status(403).json({ error: '访问被拒绝' });
    }

    try {
        const EPubClass = await loadEpubModule();
        const epub = new EPubClass(filePath);
        
        await new Promise((resolve, reject) => {
            epub.on('end', resolve);
            epub.on('error', reject);
            epub.parse();
        });

        // 简化处理：返回章节内容
        const batchSize = 50;
        const endParagraph = Math.min(startParagraph + batchSize, epub.flow.length);
        
        let content = '';
        for (let i = startParagraph; i < endParagraph && i < epub.flow.length; i++) {
            const chapter = epub.flow[i];
            content += `<h2>${chapter.title || '章节 ' + (i + 1)}</h2>\n`;
            content += `<p data-index="${i}">[章节内容占位]</p>\n`;
        }

        res.json({
            startParagraph: startParagraph,
            endParagraph: endParagraph,
            content: content,
            hasMore: endParagraph < epub.flow.length
        });
    } catch (err) {
        console.error('EPUB 内容获取失败:', err);
        res.status(500).json({ error: 'EPUB 内容获取失败' });
    }
});

// 服务器配置
app.get('/server-config', (req, res) => {
    res.json({
        progressOnly: PROGRESS_ONLY,
        remoteServerUrl: REMOTE_SERVER_URL
    });
});

// 进度记录
const progressStore = new Map();

app.post('/log-middle-p-index', express.json(), (req, res) => {
    const { fileName, middlePIndex } = req.body;
    if (!fileName || middlePIndex === undefined) {
        return res.status(400).json({ error: '参数缺失' });
    }
    
    const key = fileName;
    const existing = progressStore.get(key);
    const newValue = existing ? Math.max(existing, middlePIndex) : middlePIndex;
    progressStore.set(key, newValue);
    
    res.json({ success: true, maxValue: newValue });
});

app.get('/get-progress', (req, res) => {
    const fileName = req.query.name;
    if (!fileName) {
        return res.status(400).json({ error: '未提供文件名' });
    }
    
    const progress = progressStore.get(fileName);
    res.json({ progress: progress || null });
});

// 查找证书文件
function findCertFiles() {
    const files = fs.readdirSync(__dirname);
    const certFile = files.find(f => f.includes('192.168') && f.endsWith('.pem') && !f.includes('-key'));
    const keyFile = files.find(f => f.includes('192.168') && f.endsWith('-key.pem'));
    
    if (certFile && keyFile) {
        return {
            cert: path.join(__dirname, certFile),
            key: path.join(__dirname, keyFile)
        };
    }
    return null;
}

const certs = findCertFiles();

if (!certs) {
    console.error('\n❌ 未找到 HTTPS 证书文件！');
    console.log('\n请按以下步骤操作：');
    console.log('1. 安装 mkcert:  brew install mkcert');
    console.log('2. 安装本地 CA:  mkcert -install');
    console.log('3. 生成证书:     mkcert 192.168.1.116 localhost 127.0.0.1 ::1');
    console.log('\n然后在 iPhone 上安装生成的 .pem 文件（通过 AirDrop 或邮件）');
    console.log('设置 → 通用 → VPN与设备管理 → 安装描述文件\n');
    process.exit(1);
}

const options = {
    cert: fs.readFileSync(certs.cert),
    key: fs.readFileSync(certs.key)
};

const PORT = 3443;
https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
    console.log(`✅ HTTPS Server running on https://192.168.1.116:${PORT}`);
    console.log(`📱 请在 iPhone Safari 中访问上述地址`);
    console.log(`⚠️  确保已在 iPhone 上安装并信任证书\n`);
});
