const express = require('express');
const fs = require('fs');
const path = require('path');
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
const PROGRESS_ONLY = process.env.PROGRESS_ONLY === 'true'; // 是否仅作为进度服务器（不提供内容服务）
const REMOTE_SERVER_URL = process.env.REMOTE_SERVER_URL || ''; // 远端服务器地址，用于获取内容
const baseDirectory = process.env.PRO_DIR ? path.resolve(process.env.PRO_DIR) : '';


// 列出 pro 目录下的所有文件，按修改时间排序
app.get('/list-files', (req, res) => {
    // 如果是仅进度服务器模式，返回错误
    if (PROGRESS_ONLY) {
        return res.status(503).json({ error: '此服务器仅提供阅读进度服务，不提供内容服务' });
    }

    const requestedDir = req.query.dir || ''; // 获取请求的目录参数
    console.log('发送的文件列表：', requestedDir);
    const directoryPath = path.join(baseDirectory, requestedDir); // 拼接路径

    // 确保请求的目录在 baseDirectory 内，防止访问系统其他目录
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
                return {
                    name: file,
                    mtime: stats.mtime.getTime()
                };
            });

        fileList.sort((a, b) => b.mtime - a.mtime);
        // console.log('发送的文件列表：', fileList);
        res.json(fileList);
    });
});

// 获取指定文件内容
app.get('/file-content', async (req, res) => {
    // 如果是仅进度服务器模式，返回错误
    if (PROGRESS_ONLY) {
        return res.status(503).json({ error: '此服务器仅提供阅读进度服务，不提供内容服务' });
    }

    const fileName = req.query.name;

    if (!fileName) {
        return res.status(400).send('未提供文件名');
    }

    console.log('实际文件：', fileName);
    const sanitizedFileName = decodeURIComponent(fileName);
    const filePath = path.join(baseDirectory, sanitizedFileName);
    if (!filePath.startsWith(baseDirectory)) {
        return res.status(400).send('非法路径');
    }

    console.log('实际文件路径：', filePath);

    // 检查是否为 EPUB 文件（使用解码后的文件名）
    if (sanitizedFileName.toLowerCase().endsWith('.epub')) {
        return await readEpubFile(filePath, res);
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('读取文件出错：', err);
            return res.status(500).send('无法读取文件：' + err);
        }
        res.send(data);
    });
});

// EPUB 缓存：存储解析后的章节信息
const epubCache = new Map();

// 清理 HTML 标签，保留纯文本
function cleanHtmlContent(html) {
    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
}

// 将文本分割成段落
function splitIntoParagraphs(text) {
    // 按空行分割段落
    return text.split(/\n\s*\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0);
}

// 解析 EPUB 文件，缓存章节信息
async function parseEpubToCache(filePath) {
    const cacheKey = filePath;
    
    // 检查缓存
    if (epubCache.has(cacheKey)) {
        return epubCache.get(cacheKey);
    }
    
    console.log('解析 EPUB 到缓存：', filePath);
    
    const EpubClass = await loadEpubModule();
    const epub = new EpubClass(filePath);
    await epub.parse();
    
    if (!epub.flow || epub.flow.length === 0) {
        return null;
    }
    
    // 解析所有章节，记录段落映射
    const chapters = [];
    let globalParagraphIndex = 0;
    
    for (let i = 0; i < epub.flow.length; i++) {
        const chapter = epub.flow[i];
        try {
            const html = await epub.getChapter(chapter.id);
            const textContent = cleanHtmlContent(html);
            
            if (textContent) {
                const paragraphs = splitIntoParagraphs(textContent);
                const startParagraphIndex = globalParagraphIndex;
                const endParagraphIndex = globalParagraphIndex + paragraphs.length - 1;
                
                chapters.push({
                    index: i,
                    id: chapter.id,
                    title: chapter.title || '',
                    paragraphs: paragraphs,
                    startParagraphIndex: startParagraphIndex,
                    endParagraphIndex: endParagraphIndex,
                    paragraphCount: paragraphs.length
                });
                
                globalParagraphIndex += paragraphs.length;
            }
        } catch (err) {
            console.warn(`获取章节 ${chapter.id} 失败：`, err.message);
        }
    }
    
    const cacheData = {
        filePath,
        chapters,
        totalParagraphs: globalParagraphIndex,
        title: path.basename(filePath, '.epub') || '无标题'
    };
    
    epubCache.set(cacheKey, cacheData);
    console.log(`EPUB 解析完成：${chapters.length} 章节，${globalParagraphIndex} 段落`);
    
    return cacheData;
}

// 获取段落范围对应的章节内容
function getParagraphsContent(epubData, startParagraph, endParagraph) {
    const result = [];
    
    for (const chapter of epubData.chapters) {
        // 检查章节是否与请求的段落范围有交集
        if (chapter.endParagraphIndex < startParagraph || chapter.startParagraphIndex > endParagraph) {
            continue;
        }
        
        // 计算章节内需要提取的段落范围
        const chapterStart = Math.max(0, startParagraph - chapter.startParagraphIndex);
        const chapterEnd = Math.min(chapter.paragraphs.length - 1, endParagraph - chapter.startParagraphIndex);
        
        if (chapterStart <= chapterEnd) {
            const selectedParagraphs = chapter.paragraphs.slice(chapterStart, chapterEnd + 1);
            result.push({
                chapterIndex: chapter.index,
                chapterTitle: chapter.title,
                paragraphs: selectedParagraphs,
                startGlobalIndex: chapter.startParagraphIndex + chapterStart,
                endGlobalIndex: chapter.startParagraphIndex + chapterEnd
            });
        }
    }
    
    return result;
}

// 将段落内容格式化为 Markdown
function formatParagraphsToMarkdown(chapterContents, includeTitle = true) {
    let result = '';
    
    for (const content of chapterContents) {
        if (content.chapterTitle && includeTitle) {
            result += `## ${content.chapterTitle}\n\n`;
        }
        
        for (let i = 0; i < content.paragraphs.length; i++) {
            const para = content.paragraphs[i];
            const globalIndex = content.startGlobalIndex + i;
            // 添加段落标记，方便前端识别
            result += `<p data-index="${globalIndex}">${para}</p>\n\n`;
        }
    }
    
    return result;
}

// 读取 EPUB 文件内容（完整内容，兼容旧接口）
async function readEpubFile(filePath, res) {
    console.log('开始解析 EPUB 文件：', filePath);
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
        console.error('EPUB 文件不存在：', filePath);
        return res.status(404).send('EPUB 文件不存在');
    }
    
    try {
        const epubData = await parseEpubToCache(filePath);
        
        if (!epubData || epubData.chapters.length === 0) {
            return res.send('# ' + (path.basename(filePath, '.epub') || '无标题') + '\n\n（此 EPUB 文件没有可读内容）');
        }
        
        // 返回完整内容
        const allContent = getParagraphsContent(epubData, 0, epubData.totalParagraphs - 1);
        const markdown = formatParagraphsToMarkdown(allContent);
        
        console.log('EPUB 内容提取完成，长度：', markdown.length);
        res.send(markdown);
        
    } catch (err) {
        console.error('读取 EPUB 文件出错：', err);
        res.status(500).send('无法读取 EPUB 文件：' + err.message);
    }
}

// EPUB 分段加载接口：获取总信息
app.get('/epub-info', async (req, res) => {
    if (PROGRESS_ONLY) {
        return res.status(503).json({ error: '此服务器仅提供阅读进度服务，不提供内容服务' });
    }
    
    const fileName = decodeURIComponent(req.query.name || '');
    if (!fileName || !fileName.toLowerCase().endsWith('.epub')) {
        return res.status(400).json({ error: '无效的 EPUB 文件名' });
    }
    
    const filePath = path.join(baseDirectory, fileName);
    if (!filePath.startsWith(baseDirectory)) {
        return res.status(400).json({ error: '非法路径' });
    }
    
    try {
        const epubData = await parseEpubToCache(filePath);
        
        if (!epubData) {
            return res.status(404).json({ error: 'EPUB 文件无法解析' });
        }
        
        // 返回基本信息和章节映射
        res.json({
            title: epubData.title,
            totalParagraphs: epubData.totalParagraphs,
            totalChapters: epubData.chapters.length,
            chapters: epubData.chapters.map(c => ({
                index: c.index,
                title: c.title,
                startParagraphIndex: c.startParagraphIndex,
                endParagraphIndex: c.endParagraphIndex,
                paragraphCount: c.paragraphCount
            }))
        });
        
    } catch (err) {
        console.error('获取 EPUB 信息出错：', err);
        res.status(500).json({ error: '无法读取 EPUB 文件：' + err.message });
    }
});

// EPUB 分段加载接口：获取指定段落范围的内容
app.get('/epub-content', async (req, res) => {
    if (PROGRESS_ONLY) {
        return res.status(503).json({ error: '此服务器仅提供阅读进度服务，不提供内容服务' });
    }
    
    const fileName = decodeURIComponent(req.query.name || '');
    const startParagraph = parseInt(req.query.start) || 0;
    const endParagraph = parseInt(req.query.end);
    
    if (!fileName || !fileName.toLowerCase().endsWith('.epub')) {
        return res.status(400).json({ error: '无效的 EPUB 文件名' });
    }
    
    const filePath = path.join(baseDirectory, fileName);
    if (!filePath.startsWith(baseDirectory)) {
        return res.status(400).json({ error: '非法路径' });
    }
    
    try {
        const epubData = await parseEpubToCache(filePath);
        
        if (!epubData) {
            return res.status(404).json({ error: 'EPUB 文件无法解析' });
        }
        
        // 默认返回一个批次的内容（约50个段落）
        const batchSize = 50;
        const actualEnd = endParagraph || Math.min(startParagraph + batchSize - 1, epubData.totalParagraphs - 1);
        
        const contents = getParagraphsContent(epubData, startParagraph, actualEnd);
        const markdown = formatParagraphsToMarkdown(contents);
        
        res.json({
            startParagraph,
            endParagraph: actualEnd,
            hasMore: actualEnd < epubData.totalParagraphs - 1,
            totalParagraphs: epubData.totalParagraphs,
            content: markdown
        });
        
    } catch (err) {
        console.error('获取 EPUB 分段内容出错：', err);
        res.status(500).json({ error: '无法读取 EPUB 文件：' + err.message });
    }
});

const CryptoJS = require('crypto-js');
const { Mutex } = require('async-mutex'); // 引入 Mutex

app.use(express.json());

const fsp = require('fs').promises;
const fileMutex = new Mutex();

app.post('/log-middle-p-index', async (req, res) => { // 将路由处理函数标记为 async
    const { fileName, middlePIndex } = req.body;

    if (!fileName || middlePIndex === undefined) {
        return res.status(400).json({ error: '缺少必要的参数' });
    }

    console.log(`接收到来自文件 ${fileName} 的索引：`, middlePIndex);

    const hash = CryptoJS.MD5(fileName).toString(CryptoJS.enc.Hex);
    console.log(`计算出的 hash: ${hash}`);

    // 使用互斥锁确保对文件读写操作的原子性
    try {
        await fileMutex.runExclusive(async () => {
            let hashes = {};

            try {
                // 使用 fsp.readFile 而不是 fs.readFile
                const fileData = await fsp.readFile('hashes.json', 'utf8');
                if (fileData) {
                    hashes = JSON.parse(fileData);
                }
            } catch (err) {
                if (err.code === 'ENOENT') {
                    console.log('hashes.json 文件不存在，将创建新文件。');
                }
                else if (err instanceof SyntaxError) {
                    console.error('JSON 解析错误，hashes.json 文件可能已损坏:', err);
                }
                else {
                    console.error('读取 hashes.json 文件时发生错误:', err);
                    // 如果这里需要中断请求，请确保 res.status(...) 被调用
                    // return res.status(500).json({ error: '读取数据时发生错误' });
                }
            }

            // 获取当前存储的值
            const storedValue = hashes[hash] !== undefined ? hashes[hash] : Number.NEGATIVE_INFINITY;

            // 如果请求中包含 force: true，则直接覆盖，否则取较大的值
            const valueToStore = req.body.force ? middlePIndex : Math.max(storedValue, middlePIndex);
            hashes[hash] = valueToStore;

            try {
                // 使用 fsp.writeFile 而不是 fs.writeFile
                await fsp.writeFile('hashes.json', JSON.stringify(hashes, null, 2));
                // 成功写入后发送响应
                res.json({ message: '数据已接收并存储', hash, maxValue: valueToStore });
            } catch (writeErr) {
                console.error('保存数据时发生错误:', writeErr);
                // 写入失败时发送错误响应
                res.status(500).json({ error: '保存数据时发生错误' });
            }
        });
    } catch (mutexErr) {
        console.error('处理请求时发生未知错误:', mutexErr);
        if (!res.headersSent) {
            res.status(500).json({ error: '内部服务器错误' });
        }
    }
});


// 获取进度数据接口（供远端服务器查询）
app.get('/get-progress', (req, res) => {
    const fileName = req.query.name;

    if (!fileName) {
        return res.status(400).json({ error: '未提供文件名' });
    }

    const hash = require('crypto-js').MD5(fileName).toString(require('crypto-js').enc.Hex);
    
    try {
        const fileData = fs.readFileSync('hashes.json', 'utf8');
        const hashes = JSON.parse(fileData);
        const progress = hashes[hash];
        
        if (progress !== undefined) {
            res.json({ fileName, hash, progress });
        } else {
            res.json({ fileName, hash, progress: null });
        }
    } catch (err) {
        if (err.code === 'ENOENT') {
            res.json({ fileName, hash, progress: null });
        } else {
            console.error('读取进度数据时发生错误:', err);
            res.status(500).json({ error: '读取进度数据时发生错误' });
        }
    }
});

// 获取服务器配置信息（供前端使用）
app.get('/server-config', (req, res) => {
    res.json({
        progressOnly: PROGRESS_ONLY,
        remoteServerUrl: REMOTE_SERVER_URL
    });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

app.listen(PORT, HOST, () => {
    console.log(`服务器已启动：http://${HOST}:${PORT}`);
    if (PROGRESS_ONLY) {
        console.log('模式：仅进度服务器（不提供内容服务）');
    } else {
        console.log('模式：完整服务器');
    }
    if (REMOTE_SERVER_URL) {
        console.log(`远端进度服务器：${REMOTE_SERVER_URL}`);
    }
});
