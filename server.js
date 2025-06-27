const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const app = express();
app.use(express.static(__dirname));

// const directoryPath = path.resolve('/home/yangqian/Dev/txtReader/pro');
const baseDirectory = path.resolve(process.env.PRO_DIR);


// 列出 pro 目录下的所有文件，按修改时间排序
app.get('/list-files', (req, res) => {
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
app.get('/file-content', (req, res) => {
    const fileName = req.query.name;

    if (!fileName) {
        return res.status(400).send('未提供文件名');
    }

    console.log('实际文件：', fileName);
    // const sanitizedFileName = path.basename(fileName);
    const sanitizedFileName = decodeURIComponent(fileName);
    const filePath = path.join(baseDirectory, sanitizedFileName);
    if (!filePath.startsWith(baseDirectory)) {
        return res.status(400).send('非法路径');
    }

    console.log('实际文件路径：', filePath);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('读取文件出错：', err);
            return res.status(500).send('无法读取文件：' + err);
        }
        res.send(data);
        // console.log(data);
});
});

app.use(express.json());
const CryptoJS = require('crypto-js');

app.post('/log-middle-p-index', (req, res) => {
    const { fileName, middlePIndex } = req.body;

    if (!fileName || middlePIndex === undefined) {
        return res.status(400).json({ error: '缺少必要的参数' });
    }

    console.log(`接收到来自文件 ${fileName} 的索引：`, middlePIndex);

    const hash = CryptoJS.MD5(fileName).toString(CryptoJS.enc.Hex);
    console.log(`计算出的 hash: ${hash}`);

    fs.readFile('hashes.json', 'utf8', (err, fileData) => {
        let hashes = {};

        if (!err && fileData) {
            try {
                hashes = JSON.parse(fileData);
            } catch (parseErr) {
                console.error('JSON 解析错误:', parseErr);
            }
        }

        // 获取当前存储的值
        const storedValue = hashes[hash] !== undefined ? hashes[hash] : Number.NEGATIVE_INFINITY;

        // 取较大的值
        const maxValue = Math.max(storedValue, middlePIndex);
        hashes[hash] = maxValue;

        fs.writeFile('hashes.json', JSON.stringify(hashes, null, 2), (err) => {
            if (err) {
                return res.status(500).json({ error: '保存数据时发生错误' });
            }
            res.json({ message: '数据已接收并存储', hash, maxValue });
        });
    });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

app.listen(PORT, HOST, () => {
  console.log(`服务器已启动：http://${HOST}:${PORT}`);
});
